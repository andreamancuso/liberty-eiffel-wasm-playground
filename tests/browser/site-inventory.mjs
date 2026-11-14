import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

// Same inventory shape and ordering as the release verifier. Reports live
// outside the candidate; only its eventual release manifest excludes itself.
export async function siteInventory(root) {
  const entries = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(`Symlink in candidate: ${filename}`);
      if (entry.isDirectory()) await visit(filename);
      else if (entry.isFile()) {
        const relative = path
          .relative(root, filename)
          .split(path.sep)
          .join("/");
        if (relative === "release.json") continue;
        const data = await readFile(filename);
        entries.push({
          path: relative,
          bytes: data.length,
          sha256: createHash("sha256").update(data).digest("hex"),
        });
      }
    }
  }
  await visit(root);
  return entries.sort((a, b) => {
    if (a.path < b.path) return -1;
    if (a.path > b.path) return 1;
    return 0;
  });
}
