import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { hello, multi, invalid } from "./compiler-fixtures.mjs";
import { libraryCases } from "./library-fixtures.mjs";

export async function checkAPI({ browser, page, siteUrl }) {
  const results = [];
  const record = (name, result) => {
    const { artifacts, stdout = "", stderr = "", ...rest } = result;
    results.push({
      name,
      ...rest,
      stdout: stdout.slice(0, 5000),
      stderr: stderr.slice(0, 5000),
      stdoutLength: stdout.length,
      stderrLength: stderr.length,
      artifactNames: Object.keys(artifacts ?? {}),
    });
    console.log(
      `${name}: ${result.status} in ${Math.round(result.elapsedMs ?? 0)} ms`,
    );
  };
  const run = async (name, input, options = {}) => {
    const result = await page.evaluate(
      ({ input, options }) => window.playground.buildAndRun(input, options),
      { input, options },
    );
    record(name, result);
    assert.equal(
      await page.evaluate(() => window.playground.getActiveWorkerCount()),
      0,
    );
    return result;
  };
  const marker = `API_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const catalogue = await (
    await page.request.get(siteUrl + "examples.json")
  ).json();
  for (const example of catalogue.filter(
    (example) => !["hello", "my-program"].includes(example.id),
  )) {
    const result = await run("example_" + example.id, example);
    assert.equal(result.status, "success", result.diagnostics);
    assert.equal(result.stdout, example.expectedOutput);
  }
  for (const test of libraryCases(
    catalogue.find((example) => example.id === "library-loans"),
  )) {
    const result = await run(test.name, test.input);
    assert.equal(result.status, test.status, result.diagnostics);
    if (test.stdout !== undefined) assert.equal(result.stdout, test.stdout);
    if (test.tag) {
      assert.ok(result.stderr.includes(test.kind), result.stderr);
      assert.match(
        result.stderr,
        new RegExp(
          "\\*\\*\\* Error at Run Time \\*\\*\\*: " + test.tag + "\\n",
        ),
      );
    }
  }
  let result;
  result = await run("inheritance_generics", multi);
  assert.equal(result.status, "success", result.diagnostics);
  assert.equal(result.stdout, "42\n42\n");
  const input = {
    rootClass: "hello.e",
    stdin: "Å»Ã³Å‚wðŸ™‚\n",
    files: {
      "hello.e":
        'class HELLO create {} make feature {} make do io.read_line; io.put_string(io.last_string); io.put_new_line; io.read_line; if io.end_of_input then io.put_string("EOF%N") end end end',
    },
  };
  result = await run("utf8_stdin_eof", input);
  assert.equal(result.status, "success", result.diagnostics);
  assert.equal(result.stdout, "Å»Ã³Å‚wðŸ™‚\nEOF\n");
  result = await run("assertion", {
    rootClass: "contract_failure.e",
    files: {
      "contract_failure.e": await readFile(
        "/fixtures/contract_failure.e",
        "utf8",
      ),
    },
  });
  assert.equal(result.status, "program_error", result.diagnostics);
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /expected_failure/);
  for (const fixture of invalid) {
    result = await run(fixture.name, {
      rootClass: "hello.e",
      files: { "hello.e": fixture.source },
    });
    assert.equal(result.status, "compiler_error");
    assert.equal(result.stdout, "");
    assert.equal(result.phases.includes("execute"), false);
  }
  result = await run("rescue_rejected", {
    rootClass: "hello.e",
    files: {
      "hello.e":
        'class HELLO create {} make feature {} make do io.put_string("MUST NOT EXECUTE") rescue retry end end',
    },
  });
  assert.equal(result.status, "unsupported_feature", result.diagnostics);
  assert.equal(result.stdout, "");
  const backend = async (name, code) => {
    const started = performance.now();
    const result = await page.evaluate(async (code) => {
      const call = (data) =>
        new Promise((resolve, reject) => {
          const worker = new Worker("./runtime/worker.mjs", { type: "module" });
          worker.onmessage = ({ data }) => {
            if (data.type === "result") {
              worker.terminate();
              resolve(data.result);
            }
          };
          worker.onerror = (error) => {
            worker.terminate();
            reject(new Error(error.message));
          };
          worker.postMessage(data);
        });
      const built = await call({
        action: "build",
        artifacts: { "test.c": code },
      });
      return built.status === "success"
        ? call({ action: "execute", wasm: built.wasm, stdin: "" })
        : built;
    }, code);
    result.elapsedMs = performance.now() - started;
    record(name, result);
    return result;
  };
  assert.equal(
    (await backend("c_error", "int main( {")).status,
    "c_compile_error",
  );
  assert.equal(
    (
      await backend(
        "link_error",
        "extern void absent(void); int main(void){absent();return 0;}",
      )
    ).status,
    "link_error",
  );
  assert.equal(
    (await backend("trap", "int main(void){__builtin_trap();}")).status,
    "runtime_error",
  );
  result = await page.evaluate(async (input) => {
    const controller = new AbortController();
    return window.playground.buildAndRun(input, {
      signal: controller.signal,
      onPhase: (phase) => {
        if (phase === "loading_frontend") controller.abort();
      },
    });
  }, hello(marker));
  record("cancel_loading_frontend", result);
  assert.equal(result.status, "cancelled");
  assert.equal(
    await page.evaluate(() => window.playground.getActiveWorkerCount()),
    0,
  );
  const loop = {
    rootClass: "hello.e",
    files: {
      "hello.e":
        "class HELLO create {} make feature {} make do from until False loop end end end",
    },
  };
  result = await run("infinite_loop", loop, { runTimeoutMs: 250 });
  assert.equal(result.status, "timed_out");
  assert.equal(result.phase, "execute");
  result = await backend(
    "output_limit",
    `#include <unistd.h>
#include <string.h>
static char buffer[600000];
int main(void) { memset(buffer, 'x', sizeof buffer); write(1, buffer, sizeof buffer); write(1, buffer, sizeof buffer); return 0; }`,
  );
  assert.equal(result.status, "output_limit_exceeded");
  assert.ok(result.stdout.length > 0 && result.stdout.length <= 1048576);
  assert.match(result.stdout, /^x+$/);
  assert.equal(
    await page.evaluate(() => window.playground.getActiveWorkerCount()),
    0,
  );
  for (const corrupt of [false, true]) {
    const broken = await browser.newContext();
    try {
      await broken.route("**/clang.wasm.gz", (route) =>
        route.fulfill({
          status: corrupt ? 200 : 404,
          body: corrupt ? "broken gzip" : "missing",
        }),
      );
      const p = await broken.newPage();
      await p.goto(siteUrl);
      await p.waitForFunction(() => !!window.playground);
      result = await p.evaluate(
        (input) => window.playground.buildAndRun(input),
        hello(marker),
      );
      assert.equal(
        result.status,
        "initialization_error",
        result.error || result.diagnostics,
      );
      assert.equal(result.stdout, "");
      assert.equal(
        await p.evaluate(() => window.playground.getActiveWorkerCount()),
        0,
      );
      record(corrupt ? "corrupt_clang" : "missing_clang", result);
    } finally {
      await broken.close();
    }
  }
  result = await run("invalid_path", {
    rootClass: "../hello.e",
    files: { "../hello.e": "" },
  });
  assert.equal(result.status, "invalid_input");
  // The last lesson also proves the main API recovers after failures and limits.
  const example = catalogue.find((example) => example.id === "hello");
  result = await run("example_hello", example);
  assert.equal(result.status, "success", result.diagnostics);
  assert.equal(result.stdout, example.expectedOutput);
  assert.equal(result.stderr, "");
  return results;
}
