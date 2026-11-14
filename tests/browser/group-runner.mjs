import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHarness } from "./server.mjs";
import { checkAPI } from "./api-checks.mjs";
import { checkUI } from "./ui-suite.mjs";
import { siteInventory } from "./site-inventory.mjs";

const name = process.argv[2];
assert.ok(["api", "ui"].includes(name));
const reportDir = process.env.REPORT_DIR;
await mkdir(reportDir, { recursive: true });
const started = performance.now();
const report = { name, passed: false, results: [] };
let harness;
try {
  report.testedFiles = await siteInventory("/artifacts");
  for (const [key, file] of Object.entries({
    provenance: "eiffel/provenance.json",
    assets: "wasi/toolchain/assets.json",
    toolchain: "wasi/toolchain/toolchain.lock.json",
  }))
    report[key] = JSON.parse(
      await readFile(`/artifacts/runtime/${file}`, "utf8"),
    );
  harness = await createHarness();
  report.browser = harness.browser.version();
  report.results = await (name === "api" ? checkAPI : checkUI)(harness);
  assert.deepEqual(harness.errors, []);
  report.passed = true;
} catch (error) {
  report.error = String(error.stack || error);
  console.error(report.error);
  process.exitCode = 1;
} finally {
  if (harness) {
    report.requests = harness.requests;
    await harness.page
      .screenshot({ path: `${reportDir}/browser.png`, fullPage: true })
      .catch(console.error);
    await harness.close();
  }
  report.elapsedMs = Math.round(performance.now() - started);
  await writeFile(
    `${reportDir}/browser-result.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    `${name}: ${report.passed ? "PASS" : "FAIL"} in ${report.elapsedMs} ms`,
  );
}
