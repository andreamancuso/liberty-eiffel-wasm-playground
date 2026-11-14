import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { siteInventory } from "./site-inventory.mjs";

test("candidate inventory sorts paths, hashes binary bytes, and excludes only the manifest", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "liberty-inventory-"));
  try {
    await mkdir(path.join(root, "runtime"));
    await writeFile(
      path.join(root, "runtime/compiler.wasm"),
      new Uint8Array([0, 97, 115, 109]),
    );
    await writeFile(path.join(root, ".nojekyll"), "");
    await writeFile(path.join(root, "release.json"), "ignored");
    const first = await siteInventory(root);
    assert.deepEqual(
      first.map((entry) => entry.path),
      [".nojekyll", "runtime/compiler.wasm"],
    );
    assert.equal(
      first[0].sha256,
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    assert.equal(first[1].bytes, 4);
    await writeFile(
      path.join(root, "runtime/compiler.wasm"),
      new Uint8Array([0, 97, 115, 110]),
    );
    assert.notEqual((await siteInventory(root))[1].sha256, first[1].sha256);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
