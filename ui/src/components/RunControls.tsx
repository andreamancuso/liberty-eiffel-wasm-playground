import type { Project } from "../projects";
import type { Execution } from "../hooks/useRun";
interface Props {
  project: Project;
  execution: Execution;
  reset: () => void;
  update: (transform: (project: Project) => Project) => void;
  run: () => void;
}
export function RunControls({ project, execution, reset, update, run }: Props) {
  const { busy, ready, status, downloadPercent, showDownloadNote, stop } =
    execution;
  return (
    <>
      <label className="input-label" htmlFor="stdin">
        Input <span className="muted">optional</span>
      </label>
      <textarea
        id="stdin"
        value={project.stdin}
        readOnly={busy}
        spellCheck={false}
        onChange={(event) =>
          update((current) => ({ ...current, stdin: event.target.value }))
        }
      />
      <div className="run-toolbar">
        <button
          id="run"
          className="primary"
          disabled={busy || !ready}
          onClick={run}
        >
          Run <span aria-hidden="true">▶</span>
        </button>
        <button id="stop" disabled={!busy} onClick={stop}>
          Stop
        </button>
        <button className="reset" disabled={busy} onClick={reset}>
          Reset
        </button>
        <div className="run-status">
          <p id="status" role="status">
            {status}
          </p>
          {busy && downloadPercent !== null && (
            <span className="download-percent" aria-hidden="true">
              {downloadPercent}%
            </span>
          )}
        </div>
      </div>
      {busy && (
        <div
          id="run-progress"
          className={`run-progress${downloadPercent === null ? " indeterminate" : ""}`}
          role="progressbar"
          aria-labelledby="status"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={downloadPercent ?? undefined}
        >
          <span
            style={
              downloadPercent === null
                ? undefined
                : { width: `${downloadPercent}%` }
            }
          />
        </div>
      )}
      {showDownloadNote && (
        <p id="download-note" className="download-note">
          The first run downloads around 25 MB of compiler tools. Everything
          runs in your browser.
        </p>
      )}
    </>
  );
}
