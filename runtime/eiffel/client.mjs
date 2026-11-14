import { requestWorker } from "../worker-request.mjs";
import { validateInput } from "./input.mjs";
export { getActiveWorkerCount } from "../worker-request.mjs";

export function compile(
  input,
  { signal, timeoutMs = 600000, onPhase = () => {} } = {},
) {
  const failure = (status, message) => ({
    status,
    exitCode: null,
    stdout: [],
    stderr: [message],
    artifacts: {},
  });
  try {
    validateInput(input);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
      throw new Error("Provide a positive timeout.");
  } catch (error) {
    return Promise.resolve({
      ...failure("invalid_input", error.message),
      elapsedMs: 0,
    });
  }
  return requestWorker(new URL("./worker.mjs", import.meta.url), input, {
    signal,
    timeoutMs,
    onPhase,
    initialPhase: "loading",
    failure,
  });
}
