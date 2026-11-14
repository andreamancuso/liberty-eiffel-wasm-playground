import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { hello } from './stage2-fixtures.mjs';

const url = new URL(process.argv[2]);
assert.equal(url.protocol, 'https:');
assert.ok(url.pathname.endsWith('/'));
const revision = process.env.EXPECTED_REVISION;
assert.match(revision, /^[0-9a-f]{40}$/);
const output = process.env.REPORT_DIR ?? '/reports';
await mkdir(output, { recursive: true });
const report = { url:url.href, expectedRevision:revision, passed:false, requests:[], results:[] };
const browser = await chromium.launch({ headless:true, args:['--no-sandbox'] });
try {
    const context = await browser.newContext();
    const errors = [];
    context.on('request', request => {
        const target = new URL(request.url());
        if (request.method() !== 'GET' || target.origin !== url.origin || !target.pathname.startsWith(url.pathname))
            errors.push(`Unexpected request: ${request.method()} ${request.url()}`);
    });
    context.on('response', response => {
        report.requests.push({ url:response.url(), status:response.status(), headers:response.headers() });
        if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`);
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(url.href);
    await page.waitForFunction(() => !!window.stage3);
    const manifestResponse = await context.request.get(new URL(`release.json?verify=${revision}`, url).href);
    assert.ok(manifestResponse.ok());
    const manifest = await manifestResponse.json();
    assert.equal(manifest.playgroundRevision, revision, 'Published release is stale or has a different revision');
    report.release = manifest;
    const marker = `Hosted_${Date.now()}`;
    const runUI = async (name, source, stdin = '') => {
        await page.locator('#source').fill(source);
        await page.locator('#stdin').fill(stdin);
        await page.evaluate(() => { window.stage3.lastResult = null; });
        await page.locator('#run').click();
        await page.waitForFunction(() => !!window.stage3.lastResult, null, {timeout:600000});
        const result = await page.evaluate(() => {
            const { status, stdout, stderr, diagnostics, error, elapsedMs, timings } = window.stage3.lastResult;
            return { status, stdout, stderr, diagnostics, error, elapsedMs, timings };
        });
        assert.equal(await page.evaluate(() => window.stage3.getActiveWorkerCount()), 0);
        report.results.push({ name, ...result });
        console.log(`${name}: ${result.status} (${Math.round(result.elapsedMs)} ms)`);
        return result;
    };
    let result = await runUI('edited_source', hello(marker).files['hello.e']);
    assert.equal(result.status, 'success', result.diagnostics);
    assert.equal(result.stdout, marker+'\n');
    assert.equal(await page.locator('#errors').isVisible(), false);
    assert.equal(await page.locator('#artifacts, #download, #generated, a[href="./stage2/"]').count(), 0);
    result = await runUI('utf8_stdin', 'class HELLO create {} make feature {} make do io.read_line; io.put_string(io.last_string); io.put_new_line end end', 'Żółw🙂\n');
    assert.equal(result.status, 'success', result.diagnostics);
    assert.equal(result.stdout, 'Żółw🙂\n');
    result = await runUI('compiler_diagnostic', 'class HELLO create {} make feature {} make do absent_feature end end');
    assert.equal(result.status, 'compiler_error');
    assert.ok(result.diagnostics.length > 0);
    assert.equal(await page.locator('#errors').isVisible(), true);
    assert.match(await page.locator('#diagnostics').textContent(), /absent_feature/);
    await page.locator('#source').fill('class HELLO create {} make feature {} make do from until False loop end end end');
    await page.evaluate(() => { window.stage3.lastResult = null; });
    await page.locator('#run').click();
    await page.waitForFunction(() => document.getElementById('status').textContent === 'Running…', null, {timeout:600000});
    await page.locator('#stop').click();
    await page.waitForFunction(() => window.stage3.lastResult?.status === 'cancelled');
    assert.equal(await page.evaluate(() => window.stage3.getActiveWorkerCount()), 0);
    report.results.push({name:'stop',status:'cancelled'});
    result = await runUI('recovery', hello(marker+'_recovery').files['hello.e']);
    assert.equal(result.status, 'success', result.diagnostics);
    assert.equal(result.stdout, marker+'_recovery\n');
    assert.equal(await page.locator('#errors').isVisible(), false);
    for (const response of report.requests) {
        if (response.url.endsWith('.mjs')) assert.match(response.headers['content-type'] ?? '', /javascript/);
        if (response.url.endsWith('/compiler.wasm')) assert.match(response.headers['content-type'] ?? '', /application\/wasm/);
    }
    assert.deepEqual(errors, []);
    await page.screenshot({path:`${output}/hosted-browser.png`,fullPage:true});
    report.passed = true;
    report.browser = browser.version();
    console.log(`PASS: ${url.href} at ${revision}`);
} catch (error) {
    report.error = String(error.stack ?? error);
    throw error;
} finally {
    await writeFile(`${output}/hosted-result.json`, JSON.stringify(report, null, 2)+'\n');
    await browser.close();
}
