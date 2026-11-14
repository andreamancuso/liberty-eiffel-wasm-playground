import assert from 'node:assert/strict';
import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(process.argv[2] ?? '/artifacts');
await rm(path.join(root, 'browser-result.json'), { force: true });
const mimeTypes = { '.html': 'text/html', '.mjs': 'text/javascript', '.wasm': 'application/wasm' };
const server = createServer(async (request, response) => {
    try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
        if (!file.startsWith(`${root}${path.sep}`)) {
            response.writeHead(403).end();
            return;
        }
        const content = await readFile(file);
        response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(file)] ?? 'application/octet-stream' });
        response.end(content);
    } catch {
        response.writeHead(404).end();
    }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    const requests = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
    });
    page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
    page.on('response', response => {
        if (!response.ok()) errors.push(`HTTP ${response.status()}: ${response.url()}`);
    });
    page.on('request', request => requests.push({ method: request.method(), url: request.url() }));
    await page.goto(origin);
    await page.waitForFunction(() => window.stage1 && window.stage1.status !== 'running', null, { timeout: 30000 });
    const result = await page.evaluate(() => window.stage1);
    console.log(JSON.stringify(result, null, 2));
    assert.equal(result.status, 'complete');
    assert.deepEqual(errors, []);
    assert.equal(result.results.length, 2);
    const [hello, contract] = result.results;
    assert.equal(hello.exitCode, 0);
    assert.deepEqual(hello.stdout, ['Hello from Liberty Eiffel and WebAssembly!', '42']);
    assert.deepEqual(hello.stderr, []);
    assert.equal(contract.exitCode, 1);
    assert.match([...contract.stdout, ...contract.stderr].join('\n'), /expected_failure/);
    assert.doesNotMatch([...contract.stdout, ...contract.stderr].join('\n'), /assertion was skipped/);
    assert.ok(requests.every(request => request.method === 'GET' && new URL(request.url).origin === origin));
    for (const name of ['hello', 'contract_failure']) {
        assert.ok(requests.some(request => new URL(request.url).pathname === `/${name}.wasm`));
    }
    const wasmBytes = Object.fromEntries(await Promise.all(['hello', 'contract_failure'].map(async name => [name, (await stat(path.join(root, `${name}.wasm`))).size])));
    const sourceRevision = (await readFile(path.join(root, 'generated/source-revision.txt'), 'utf8')).trim();
    const emscriptenVersion = (await readFile(path.join(root, 'emscripten-version.txt'), 'utf8')).split('\n')[0];
    const report = { passed: true, date: new Date().toISOString(), sourceRevision, emscriptenVersion, browser: browser.version(), wasmBytes, requests, ...result };
    await writeFile(path.join(root, 'browser-result.json'), `${JSON.stringify(report, null, 2)}\n`);
    await page.screenshot({ path: path.join(root, 'browser-smoke.png'), fullPage: true });
    console.log('PASS: generated Eiffel programs ran as WebAssembly; assertion failure preserved.');
} finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
}
