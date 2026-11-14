import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { groupNames, combineReports } from "./group-report.mjs";

const reportDir = process.env.REPORT_DIR ?? "/reports";
const workers = Number(process.env.TEST_WORKERS ?? 2);
assert.ok([1, 2].includes(workers), "TEST_WORKERS must be 1 or 2");
await mkdir(reportDir, { recursive: true });
await rm(`${reportDir}/browser-result.json`, { force: true });
const started = performance.now();
async function runGroup(name) {
  const directory = `${reportDir}/${name}`;
  await mkdir(directory, { recursive: true });
  await rm(`${directory}/browser-result.json`, { force: true });
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL("./group-runner.mjs", import.meta.url)), name],
      {
        env: { ...process.env, REPORT_DIR: directory },
        stdio: "inherit",
      },
    );
    child.on("error", reject);
    child.on("close", resolve);
  });
  assert.equal(exitCode, 0, `${name} process failed`);
  return JSON.parse(await readFile(`${directory}/browser-result.json`, "utf8"));
}
try {
  // Wait for both children to close their browsers and servers on failure too.
  const outcomes = [];
  if (workers === 2)
    outcomes.push(...(await Promise.allSettled(groupNames.map(runGroup))));
  else
    for (const name of groupNames)
      outcomes.push(...(await Promise.allSettled([runGroup(name)])));
  for (const outcome of outcomes)
    if (outcome.status === "rejected") throw outcome.reason;
  const report = combineReports(
    outcomes.map((outcome) => outcome.value),
    workers,
    Math.round(performance.now() - started),
  );
  await copyFile(`${reportDir}/ui/browser.png`, `${reportDir}/browser.png`);
  await writeFile(
    `${reportDir}/browser-result.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    `PASS: ${report.results.length} cases, ${workers} worker(s), ${report.elapsedMs} ms`,
  );
} catch (error) {
  await writeFile(
    `${reportDir}/browser-result.json`,
    JSON.stringify(
      { passed: false, error: String(error.stack || error) },
      null,
      2,
    ) + "\n",
  );
  throw error;
}
