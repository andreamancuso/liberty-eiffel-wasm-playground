import { useCallback, useEffect, useRef, useState } from "react";
import { runtimeReady, type RunResult } from "../runtime";
import type { Project } from "../projects";
import { phaseMessages, statusMessages } from "../run-status";

export function useRun() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Ready.");
  const [stdout, setStdout] = useState("");
  const [stderr, setStderr] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [showDownloadNote, setShowDownloadNote] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const running = useRef(false);

  useEffect(() => {
    runtimeReady
      .then(() => setReady(true))
      .catch(() =>
        setStatus("Could not load the playground. Please refresh the page."),
      );
    return () => controller.current?.abort();
  }, []);
  const clear = useCallback(() => {
    setResult(null);
    setStdout("");
    setStderr("");
    setStatus("Ready.");
    setDownloadPercent(null);
  }, []);
  const stop = () => controller.current?.abort();
  const run = async (project: Project) => {
    if (running.current || !ready) return;
    running.current = true;
    setBusy(true);
    clear();
    setStatus("Preparing…");
    controller.current = new AbortController();
    try {
      const runtime = await runtimeReady;
      runtime.lastResult = null;
      const completed = await runtime.buildAndRun(
        {
          files: { ...project.files },
          rootClass: project.rootClass,
          stdin: project.stdin,
        },
        {
          signal: controller.current.signal,
          onPhase: (phase) => {
            setDownloadPercent(null);
            setStatus(phaseMessages[phase] ?? "Compiling…");
          },
          onProgress: ({ loadedBytes, totalBytes }) => {
            if (totalBytes === null) {
              setDownloadPercent(null);
              return;
            }
            setDownloadPercent(
              Math.min(100, Math.floor((100 * loadedBytes) / totalBytes)),
            );
          },
          onOutput: (text, fd) => {
            if (fd === 2) setStderr((previous) => previous + text);
            else setStdout((previous) => previous + text);
          },
        },
      );
      runtime.lastResult = completed;
      setResult(completed);
      if (completed.status === "success") setShowDownloadNote(false);
      setStdout(completed.stdout);
      setStderr(completed.stderr);
      setStatus(
        `${statusMessages[completed.status] ?? "Your program could not be compiled."} · ${(completed.elapsedMs / 1000).toFixed(2)} s`,
      );
    } catch {
      setStatus("Could not prepare the playground. Please try again.");
    } finally {
      running.current = false;
      controller.current = null;
      setBusy(false);
      setDownloadPercent(null);
    }
  };
  return {
    ready,
    busy,
    status,
    stdout,
    stderr,
    result,
    downloadPercent,
    showDownloadNote,
    clear,
    stop,
    run,
  };
}
export type Execution = ReturnType<typeof useRun>;
