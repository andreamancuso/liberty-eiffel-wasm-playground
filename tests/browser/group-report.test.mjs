import assert from "node:assert/strict";
import test from "node:test";
import { combineReports } from "./group-report.mjs";

function reports() {
  return ["api", "ui"].map((name) => ({
    name,
    passed: true,
    elapsedMs: 10,
    testedFiles: [{ path: "index.html", sha256: "abc" }],
    provenance: { playgroundRevision: "revision" },
    assets: {},
    toolchain: {},
    results: [{ name: name + "_case", status: "success" }],
    requests: [],
  }));
}
test("both groups bind the aggregate to the same candidate", () => {
  const report = combineReports(reports(), 2, 20);
  assert.equal(report.passed, true);
  assert.equal(report.results.length, 2);
  assert.deepEqual(
    report.groups.map((group) => group.cases),
    [["api_case"], ["ui_case"]],
  );
});
test("incomplete, duplicate, failed or mismatched reports cannot pass", () => {
  const mutations = [
    (r) => r.pop(),
    (r) => r.push(r[0]),
    (r) => {
      r[1].passed = false;
    },
    (r) => {
      r[1].testedFiles[0].sha256 = "changed";
    },
    (r) => {
      r[1].provenance.playgroundRevision = "stale";
    },
    (r) => {
      r[1].results = [];
    },
    (r) => {
      r[1].results[0].name = r[0].results[0].name;
    },
  ];
  for (const mutate of mutations) {
    const input = reports();
    mutate(input);
    assert.throws(() => combineReports(input, 2, 20));
  }
});
