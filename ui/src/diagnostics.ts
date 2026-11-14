import type { Project } from "./projects.ts";
export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}
export function sourceLocations(
  text: string,
  files: Project["files"],
): SourceLocation[] {
  const found: SourceLocation[] = [];
  const pattern =
    /line\s+(\d+)\s+column\s+(\d+)[^\n]*?\/work\/([a-zA-Z][a-zA-Z0-9_]*\.e)/gi;
  for (const match of text.matchAll(pattern)) {
    const [, l, c, file] = match,
      line = Number(l),
      column = Number(c);
    if (!Object.hasOwn(files, file)) continue;
    const lines = files[file].split("\n");
    if (
      line < 1 ||
      line > lines.length ||
      column < 1 ||
      column > lines[line - 1].length + 1
    )
      continue;
    if (
      !found.some(
        (value) =>
          value.file === file && value.line === line && value.column === column,
      )
    )
      found.push({ file, line, column });
  }
  return found;
}
export function contractFailure(text: string): string | null {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const kind = /Require Assertion Violated/i.test(lines[i])
      ? "Precondition"
      : /Ensure Assertion Violated/i.test(lines[i])
        ? "Postcondition"
        : /Class Invariant Violation/i.test(lines[i])
          ? "Class invariant"
          : null;
    if (kind) {
      const tag = lines[i + 1]?.match(
        /^\*\*\* Error at Run Time \*\*\*:\s*([a-zA-Z][a-zA-Z0-9_]*)\s*$/,
      )?.[1];
      return `${kind} failed${tag ? `: ${tag}` : ""}`;
    }
  }
  return null;
}
