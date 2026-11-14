import { useEffect, useRef, useState } from "react";
import { examples, type Example } from "./examples";
import {
  addFile,
  deleteFile,
  findExample,
  freshProject,
  initialSelection,
  loadWorkspace,
  modified,
  renameFile,
  storageKey,
  type Project,
} from "./projects";
import {
  contractFailure,
  sourceLocations,
  type SourceLocation,
} from "./diagnostics";
import { Editor, forgetEditors } from "./Editor";
import { runtimeReady, type RunResult } from "./runtime";

function browserStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}
const statusMessages: Record<string, string> = {
  success: "Finished",
  cancelled: "Stopped",
  timed_out: "Time limit reached",
  output_limit_exceeded: "Output limit reached",
  compiler_error: "Check your code",
  invalid_input: "Check your project",
  unsupported_feature: "Unsupported feature",
  program_error: "Your program stopped with an error",
  runtime_error: "Your program stopped unexpectedly",
  initialization_error: "Could not prepare the playground. Please try again.",
};
const phaseMessages: Record<string, string> = {
  loading_frontend: "Loading compiler…",
  loading_backend: "Loading tools…",
  preparing_backend: "Preparing compiler…",
  loading_program: "Loading program…",
  preparing_program: "Preparing program…",
  execute: "Running…",
};
type DialogKind = "add" | "rename" | "delete" | "reset";

function ProjectDialog({
  kind,
  project,
  example,
  onClose,
  onConfirm,
}: {
  kind: DialogKind;
  project: Project;
  example: Example;
  onClose: () => void;
  onConfirm: (value: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(
    kind === "rename" ? project.activeFile : "",
  );
  const [error, setError] = useState("");
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const title = {
    add: "Add a file",
    rename: "Rename file",
    delete: "Delete file?",
    reset: "Reset this project?",
  }[kind];
  return (
    <dialog ref={ref} onCancel={onClose} aria-labelledby="dialog-title">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            onConfirm(value);
          } catch (error) {
            setError(String((error as Error).message));
          }
        }}
      >
        <h2 id="dialog-title">{title}</h2>
        {kind === "add" || kind === "rename" ? (
          <>
            <label htmlFor="new-filename">Filename</label>
            <input
              id="new-filename"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="account.e"
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
            <p className="muted">
              One class per file. Renaming a file does not rename its Eiffel
              class.
            </p>
          </>
        ) : (
          <p>
            {kind === "delete"
              ? `Delete ${project.activeFile} and its contents?`
              : `Restore the original files and input for ${example.title}? Your edits to this project will be discarded.`}
          </p>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            {kind === "add"
              ? "Add file"
              : kind === "rename"
                ? "Rename"
                : kind === "delete"
                  ? "Delete"
                  : "Reset project"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default function App() {
  const [initial] = useState(() => loadWorkspace(browserStorage()));
  const [selected, setSelected] = useState(() =>
    initialSelection(location.hash, initial.workspace.selected),
  );
  const [drafts, setDrafts] = useState(initial.workspace.drafts);
  const [notice, setNotice] = useState(initial.notice);
  const [generations, setGenerations] = useState<Record<string, number>>({});
  const [notesVisible, setNotesVisible] = useState(true);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [busy, setBusy] = useState(false),
    running = useRef(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Ready.");
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [showDownloadNote, setShowDownloadNote] = useState(true);
  const [stdout, setStdout] = useState(""),
    [stderr, setStderr] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [jump, setJump] = useState<
    (SourceLocation & { serial: number }) | null
  >(null);
  const controller = useRef<AbortController | null>(null);
  const pendingHash = useRef<string | null>(null);
  const example = findExample(selected)!;
  const project = drafts[selected] ?? freshProject(example);

  const update = (transform: (current: Project) => Project) => {
    setDrafts((previous) => ({
      ...previous,
      [selected]: transform(previous[selected] ?? freshProject(example)),
    }));
  };
  const clearOutput = () => {
    setResult(null);
    setStdout("");
    setStderr("");
    setStatus("Ready.");
    setDownloadPercent(null);
    setJump(null);
  };
  const choose = (id: string) => {
    if (running.current || !findExample(id)) return;
    setSelected(id);
    clearOutput();
  };
  useEffect(() => {
    runtimeReady
      .then(() => setReady(true))
      .catch(() =>
        setStatus("Could not load the playground. Please refresh the page."),
      );
    return () => controller.current?.abort();
  }, []);
  useEffect(() => {
    const handler = () => {
      if (running.current) pendingHash.current = location.hash;
      else choose(initialSelection(location.hash, selected));
    };
    addEventListener("hashchange", handler);
    return () => removeEventListener("hashchange", handler);
  }, [selected]);
  useEffect(() => {
    if (!running.current)
      history.replaceState(null, "", `#example=${selected}`);
  }, [selected]);
  useEffect(() => {
    if (initial.notice) return; // Preserve unreadable storage instead of overwriting it.
    try {
      const storage = browserStorage();
      if (!storage) throw new Error("Storage unavailable");
      storage.setItem(
        storageKey,
        JSON.stringify({ version: 1, selected, drafts }),
      );
    } catch {
      setNotice(
        "Changes cannot be saved in this browser. You can still work in this tab.",
      );
    }
  }, [selected, drafts, initial.notice]);

  const run = async () => {
    if (running.current || !ready) return;
    running.current = true;
    setBusy(true);
    clearOutput();
    setStatus("Preparing…");
    controller.current = new AbortController();
    let runtime;
    try {
      runtime = await runtimeReady;
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
            if (!running.current) return;
            setDownloadPercent(
              totalBytes === null
                ? null
                : Math.min(100, Math.floor((100 * loadedBytes) / totalBytes)),
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
      setBusy(false);
      setDownloadPercent(null);
      controller.current = null;
      if (pendingHash.current !== null) {
        const hash = pendingHash.current;
        pendingHash.current = null;
        choose(initialSelection(hash, selected));
        history.replaceState(
          null,
          "",
          `#example=${initialSelection(hash, selected)}`,
        );
      }
    }
  };
  const confirmDialog = (value: string) => {
    // Validate outside React's state updater so the dialog can report errors.
    const next =
      dialog === "add"
        ? addFile(project, value)
        : dialog === "rename"
          ? renameFile(project, value)
          : dialog === "delete"
            ? deleteFile(project)
            : freshProject(example);
    if (dialog === "reset") {
      forgetEditors(selected);
      setGenerations((previous) => ({
        ...previous,
        [selected]: (previous[selected] ?? 0) + 1,
      }));
    }
    setDrafts((previous) => ({ ...previous, [selected]: next }));
    setDialog(null);
    clearOutput();
  };
  const details =
    result?.status === "compiler_error" || result?.status === "invalid_input"
      ? (result.diagnostics ?? "")
      : result?.status === "unsupported_feature"
        ? "rescue/retry is not supported yet."
        : "";
  const errorText = [stderr, details].filter(Boolean).join("\n");
  const failure = contractFailure(errorText);
  const failed = result && !["success", "cancelled"].includes(result.status);
  const locations = sourceLocations(errorText, project.files);
  const reset = () => {
    if (modified(project, example)) setDialog("reset");
    else {
      forgetEditors(selected);
      setGenerations((previous) => ({
        ...previous,
        [selected]: (previous[selected] ?? 0) + 1,
      }));
      clearOutput();
    }
  };

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Liberty Eiffel playground</h1>
          <p className="subtitle">
            Pick an example. Change something. See what happens.
          </p>
        </div>
      </header>
      <main>
        <div className="example-bar">
          <label htmlFor="example">Explore</label>
          <select
            id="example"
            value={selected}
            disabled={busy}
            onChange={(event) => choose(event.target.value)}
          >
            <optgroup label="Examples">
              {examples
                .filter((item) => item.id !== "my-program")
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Your workspace">
              <option value="my-program">My program</option>
            </optgroup>
          </select>
          <button
            className="text-button"
            onClick={() => setNotesVisible((value) => !value)}
            aria-expanded={notesVisible}
            aria-controls="notes"
          >
            {notesVisible ? "Hide notes" : "Show notes"}
          </button>
        </div>
        {notice && (
          <p className="saving-notice" role="status">
            {notice}
          </p>
        )}
        <div className={`playground ${notesVisible ? "" : "without-notes"}`}>
          {notesVisible && (
            <aside id="notes" aria-labelledby="example-title" key={selected}>
              <span className="section-kicker">
                {selected === "my-program" ? "Make it yours" : "Explore Eiffel"}
              </span>
              <h2 id="example-title">{example.title}</h2>
              <p>{example.summary}</p>
              <h3>What to expect</h3>
              <p>{example.expected}</p>
              <div className="try-this">
                <h3>Try this</h3>
                <p>{example.experiment}</p>
              </div>
              {example.hints && (
                <details className="hints">
                  <summary>More contract experiments</summary>
                  {example.hints.map((hint) => (
                    <p key={hint}>{hint}</p>
                  ))}
                </details>
              )}
            </aside>
          )}
          <section className="workspace" aria-label="Eiffel project">
            <div className="file-toolbar">
              <div
                className="file-tabs"
                role="tablist"
                aria-label="Project files"
              >
                {Object.keys(project.files).map((file, index, files) => (
                  <button
                    key={file}
                    id={`file-${file}`}
                    type="button"
                    role="tab"
                    aria-selected={project.activeFile === file}
                    aria-controls="editor-panel"
                    tabIndex={project.activeFile === file ? 0 : -1}
                    onClick={() =>
                      update((current) => ({ ...current, activeFile: file }))
                    }
                    onKeyDown={(event) => {
                      if (
                        ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                          event.key,
                        )
                      ) {
                        event.preventDefault();
                        const next =
                          event.key === "Home"
                            ? 0
                            : event.key === "End"
                              ? files.length - 1
                              : (index +
                                  (event.key === "ArrowRight"
                                    ? 1
                                    : files.length - 1)) %
                                files.length;
                        update((current) => ({
                          ...current,
                          activeFile: files[next],
                        }));
                        document.getElementById(`file-${files[next]}`)?.focus();
                      }
                    }}
                    title={
                      file === project.rootClass
                        ? "Program entry file"
                        : undefined
                    }
                  >
                    {file}
                    {file === project.rootClass && (
                      <span className="entry-marker" aria-label="entry file">
                        {" "}
                        ●
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <button
                className="compact"
                disabled={busy}
                onClick={() => setDialog("add")}
                aria-label="Add file"
              >
                + File
              </button>
            </div>
            <div className="file-actions">
              <span>{project.activeFile}</span>
              <button disabled={busy} onClick={() => setDialog("rename")}>
                Rename
              </button>
              <button
                disabled={
                  busy ||
                  Object.keys(project.files).length === 1 ||
                  project.activeFile === project.rootClass
                }
                title="Choose another Run file before deleting the entry file"
                onClick={() => setDialog("delete")}
              >
                Delete
              </button>
              {Object.keys(project.files).length > 1 && (
                <label className="run-file">
                  Run file{" "}
                  <select
                    aria-label="Run file"
                    value={project.rootClass}
                    disabled={busy}
                    onChange={(event) =>
                      update((current) => ({
                        ...current,
                        rootClass: event.target.value,
                      }))
                    }
                  >
                    {Object.keys(project.files).map((file) => (
                      <option key={file}>{file}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div
              role="tabpanel"
              id="editor-panel"
              aria-labelledby={`file-${project.activeFile}`}
            >
              <Editor
                key={`${selected}/${generations[selected] ?? 0}`}
                projectId={`${selected}/${generations[selected] ?? 0}`}
                filename={project.activeFile}
                text={project.files[project.activeFile]}
                readOnly={busy}
                onChange={(text) =>
                  update((current) => ({
                    ...current,
                    files: { ...current.files, [current.activeFile]: text },
                  }))
                }
                onRun={run}
                jump={jump}
              />
            </div>
            <p className="editor-help">
              Ctrl / ⌘ Enter to run · Esc, then Tab to leave the editor
            </p>
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
              <button
                id="stop"
                disabled={!busy}
                onClick={() => controller.current?.abort()}
              >
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
                  style={downloadPercent === null ? undefined : { width: `${downloadPercent}%` }}
                />
              </div>
            )}
            {showDownloadNote && (
              <p id="download-note" className="download-note">
                The first run downloads around 25 MB of compiler tools. Everything
                runs in your browser.
              </p>
            )}
            <section className="output" aria-labelledby="output-title">
              <h2 id="output-title">Output</h2>
              <pre id="stdout">
                {stdout ||
                  (busy
                    ? ""
                    : result
                      ? "No output."
                      : "Your output will appear here.")}
              </pre>
            </section>
            <section
              id="errors"
              className="errors"
              hidden={!errorText && !failed}
            >
              <h2>{failure ?? "Errors"}</h2>
              <div className="source-links">
                {locations.map((location) => (
                  <button
                    key={`${location.file}:${location.line}:${location.column}`}
                    onClick={() => {
                      update((current) => ({
                        ...current,
                        activeFile: location.file,
                      }));
                      setJump({ ...location, serial: Date.now() });
                    }}
                  >
                    {location.file}:{location.line}:{location.column}
                  </button>
                ))}
              </div>
              {failure ? (
                <details>
                  <summary>Show Eiffel trace</summary>
                  <pre id="diagnostics">{errorText}</pre>
                </details>
              ) : (
                <pre id="diagnostics">
                  {errorText ||
                    statusMessages[result?.status ?? ""] ||
                    "Your program could not be compiled."}
                </pre>
              )}
            </section>
          </section>
        </div>
      </main>
      <footer>
        <a href="https://beyond-tabs.com">Beyond Tabs</a>
        <span>·</span>
        <a href="https://github.com/andreamancuso/liberty-eiffel-wasm-playground">
          Source
        </a>
      </footer>
      {dialog && (
        <ProjectDialog
          kind={dialog}
          project={project}
          example={example}
          onClose={() => setDialog(null)}
          onConfirm={confirmDialog}
        />
      )}
    </>
  );
}
