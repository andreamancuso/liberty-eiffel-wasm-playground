import assert from 'node:assert/strict';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { hello, multi, invalid } from './fixtures.mjs';

const execute = process.argv.includes('--execute');
const root = '/artifacts';
const reportPath = path.join(root, execute ? 'stage2-execution-result.json' : 'stage2-browser-result.json');
await rm(reportPath, { force: true });
const requests = [], errors = [];
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json' };
const server = createServer(async (request, response) => {
    try {
        const url = new URL(request.url, 'http://localhost');
        const pathname = decodeURIComponent(url.pathname);
        const file = path.resolve(root, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`);
        if (!file.startsWith(`${root}/`)) { response.writeHead(403).end(); return; }
        const content = await readFile(file);
        requests.push({ method: request.method, path: url.pathname, bytes: content.length });
        response.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=3600' });
        response.end(content);
    } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    context.on('request', request => {
        if (new URL(request.url()).origin !== origin || request.method() !== 'GET') errors.push(`Unexpected request: ${request.method()} ${request.url()}`);
    });
    context.on('requestfailed', request => errors.push(`Failed request: ${request.url()}`));
    await page.goto(origin);
    if (execute) {
        await page.waitForFunction(() => window.stage1 && window.stage1.status !== 'running');
        const stage1 = await page.evaluate(() => window.stage1);
        assert.equal(stage1.status, 'complete');
        assert.equal(stage1.results[0].exitCode, 0);
        assert.deepEqual(stage1.results[0].stdout, ['Hello from Liberty Eiffel and WebAssembly!', '42']);
        assert.deepEqual(stage1.results[0].stderr, []);
        assert.equal(stage1.results[1].exitCode, 1);
        assert.match(stage1.results[1].stderr.join('\n'), /expected_failure/);
        assert.doesNotMatch([...stage1.results[1].stdout, ...stage1.results[1].stderr].join('\n'), /assertion was skipped/);
        await page.goto(`${origin}/validation/`);
        await page.waitForFunction(() => window.validation?.status !== 'running' && window.validation, null, { timeout: 30000 });
        const validation = await page.evaluate(() => window.validation);
        assert.equal(validation.status, 'complete', JSON.stringify(validation));
        for (const result of validation.results) {
            assert.equal(result.exitCode, 0);
            assert.deepEqual(result.stdout, result.expected);
            assert.deepEqual(result.stderr, []);
        }
        assert.deepEqual(errors, []);
        await writeFile(reportPath, JSON.stringify({ passed: true, date: new Date().toISOString(), browser: browser.version(), stage1, ...validation, requests }, null, 2) + '\n');
        console.log('PASS: browser-generated C compiled offline and executed as WASM with expected output.');
    } else {
        await page.waitForFunction(() => !!window.stage2);
        assert.equal(await page.evaluate(() => crossOriginIsolated), false);
        const results = [];
        const run = async (name, input) => {
            const result = await page.evaluate(input => window.stage2.compile(input), input);
            assert.equal(await page.evaluate(() => window.stage2.getActiveWorkerCount()), 0);
            const { artifacts, ...summary } = result;
            results.push({ name, ...summary, artifactNames: Object.keys(artifacts) });
            console.log(`${name}: ${result.status}, ${Math.round(result.compilationMs ?? 0)} ms compilation`);
            return result;
        };
        const marker = `BrowserMarker_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const cold = await run('cold_hello', hello(marker));
        assert.equal(cold.status, 'success', cold.stderr.join('\n'));
        assert.ok(cold.artifacts['hello.c'] && cold.artifacts['hello.h']);
        assert.ok(cold.linearMemoryBytes <= 1073741824);
        const save = async (name, result, expected) => {
            const directory = path.join(root, 'validation', name);
            await mkdir(directory, { recursive: true });
            for (const [filename, content] of Object.entries(result.artifacts)) await writeFile(path.join(directory, filename), content);
            await writeFile(path.join(directory, 'expected.json'), JSON.stringify(expected));
        };
        await save('hello', cold, [marker]);
        for (const fixture of invalid) {
            const result = await run(fixture.name, { rootClass: 'hello.e', files: { 'hello.e': fixture.source } });
            assert.equal(result.status, 'compiler_error');
            assert.notEqual(result.exitCode, 0);
            assert.deepEqual(result.artifacts, {});
            assert.match([...result.stdout, ...result.stderr].join('\n'), fixture.diagnostic);
        }
        const warm = await run('warm_hello_after_errors', hello(`${marker}_warm`));
        assert.equal(warm.status, 'success');
        assert.match(warm.artifacts['hello.c'], new RegExp(`${marker}_warm`));
        const multiple = await run('inheritance_and_generics', multi);
        assert.equal(multiple.status, 'success', multiple.stderr.join('\n'));
        await save('multi', multiple, ['42', '42']);
        for (const phase of ['loading', 'compiling']) {
            const cancelled = await page.evaluate(async ({ input, phase }) => {
                const controller = new AbortController();
                return window.stage2.compile(input, { signal: controller.signal, onPhase: value => { if (value === phase) controller.abort(); } });
            }, { input: hello(marker), phase });
            assert.equal(cancelled.status, 'cancelled');
            assert.deepEqual(cancelled.artifacts, {});
            assert.equal(await page.evaluate(() => window.stage2.getActiveWorkerCount()), 0);
            results.push({ name: `cancel_${phase}`, ...cancelled });
        }
        const timed = await page.evaluate(input => window.stage2.compile(input, { timeoutMs: 1 }), hello(marker));
        assert.equal(timed.status, 'timed_out');
        assert.equal(await page.evaluate(() => window.stage2.getActiveWorkerCount()), 0);
        results.push({ name: 'timeout', ...timed });
        const rejected = await run('invalid_path', { rootClass: '../hello.e', files: { '../hello.e': 'class HELLO end' } });
        assert.equal(rejected.status, 'invalid_input');
        // A real asset-loading failure must report initialization_error and release its worker.
        const failureContext = await browser.newContext();
        try {
            failureContext.on('request', request => {
                if (new URL(request.url()).origin !== origin || request.method() !== 'GET') errors.push(`Unexpected startup request: ${request.url()}`);
            });
            await failureContext.route('**/compiler.data', route => route.fulfill({ status: 404, body: 'Missing asset for initialization test' }));
            const failurePage = await failureContext.newPage();
            await failurePage.goto(origin);
            await failurePage.waitForFunction(() => !!window.stage2);
            const startup = await failurePage.evaluate(input => window.stage2.compile(input, { timeoutMs: 20000 }), hello(marker));
            assert.equal(startup.status, 'initialization_error', JSON.stringify(startup));
            assert.match(startup.stderr.join('\n'), /404/);
            assert.deepEqual(startup.artifacts, {});
            assert.equal(await failurePage.evaluate(() => window.stage2.getActiveWorkerCount()), 0);
            results.push({ name: 'missing_asset', ...startup });
        } finally { await failureContext.close(); }
        assert.equal((await run('recovery_after_cancel_and_timeout', hello(`${marker}_recovery`))).status, 'success');

        // Exercise the actual editable page and download controls as well as its API.
        await page.locator('#source').fill(hello(`${marker}_ui`).files['hello.e']);
        await page.locator('#translate').click();
        await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('success'), null, { timeout: 600000 });
        await page.locator('#artifacts').selectOption('hello.c');
        assert.match(await page.locator('#generated').textContent(), new RegExp(`${marker}_ui`));
        const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
        assert.equal(download.suggestedFilename(), 'hello.c');
        assert.equal(await page.evaluate(() => window.stage2.getActiveWorkerCount()), 0);
        assert.deepEqual(errors, []);
        assert.ok(requests.some(request => request.path === '/compiler.wasm'));
        assert.ok(requests.some(request => request.path === '/compiler.data'));
        const assetBytes = Object.fromEntries(await Promise.all(['compiler.mjs', 'compiler.wasm', 'compiler.data'].map(async name => [name, (await stat(path.join(root, name))).size])));
        const provenance = JSON.parse(await readFile(path.join(root, 'provenance.json'), 'utf8'));
        const sdk = (await readFile(path.join(root, 'emscripten-version.txt'), 'utf8')).split('\n')[0];
        await writeFile(reportPath, JSON.stringify({ passed: true, date: new Date().toISOString(), browser: browser.version(), sdk, provenance, assetBytes, results, requests }, null, 2) + '\n');
        await page.screenshot({ path: path.join(root, 'stage2-browser.png'), fullPage: true });
        console.log('PASS: browser compiler, diagnostics, recovery, cancellation, deadline, editable UI and downloads.');
    }
} finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
}
