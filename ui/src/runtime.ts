export interface RunResult {
  status: string;
  stdout: string;
  stderr: string;
  diagnostics?: string;
  error?: string;
  elapsedMs: number;
  artifacts?: Record<string, string>;
}
export interface DownloadProgress {
  phase: string;
  loadedBytes: number;
  totalBytes: number | null;
}
export interface Runtime {
  buildAndRun: (
    input: { files: Record<string, string>; rootClass: string; stdin?: string },
    options?: {
      signal?: AbortSignal;
      onPhase?: (phase: string) => void;
      onOutput?: (text: string, fd: number) => void;
      onProgress?: (progress: DownloadProgress) => void;
    },
  ) => Promise<RunResult>;
  getActiveWorkerCount: () => number;
  lastResult?: RunResult | null;
}
declare global {
  interface Window {
    playground: Runtime;
  }
}
// Keep generated runtime modules and worker-relative URLs out of Vite's graph.
const url = new URL("./runtime/client.mjs", document.baseURI).href;
export const runtimeReady: Promise<Runtime> = import(
  /* @vite-ignore */ url
).then((module) => {
  const runtime: Runtime = {
    buildAndRun: module.buildAndRun,
    getActiveWorkerCount: module.getActiveWorkerCount,
    lastResult: null,
  };
  window.playground = runtime;
  return runtime;
});
