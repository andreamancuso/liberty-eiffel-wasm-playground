import { examples, type Example } from "./examples.ts";

export interface Project {
  files: Record<string, string>;
  rootClass: string;
  stdin: string;
  activeFile: string;
}
export interface Workspace {
  version: 1;
  selected: string;
  drafts: Record<string, Project>;
}
export const storageKey = "liberty-playground.workspace.v1";
export const findExample = (id: string) =>
  examples.find((example) => example.id === id);
export const freshProject = (example: Example): Project => ({
  files: { ...example.files },
  rootClass: example.rootClass,
  stdin: example.stdin,
  activeFile: example.rootClass,
});
const own = (value: object, key: string) => Object.hasOwn(value, key);
const validName = (name: string) => /^[a-zA-Z][a-zA-Z0-9_]*\.e$/.test(name);
export function validProject(value: unknown): value is Project {
  if (!value || typeof value !== "object") return false;
  const p = value as Project;
  return (
    !!p.files &&
    typeof p.files === "object" &&
    !Array.isArray(p.files) &&
    Object.keys(p.files).length > 0 &&
    Object.entries(p.files).every(
      ([name, text]) => validName(name) && typeof text === "string",
    ) &&
    new Set(Object.keys(p.files).map((name) => name.toLowerCase())).size ===
      Object.keys(p.files).length &&
    typeof p.rootClass === "string" &&
    own(p.files, p.rootClass) &&
    typeof p.stdin === "string" &&
    typeof p.activeFile === "string" &&
    own(p.files, p.activeFile)
  );
}
export function loadWorkspace(storage: Pick<Storage, "getItem"> | null): {
  workspace: Workspace;
  notice: string;
} {
  const empty: Workspace = { version: 1, selected: "hello", drafts: {} };
  try {
    if (!storage) throw new Error("Storage unavailable");
    const saved = storage.getItem(storageKey);
    if (!saved) return { workspace: empty, notice: "" };
    const value = JSON.parse(saved);
    if (
      value.version !== 1 ||
      !findExample(value.selected) ||
      !value.drafts ||
      typeof value.drafts !== "object" ||
      Array.isArray(value.drafts) ||
      Object.entries(value.drafts).some(
        ([id, p]) => !findExample(id) || !validProject(p),
      )
    )
      throw new Error("Unrecognized saved workspace");
    return { workspace: value, notice: "" };
  } catch {
    return {
      workspace: empty,
      notice: "Saved drafts are unavailable. You can still work in this tab.",
    };
  }
}
export function initialSelection(hash: string, saved: string): string {
  const requested = new URLSearchParams(hash.replace(/^#/, "")).get("example");
  return requested
    ? (findExample(requested)?.id ?? "hello")
    : (findExample(saved)?.id ?? "hello");
}
export function modified(project: Project, example: Example) {
  return (
    project.rootClass !== example.rootClass ||
    project.stdin !== example.stdin ||
    JSON.stringify(Object.entries(project.files).sort()) !==
      JSON.stringify(Object.entries(example.files).sort())
  );
}
function checkName(project: Project, name: string, previous?: string) {
  if (!validName(name))
    throw new Error(
      "Use a filename such as account.e: letters, numbers, and underscores, starting with a letter.",
    );
  if (
    Object.keys(project.files).some(
      (file) => file !== previous && file.toLowerCase() === name.toLowerCase(),
    )
  )
    throw new Error("That filename is already in this project.");
}
export function addFile(project: Project, rawName: string): Project {
  const name = rawName.trim();
  checkName(project, name);
  const className = name.slice(0, -2).toUpperCase();
  return {
    ...project,
    files: { ...project.files, [name]: `class ${className}\n\nend\n` },
    activeFile: name,
  };
}
export function renameFile(project: Project, rawName: string): Project {
  const name = rawName.trim(),
    previous = project.activeFile;
  checkName(project, name, previous);
  return {
    ...project,
    files: Object.fromEntries(
      Object.entries(project.files).map(([file, text]) => [
        file === previous ? name : file,
        text,
      ]),
    ),
    rootClass: project.rootClass === previous ? name : project.rootClass,
    activeFile: name,
  };
}
export function deleteFile(project: Project): Project {
  if (Object.keys(project.files).length === 1)
    throw new Error("Keep at least one file in your project.");
  if (project.activeFile === project.rootClass)
    throw new Error("Choose another Run file before deleting this file.");
  const files = { ...project.files };
  delete files[project.activeFile];
  return { ...project, files, activeFile: project.rootClass };
}
