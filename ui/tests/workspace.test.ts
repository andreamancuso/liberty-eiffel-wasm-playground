import { test } from "node:test";
import assert from "node:assert/strict";
import { examples } from "../src/examples.ts";
import {
  addFile,
  deleteFile,
  freshProject,
  initialSelection,
  loadWorkspace,
  modified,
  renameFile,
  validProject,
} from "../src/projects.ts";
import { contractFailure, sourceLocations } from "../src/diagnostics.ts";

test("file operations preserve an entry and reject ambiguous names", () => {
  const original = freshProject(examples[0]);
  assert.throws(() => deleteFile(original));
  assert.throws(() => addFile(original, "../other.e"));
  assert.throws(() => addFile(original, "MAIN.e"));
  const added = addFile(original, "account.e");
  assert.equal(added.rootClass, "main.e");
  assert.equal(added.activeFile, "account.e");
  assert.equal(original.files["account.e"], undefined);
  const renamed = renameFile(original, "hello.e");
  assert.equal(renamed.rootClass, "hello.e");
  assert.equal(renamed.files["hello.e"], original.files["main.e"]);
  assert.equal(deleteFile(added).activeFile, "main.e");
  assert.throws(() => deleteFile({ ...added, activeFile: "main.e" }));
  assert.equal(modified(original, examples[0]), false);
  assert.equal(modified(added, examples[0]), true);
});

test("saved multi-file projects restore, but corrupt or unavailable storage is safe", () => {
  const contract = freshProject(
    examples.find((example) => example.id === "contracts")!,
  );
  contract.files["account.e"] += "\n-- My edit\n";
  contract.activeFile = "account.e";
  const workspace = {
    version: 1,
    selected: "contracts",
    drafts: { contracts: contract },
  };
  const restored = loadWorkspace({ getItem: () => JSON.stringify(workspace) });
  assert.deepEqual(restored.workspace, workspace);
  assert.equal(restored.notice, "");
  for (const storage of [
    null,
    { getItem: () => "{broken" },
    {
      getItem: () => {
        throw new Error("denied");
      },
    },
    { getItem: () => JSON.stringify({ ...workspace, version: 2 }) },
  ]) {
    const fallback = loadWorkspace(storage);
    assert.equal(fallback.workspace.selected, "hello");
    assert.ok(fallback.notice);
  }
  assert.equal(validProject({ ...contract, rootClass: "missing.e" }), false);
  assert.equal(initialSelection("#example=input", "contracts"), "input");
  assert.equal(initialSelection("", "contracts"), "contracts");
  assert.equal(initialSelection("#example=missing", "contracts"), "hello");
});

test("contract summaries and source links stay within the submitted project", () => {
  assert.equal(
    contractFailure(
      "*** Error at Run Time ***: Require Assertion Violated.\n*** Error at Run Time ***: enough_funds\n",
    ),
    "Precondition failed: enough_funds",
  );
  assert.equal(
    contractFailure(
      "*** Error at Run Time ***: Ensure Assertion Violated.\n*** Error at Run Time ***: debited",
    ),
    "Postcondition failed: debited",
  );
  assert.equal(
    contractFailure(
      "*** Error at Run Time ***: Class Invariant Violation.\n*** Error at Run Time ***: non_negative",
    ),
    "Class invariant failed: non_negative",
  );
  assert.equal(contractFailure("Something else failed"), null);
  const files = { "main.e": "class MAIN\nend\n" };
  assert.deepEqual(
    sourceLocations(
      "Line 1 column 7 in MAIN (/work/main.e):\nline 1 column 7 file /work/main.e\nline 999 column 1 file /work/main.e\nline 1 column 1 file /work/secret.e",
      files,
    ),
    [{ file: "main.e", line: 1, column: 7 }],
  );
});
