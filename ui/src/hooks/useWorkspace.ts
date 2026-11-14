import { useCallback, useEffect, useRef, useState } from "react";
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
} from "../projects";
import { forgetEditors } from "../Editor";
import type { DialogKind } from "../components/ProjectDialog";
import type { SourceLocation } from "../diagnostics";

function browserStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}
export function useWorkspace(busy: boolean, clearRun: () => void) {
  const [initial] = useState(() => loadWorkspace(browserStorage()));
  const [selected, setSelected] = useState(() =>
    initialSelection(location.hash, initial.workspace.selected),
  );
  const [drafts, setDrafts] = useState(initial.workspace.drafts);
  const [notice, setNotice] = useState(initial.notice);
  const [generations, setGenerations] = useState<Record<string, number>>({});
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [jump, setJump] = useState<
    (SourceLocation & { serial: number }) | null
  >(null);
  const pendingHash = useRef<string | null>(null);
  const example = findExample(selected)!;
  const project = drafts[selected] ?? freshProject(example);
  const clear = useCallback(() => {
    clearRun();
    setJump(null);
  }, [clearRun]);
  const choose = useCallback(
    (id: string) => {
      if (busy) return;
      setSelected(id);
      clear();
    },
    [busy, clear],
  );
  useEffect(() => {
    const handleHash = () => {
      if (busy) pendingHash.current = location.hash;
      else choose(initialSelection(location.hash, selected));
    };
    addEventListener("hashchange", handleHash);
    return () => removeEventListener("hashchange", handleHash);
  }, [busy, choose, selected]);
  useEffect(() => {
    if (busy) return;
    if (pendingHash.current !== null) {
      const next = initialSelection(pendingHash.current, selected);
      pendingHash.current = null;
      choose(next);
      history.replaceState(null, "", `#example=${next}`);
      return;
    }
    history.replaceState(null, "", `#example=${selected}`);
  }, [busy, choose, selected]);
  useEffect(() => {
    if (initial.notice) return;
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
  const update = (transform: (current: Project) => Project) => {
    setDrafts((previous) => ({
      ...previous,
      [selected]: transform(previous[selected] ?? freshProject(example)),
    }));
  };
  const resetEditors = () => {
    forgetEditors(selected);
    setGenerations((previous) => ({
      ...previous,
      [selected]: (previous[selected] ?? 0) + 1,
    }));
  };
  const reset = () => {
    if (modified(project, example)) {
      setDialog("reset");
      return;
    }
    resetEditors();
    clear();
  };
  const confirmDialog = (value: string) => {
    let next: Project;
    switch (dialog) {
      case "add":
        next = addFile(project, value);
        break;
      case "rename":
        next = renameFile(project, value);
        break;
      case "delete":
        next = deleteFile(project);
        break;
      case "reset":
        next = freshProject(example);
        resetEditors();
        break;
      default:
        throw new Error("No project action selected");
    }
    setDrafts((previous) => ({ ...previous, [selected]: next }));
    setDialog(null);
    clear();
  };
  const showLocation = (location: SourceLocation) => {
    update((current) => ({ ...current, activeFile: location.file }));
    setJump({ ...location, serial: Date.now() });
  };
  return {
    selected,
    example,
    project,
    notice,
    dialog,
    setDialog,
    jump,
    choose,
    update,
    reset,
    confirmDialog,
    showLocation,
    editorKey: `${selected}/${generations[selected] ?? 0}`,
  };
}
