import { compile } from "./eiffel/client.mjs";
import { requestWorker } from "./worker-request.mjs";
export { getActiveWorkerCount } from "./worker-request.mjs";

function request(data, options, transfer = []) {
  const initialPhase =
    data.action === "build" ? "loading_backend" : "loading_program";
  return requestWorker(new URL("./worker.mjs", import.meta.url), data, {
    ...options,
    initialPhase,
    transfer,
  });
}

export async function buildAndRun(
  input,
  {
    signal,
    onPhase = () => {},
    onOutput = () => {},
    onProgress = () => {},
    buildTimeoutMs = 600000,
    runTimeoutMs = 10000,
  } = {},
) {
  const started = performance.now(),
    timings = {},
    phases = [];
  let previous = started,
    phase = "loading_frontend";
  const progress = (value) => {
    const now = performance.now();
    timings[phase] = (timings[phase] ?? 0) + now - previous;
    previous = now;
    phase = value;
    phases.push(value);
    onPhase(value);
  };
  const finish = (result) => {
    timings[phase] = (timings[phase] ?? 0) + performance.now() - previous;
    return {
      exitCode: null,
      stdout: "",
      stderr: "",
      ...result,
      phase: result.phase ?? phase,
      timings,
      phases,
      elapsedMs: performance.now() - started,
    };
  };
  if (
    typeof (input?.stdin ?? "") !== "string" ||
    !Number.isFinite(buildTimeoutMs) ||
    buildTimeoutMs <= 0 ||
    !Number.isFinite(runTimeoutMs) ||
    runTimeoutMs <= 0
  )
    return finish({
      status: "invalid_input",
      diagnostics: "Input and deadlines are invalid.",
      artifacts: {},
    });
  const eiffelResult = await compile(input, {
    signal,
    timeoutMs: buildTimeoutMs,
    onPhase: (value) =>
      progress(value === "loading" ? "loading_frontend" : "eiffel_compile"),
  });
  if (eiffelResult.status !== "success")
    return finish({
      status: eiffelResult.status,
      exitCode: eiffelResult.exitCode,
      diagnostics: [...eiffelResult.stdout, ...eiffelResult.stderr].join("\n"),
      artifacts: {},
    });
  const remaining = buildTimeoutMs - (performance.now() - started);
  if (remaining <= 0)
    return finish({ status: "timed_out", artifacts: eiffelResult.artifacts });
  const backendResult = await request(
    { action: "build", artifacts: eiffelResult.artifacts },
    { signal, timeoutMs: remaining, onPhase: progress, onOutput, onProgress },
  );
  const common = {
    artifacts: eiffelResult.artifacts,
    diagnostics: backendResult.diagnostics ?? backendResult.error ?? "",
    memories: {
      frontend: eiffelResult.linearMemoryBytes,
      ...backendResult.memories,
    },
    frontendResources: eiffelResult.resources,
    backendResources: backendResult.resources,
  };
  if (backendResult.status !== "success")
    return finish({ ...common, ...backendResult, wasm: undefined });
  const wasmBytes = backendResult.wasm.byteLength;
  const result = await request(
    { action: "execute", wasm: backendResult.wasm, stdin: input.stdin ?? "" },
    {
      signal,
      timeoutMs: runTimeoutMs,
      onPhase: progress,
      onOutput,
      onProgress,
    },
    [backendResult.wasm],
  );
  return finish({ ...common, ...result, wasmBytes });
}
