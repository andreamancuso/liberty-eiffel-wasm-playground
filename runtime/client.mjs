import { compile, getActiveWorkerCount as frontendWorkers } from './runtime/eiffel/client.mjs';
const workers = new Set();
export const getActiveWorkerCount = () => workers.size + frontendWorkers();

function request(data, { signal, timeoutMs, onPhase, onOutput, onProgress }, transfer = []) {
    return new Promise(resolve => {
        let worker, timer, done = false, phase = data.action === 'build' ? 'loading_backend' : 'loading_program';
        let stdout = '', stderr = '';
        const finish = result => {
            if (done) return; done = true;
            clearTimeout(timer); signal?.removeEventListener('abort', abort);
            worker?.terminate(); workers.delete(worker);
            resolve({ phase, stdout, stderr, ...result });
        };
        const abort = () => finish({ status: 'cancelled', exitCode: null });
        if (signal?.aborted) { abort(); return; }
        try {
            worker = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' }); workers.add(worker);
            worker.onmessage = ({ data }) => {
                if (done) return;
                try {
                    if (data.type === 'phase') { phase = data.phase; onPhase(phase); }
                    if (data.type === 'progress') onProgress(data.progress);
                    if (data.type === 'output') {
                        if (data.fd === 2) stderr += data.text; else stdout += data.text;
                        onOutput(data.text, data.fd);
                    }
                    if (data.type === 'result') finish(data.result);
                } catch (error) { finish({ status: 'runtime_error', error: String(error) }); }
            };
            worker.onerror = event => { event.preventDefault(); finish({ status: /^(loading|preparing)_/.test(phase) ? 'initialization_error' : 'runtime_error', error: event.message }); };
            worker.onmessageerror = () => finish({ status: 'runtime_error', error: 'Invalid worker response.' });
            signal?.addEventListener('abort', abort, { once: true });
            timer = setTimeout(() => finish({ status: 'timed_out', exitCode: null }), timeoutMs);
            worker.postMessage(data, transfer);
        } catch (error) { finish({ status: 'initialization_error', error: String(error) }); }
    });
}

export async function buildAndRun(input, { signal, onPhase = () => {}, onOutput = () => {}, onProgress = () => {}, buildTimeoutMs = 600000, runTimeoutMs = 10000 } = {}) {
    const started = performance.now(), timings = {}, phases = [];
    let previous = started, phase = 'loading_frontend';
    const progress = value => {
        const now = performance.now();
        timings[phase] = (timings[phase] ?? 0) + now - previous;
        previous = now; phase = value; phases.push(value); onPhase(value);
    };
    const finish = result => {
        timings[phase] = (timings[phase] ?? 0) + performance.now() - previous;
        return { exitCode: null, stdout: '', stderr: '', ...result, phase: result.phase ?? phase, timings, phases, elapsedMs: performance.now() - started };
    };
    if (typeof (input?.stdin ?? '') !== 'string' || !Number.isFinite(buildTimeoutMs) || buildTimeoutMs <= 0 || !Number.isFinite(runTimeoutMs) || runTimeoutMs <= 0)
        return finish({ status: 'invalid_input', diagnostics: 'Input and deadlines are invalid.', artifacts: {} });
    const front = await compile(input, { signal, timeoutMs: buildTimeoutMs,
        onPhase: value => progress(value === 'loading' ? 'loading_frontend' : 'eiffel_compile') });
    if (front.status !== 'success') return finish({ status: front.status, exitCode: front.exitCode, diagnostics: [...front.stdout, ...front.stderr].join('\n'), artifacts: {} });
    const remaining = buildTimeoutMs - (performance.now() - started);
    if (remaining <= 0) return finish({ status: 'timed_out', artifacts: front.artifacts });
    const back = await request({ action: 'build', artifacts: front.artifacts }, { signal, timeoutMs: remaining, onPhase: progress, onOutput, onProgress });
    const common = { artifacts: front.artifacts, diagnostics: back.diagnostics ?? back.error ?? '', memories: { frontend: front.linearMemoryBytes, ...back.memories }, frontendResources: front.resources, backendResources: back.resources };
    if (back.status !== 'success') return finish({ ...common, ...back, wasm: undefined });
    const wasmBytes = back.wasm.byteLength;
    const result = await request({ action: 'execute', wasm: back.wasm, stdin: input.stdin ?? '' },
        { signal, timeoutMs: runTimeoutMs, onPhase: progress, onOutput, onProgress }, [back.wasm]);
    return finish({ ...common, ...result, wasmBytes });
}
