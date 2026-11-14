const activeWorkers = new Set();
export const getActiveWorkerCount = () => activeWorkers.size;

export function compile(input, { signal, timeoutMs = 600000, onPhase = () => {} } = {}) {
    const started = performance.now();
    const failure = (status, message) => ({ status, exitCode: null, stdout: [], stderr: [message], artifacts: {}, elapsedMs: performance.now() - started });
    const entries = Object.entries(input?.files ?? {});
    if (!entries.length || entries.some(([name, text]) => !/^[a-zA-Z][a-zA-Z0-9_]*\.e$/.test(name) || typeof text !== 'string') ||
        !Object.hasOwn(input.files, input.rootClass) || !Number.isFinite(timeoutMs) || timeoutMs <= 0)
        return Promise.resolve(failure('invalid_input', 'Provide .e basenames, source text, a submitted root filename, and a positive timeout.'));
    if (signal?.aborted) return Promise.resolve(failure('cancelled', 'Compilation cancelled.'));
    return new Promise(resolve => {
        let worker, timer, finished = false, phase = 'loading';
        const finish = result => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
            worker?.terminate();
            activeWorkers.delete(worker);
            resolve({ ...result, elapsedMs: performance.now() - started });
        };
        const abort = () => finish(failure('cancelled', 'Compilation cancelled.'));
        try {
            worker = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' });
            activeWorkers.add(worker);
            worker.onmessage = ({ data }) => {
                if (data.type === 'phase') {
                    phase = data.phase;
                    try { onPhase(data.phase); } catch (error) { finish(failure('runtime_error', String(error))); }
                } else if (data.type === 'result') finish(data.result);
            };
            worker.onerror = event => { event.preventDefault(); finish(failure(phase === 'loading' ? 'initialization_error' : 'runtime_error', event.message)); };
            worker.onmessageerror = () => finish(failure('runtime_error', 'Cannot read compiler worker response.'));
            signal?.addEventListener('abort', abort, { once: true });
            timer = setTimeout(() => finish(failure('timed_out', 'Compiler deadline exceeded.')), timeoutMs);
            worker.postMessage(input);
        } catch (error) { finish(failure('initialization_error', String(error))); }
    });
}
