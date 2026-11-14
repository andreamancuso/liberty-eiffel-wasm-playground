import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const notices = [];
async function collect(root) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const directory = path.join(root, entry.name);
    if (entry.name.startsWith("@")) {
      await collect(directory);
      continue;
    }
    const metadata = JSON.parse(
      await readFile(path.join(directory, "package.json"), "utf8"),
    );
    const licenses = (await readdir(directory)).filter((name) =>
      /^(licen[cs]e|copying|notice)(\.|$)/i.test(name),
    );
    const texts = await Promise.all(
      licenses.map((name) => readFile(path.join(directory, name), "utf8")),
    );
    notices.push(
      `${metadata.name}@${metadata.version}\nLicense: ${metadata.license ?? "See package notices"}\n${texts.join("\n")}`,
    );
    try {
      await collect(path.join(directory, "node_modules"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}
await collect("node_modules");
await mkdir("dist/licenses/ui", { recursive: true });
await writeFile(
  "dist/licenses/ui/THIRD_PARTY_LICENSES.txt",
  notices.sort().join("\n\n--------------------\n\n") + "\n",
);
