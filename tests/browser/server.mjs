import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { chromium } from "playwright";
import { setTimeout as delay } from "node:timers/promises";

export async function createHarness() {
  const root = "/artifacts",
    requests = [],
    errors = [];
  const basePath =
    process.env.SITE_BASE_PATH ?? "/liberty-eiffel-wasm-playground/";
  assert.match(basePath, /^\/(?:[a-zA-Z0-9_-]+\/)*$/);
  let encodedGzip = false,
    delivery = "normal",
    browser;
  const types = {
    ".html": "text/html",
    ".mjs": "text/javascript",
    ".js": "text/javascript",
    ".css": "text/css",
    ".wasm": "application/wasm",
    ".json": "application/json",
  };
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      if (!pathname.startsWith(basePath)) {
        res.writeHead(404).end();
        return;
      }
      const relative = pathname.slice(basePath.length);
      const file = path.resolve(
        root,
        relative.endsWith("/") || !relative
          ? relative + "index.html"
          : relative,
      );
      if (!file.startsWith(root + "/")) {
        res.writeHead(403).end();
        return;
      }
      const content = await readFile(file);
      const mode = delivery;
      requests.push({
        method: req.method,
        path: pathname,
        bytes: content.length,
      });
      if (mode === "missing" && file.endsWith("clang.wasm.gz")) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)] ?? "application/octet-stream",
        "Cache-Control":
          encodedGzip || mode !== "normal" ? "no-store" : "public,max-age=3600",
        ...(mode !== "unknown" ? { "Content-Length": content.length } : {}),
        ...(encodedGzip && file.endsWith(".gz")
          ? { "Content-Encoding": "gzip" }
          : {}),
      });
      if (
        mode === "timeout" &&
        file.endsWith(".gz") &&
        content.length > 524288
      ) {
        // Keep a real transfer open until the client's deadline closes it.
        res.write(content.subarray(0, 524288));
        await new Promise((resolve) => res.once("close", resolve));
        return;
      }
      if (["slow", "unknown"].includes(mode) && file.endsWith(".gz")) {
        for (
          let offset = 0;
          offset < content.length && !res.destroyed;
          offset += 524288
        ) {
          res.write(content.subarray(offset, offset + 524288));
          await delay(100);
        }
        res.end();
      } else res.end(content);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const siteUrl = origin + basePath;
  try {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const context = await browser.newContext();
    context.on("request", (req) => {
      const url = new URL(req.url());
      if (
        req.method() !== "GET" ||
        url.origin !== origin ||
        !url.pathname.startsWith(basePath)
      )
        errors.push(`Unexpected request ${req.url()}`);
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(siteUrl);
    await page.waitForFunction(() => !!window.playground);
    assert.equal(await page.evaluate(() => crossOriginIsolated), false);
    return {
      browser,
      page,
      siteUrl,
      requests,
      errors,
      setDelivery(value) {
        delivery = value;
      },
      setEncodedGzip(value) {
        encodedGzip = value;
      },
      async close() {
        await browser.close();
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      },
    };
  } catch (error) {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    throw error;
  }
}
