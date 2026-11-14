import assert from "node:assert/strict";
import { hello } from "./compiler-fixtures.mjs";
import {
  checkLearningUI,
  checkLibraryUI,
  checkUnavailableStorage,
} from "./ui-checks.mjs";
import { checkDownloadUI } from "./download-ui.mjs";

export async function checkUI({
  browser,
  page,
  siteUrl,
  errors,
  setDelivery,
  setEncodedGzip,
}) {
  const results = [],
    marker = "HTTP_encoded";
  results.push(await checkLearningUI(page, siteUrl, { full: true }));
  results.push(await checkLibraryUI(page, siteUrl));
  await checkUnavailableStorage(browser, siteUrl);
  results.push({ name: "unavailable_storage", status: "success" });
  results.push(await checkDownloadUI(browser, siteUrl, setDelivery));
  assert.deepEqual(errors, []);
  // A fresh context prevents the opaque response cache masking HTTP decoding.
  setEncodedGzip(true);
  const encodedContext = await browser.newContext();
  try {
    const encodedPage = await encodedContext.newPage();
    await encodedPage.goto(siteUrl);
    await encodedPage.waitForFunction(() => !!window.playground);
    const { encodedResult, progress } = await encodedPage.evaluate(
      async (input) => {
        const progress = [];
        const encodedResult = await window.playground.buildAndRun(input, {
          onProgress: (value) => progress.push(value),
        });
        return { encodedResult, progress };
      },
      hello(marker + "_encoded"),
    );
    results.push({
      name: "http_encoded_gzip",
      status: encodedResult.status,
      elapsedMs: encodedResult.elapsedMs,
    });
    assert.equal(encodedResult.status, "success", encodedResult.diagnostics);
    assert.equal(encodedResult.stdout, marker + "_encoded\n");
    assert.ok(progress.some((value) => value.loadedBytes > 0));
    assert.ok(progress.every((value) => value.totalBytes === null));
    assert.equal(
      await encodedPage.evaluate(() =>
        window.playground.getActiveWorkerCount(),
      ),
      0,
    );
  } finally {
    await encodedContext.close();
  }
  return results;
}
