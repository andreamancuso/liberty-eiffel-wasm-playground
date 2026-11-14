const activeWorkers = new Set();
export const getActiveWorkerCount = () => activeWorkers.size;

// Workers are single-use. Completion can race with Stop or a deadline, so only
// the first terminal event wins; every exit path uses the same cleanup.
export function requestWorker(
  url,
  input,
  {
    signal,
    timeoutMs,
    initialPhase,
    transfer = [],
    onPhase = () => {},
    onProgress = () => {},
    onOutput = () => {},
    failure = (status, message) => ({ status, exitCode: null, error: message }),
  },
) {
  const started = performance.now();
  return new Promise((resolve) => {
    let worker;
    let timer;
    let finished = false;
    let phase = initialPhase;
    let stdout = "";
    let stderr = "";
    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      worker?.terminate();
      activeWorkers.delete(worker);
      resolve({
        phase,
        stdout,
        stderr,
        ...result,
        elapsedMs: performance.now() - started,
      });
    };
    const abort = () => finish(failure("cancelled", "Compilation cancelled."));
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      worker = new Worker(url, { type: "module" });
      activeWorkers.add(worker);
      worker.onmessage = ({ data }) => {
        if (finished) return;
        try {
          switch (data.type) {
            case "phase":
              phase = data.phase;
              onPhase(phase);
              break;
            case "progress":
              onProgress(data.progress);
              break;
            case "output":
              if (data.fd === 2) stderr += data.text;
              else stdout += data.text;
              onOutput(data.text, data.fd);
              break;
            case "result":
              finish(data.result);
              break;
          }
        } catch (error) {
          finish(failure("runtime_error", String(error)));
        }
      };
      worker.onerror = (event) => {
        event.preventDefault();
        const status = /^(loading|preparing)/.test(phase)
          ? "initialization_error"
          : "runtime_error";
        finish(failure(status, event.message));
      };
      worker.onmessageerror = () =>
        finish(failure("runtime_error", "Cannot read worker response."));
      signal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(
        () => finish(failure("timed_out", "Compiler deadline exceeded.")),
        timeoutMs,
      );
      worker.postMessage(input, transfer);
    } catch (error) {
      finish(failure("initialization_error", String(error)));
    }
  });
}
