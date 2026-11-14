import type { Project } from "../projects";
import type { DialogKind } from "./ProjectDialog";
function nextTabIndex(key: string, index: number, count: number) {
  switch (key) {
    case "Home":
      return 0;
    case "End":
      return count - 1;
    case "ArrowRight":
      return (index + 1) % count;
    default:
      return (index + count - 1) % count;
  }
}
interface Props {
  project: Project;
  busy: boolean;
  update: (transform: (project: Project) => Project) => void;
  setDialog: (kind: DialogKind) => void;
}
export function FileControls({ project, busy, update, setDialog }: Props) {
  return (
    <>
      <div className="file-toolbar">
        <div className="file-tabs" role="tablist" aria-label="Project files">
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
                  ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
                ) {
                  event.preventDefault();
                  const next = nextTabIndex(event.key, index, files.length);
                  update((current) => ({
                    ...current,
                    activeFile: files[next],
                  }));
                  document.getElementById(`file-${files[next]}`)?.focus();
                }
              }}
              title={
                file === project.rootClass ? "Program entry file" : undefined
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
    </>
  );
}
