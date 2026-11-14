import { useEffect, useRef, useState } from "react";
import type { Example } from "../examples";
import type { Project } from "../projects";

export type DialogKind = "add" | "rename" | "delete" | "reset";

const submitLabels: Record<DialogKind, string> = {
  add: "Add file",
  rename: "Rename",
  delete: "Delete",
  reset: "Reset project",
};
export function ProjectDialog({
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
            {submitLabels[kind]}
          </button>
        </div>
      </form>
    </dialog>
  );
}
