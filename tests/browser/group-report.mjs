import assert from "node:assert/strict";

export const groupNames = ["api", "ui"];

export function combineReports(reports, workers, elapsedMs) {
  assert.deepEqual(reports.map((report) => report.name).sort(), groupNames);
  const first = reports[0];
  for (const report of reports) {
    assert.equal(report.passed, true, `${report.name} failed`);
    for (const key of ["testedFiles", "provenance", "assets", "toolchain"])
      assert.deepEqual(
        report[key],
        first[key],
        `${key} differs between groups`,
      );
    assert.ok(report.results.length, `${report.name} has no cases`);
  }
  const results = reports.flatMap((report) => report.results);
  assert.equal(
    new Set(results.map((result) => result.name)).size,
    results.length,
  );
  return {
    passed: true,
    testedFiles: first.testedFiles,
    provenance: first.provenance,
    assets: first.assets,
    toolchain: first.toolchain,
    browser: first.browser,
    date: new Date().toISOString(),
    workers,
    elapsedMs,
    groups: reports.map(({ name, passed, elapsedMs, results }) => ({
      name,
      passed,
      elapsedMs,
      cases: results.map((result) => result.name),
    })),
    results,
    requests: reports.flatMap((report) => report.requests),
  };
}
