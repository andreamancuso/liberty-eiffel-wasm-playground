import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { hello, multi, invalid } from './stage2-fixtures.mjs';
import { setSource, checkLearningUI, checkUnavailableStorage, checkLibraryUI } from './ui-checks.mjs';
import { libraryCases } from './library-fixtures.mjs';
import { checkDownloadUI } from './download-ui.mjs';
import { setTimeout as delay } from 'node:timers/promises';
const root = '/artifacts', requests = [], errors = [], results = [];
const basePath = process.env.SITE_BASE_PATH ?? '/liberty-eiffel-wasm-playground/';
assert.match(basePath, /^\/(?:[a-zA-Z0-9_-]+\/)*$/);
let encodedGzip = false;
let delivery = 'normal';
await rm(`${root}/stage3-result.json`, { force: true });
const types = { '.html':'text/html', '.mjs':'text/javascript', '.js':'text/javascript', '.css':'text/css', '.wasm':'application/wasm', '.json':'application/json' };
const server = createServer(async (req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (!pathname.startsWith(basePath)) { res.writeHead(404).end(); return; }
        const relative = pathname.slice(basePath.length);
        const file = path.resolve(root, relative.endsWith('/') || !relative ? relative + 'index.html' : relative);
        if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
        const content = await readFile(file);
        const mode = delivery;
        requests.push({ method:req.method, path:pathname, bytes:content.length });
        if (mode === 'missing' && file.endsWith('clang.wasm.gz')) { res.writeHead(404).end(); return; }
        res.writeHead(200, { 'Content-Type':types[path.extname(file)] ?? 'application/octet-stream',
            'Cache-Control': encodedGzip || mode !== 'normal' ? 'no-store' : 'public,max-age=3600',
            ...(mode !== 'unknown' ? { 'Content-Length': content.length } : {}),
            ...(encodedGzip && file.endsWith('.gz') ? { 'Content-Encoding':'gzip' } : {}) });
        if (['slow', 'timeout', 'unknown'].includes(mode) && file.endsWith('.gz')) {
            for (let offset = 0; offset < content.length && !res.destroyed; offset += 524288) {
                res.write(content.subarray(offset, offset + 524288));
                await delay(mode === 'timeout' ? 1000 : 100);
            }
            res.end();
        } else res.end(content);
    } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const siteUrl = origin + basePath;
let browser;
try {
    browser = await chromium.launch({ headless:true, args:['--no-sandbox'] });
    const context = await browser.newContext();
    context.on('request', req => { const url = new URL(req.url()); if (req.method() !== 'GET' || url.origin !== origin || !url.pathname.startsWith(basePath)) errors.push(`Unexpected request ${req.url()}`); });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(siteUrl); await page.waitForFunction(() => !!window.stage3);
    assert.equal(await page.evaluate(() => crossOriginIsolated), false);
    const record = (name, result) => {
        const { artifacts, stdout = '', stderr = '', ...rest } = result;
        results.push({ name, ...rest, stdout:stdout.slice(0,5000), stderr:stderr.slice(0,5000), stdoutLength:stdout.length, stderrLength:stderr.length, artifactNames:Object.keys(artifacts ?? {}) });
        console.log(`${name}: ${result.status} in ${Math.round(result.elapsedMs ?? 0)} ms`);
    };
    const run = async (name, input, options = {}) => {
        const result = await page.evaluate(({ input, options }) => window.stage3.buildAndRun(input, options), { input, options });
        record(name, result); assert.equal(await page.evaluate(() => window.stage3.getActiveWorkerCount()),0); return result;
    };
    const marker = `Stage3_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const catalogue = await (await page.request.get(siteUrl + 'examples.json')).json();
    for (const example of catalogue) {
        const result = await run('example_' + example.id, example);
        assert.equal(result.status, 'success', result.diagnostics); assert.equal(result.stdout, example.expectedOutput);
    }
    for (const test of libraryCases(catalogue.find(example => example.id === 'library-loans'))) {
        const result = await run(test.name, test.input);
        assert.equal(result.status, test.status, result.diagnostics);
        if (test.stdout !== undefined) assert.equal(result.stdout, test.stdout);
        if (test.tag) {
            assert.ok(result.stderr.includes(test.kind), result.stderr);
            assert.match(result.stderr, new RegExp('\\*\\*\\* Error at Run Time \\*\\*\\*: ' + test.tag + '\\n'));
        }
    }
    let result = await run('cold_hello', hello(marker));
    assert.equal(result.status,'success',result.diagnostics + result.error); assert.equal(result.stdout,marker+'\n'); assert.equal(result.stderr,'');
    result = await run('warm_hello',hello(marker+'_warm')); assert.equal(result.status,'success',result.diagnostics); assert.equal(result.stdout,marker+'_warm\n');
    result = await run('inheritance_generics',multi); assert.equal(result.status,'success',result.diagnostics); assert.equal(result.stdout,'42\n42\n');
    const input = { rootClass:'hello.e', stdin:'Żółw🙂\n', files:{'hello.e':'class HELLO create {} make feature {} make do io.read_line; io.put_string(io.last_string); io.put_new_line; io.read_line; if io.end_of_input then io.put_string("EOF%N") end end end'} };
    result = await run('utf8_stdin_eof',input); assert.equal(result.status,'success',result.diagnostics); assert.equal(result.stdout,'Żółw🙂\nEOF\n');
    result = await run('assertion',{rootClass:'contract_failure.e',files:{'contract_failure.e':await readFile('/fixtures/contract_failure.e','utf8')}});
    assert.equal(result.status,'program_error',result.diagnostics); assert.equal(result.exitCode,1); assert.match(result.stderr,/expected_failure/);
    for (const fixture of invalid) {
        result = await run(fixture.name,{rootClass:'hello.e',files:{'hello.e':fixture.source}});
        assert.equal(result.status,'compiler_error'); assert.equal(result.stdout,''); assert.equal(result.phases.includes('execute'),false);
    }
    result = await run('rescue_rejected',{rootClass:'hello.e',files:{'hello.e':'class HELLO create {} make feature {} make do io.put_string("MUST NOT EXECUTE") rescue retry end end'}});
    assert.equal(result.status,'unsupported_feature',result.diagnostics); assert.equal(result.stdout,'');
    const backend = async (name, code) => {
        const result = await page.evaluate(async code => {
            const call = data => new Promise((resolve,reject) => {
                const worker = new Worker('./worker.mjs',{type:'module'});
                worker.onmessage = ({data}) => { if(data.type==='result'){worker.terminate();resolve(data.result);} };
                worker.onerror = error => {worker.terminate();reject(new Error(error.message));}; worker.postMessage(data);
            });
            const built = await call({action:'build',artifacts:{'test.c':code}});
            return built.status==='success' ? call({action:'execute',wasm:built.wasm,stdin:''}) : built;
        },code);
        record(name,result); return result;
    };
    assert.equal((await backend('c_error','int main( {')).status,'c_compile_error');
    assert.equal((await backend('link_error','extern void absent(void); int main(void){absent();return 0;}')).status,'link_error');
    assert.equal((await backend('trap','int main(void){__builtin_trap();}')).status,'runtime_error');
    for(const phase of ['loading_frontend','eiffel_compile','loading_backend','preparing_backend','c_compile','link','preparing_program','execute']) {
        result = await page.evaluate(async ({input,phase}) => {
            const controller=new AbortController();
            return window.stage3.buildAndRun(input,{signal:controller.signal,onPhase:value=>{if(value===phase)controller.abort();}});
        },{input:hello(marker),phase});
        record(`cancel_${phase}`,result); assert.equal(result.status,'cancelled'); assert.equal(await page.evaluate(()=>window.stage3.getActiveWorkerCount()),0);
    }
    const loop={rootClass:'hello.e',files:{'hello.e':'class HELLO create {} make feature {} make do from until False loop end end end'}};
    result=await run('infinite_loop',loop,{runTimeoutMs:250}); assert.equal(result.status,'timed_out'); assert.equal(result.phase,'execute');
    const flood={rootClass:'hello.e',files:{'hello.e':`class HELLO create {} make feature {} make do from until False loop io.put_string("${'x'.repeat(16384)}") end end end`}};
    result=await run('output_limit',flood,{runTimeoutMs:60000}); assert.equal(result.status,'output_limit_exceeded'); assert.ok(result.stdout.length<=1048576);
    for(const corrupt of [false,true]) {
        const broken=await browser.newContext();
        try {
            await broken.route('**/clang.wasm.gz',route=>route.fulfill({status:corrupt?200:404,body:corrupt?'broken gzip':'missing'}));
            const p=await broken.newPage(); await p.goto(siteUrl); await p.waitForFunction(()=>!!window.stage3);
            result=await p.evaluate(input=>window.stage3.buildAndRun(input),hello(marker));
            assert.equal(result.status,'initialization_error',result.error||result.diagnostics); assert.equal(result.stdout,'');
            assert.equal(await p.evaluate(()=>window.stage3.getActiveWorkerCount()),0); record(corrupt?'corrupt_clang':'missing_clang',result);
        } finally {await broken.close();}
    }
    result=await run('recovery',hello(marker+'_recovery')); assert.equal(result.status,'success'); assert.equal(result.stdout,marker+'_recovery\n');
    await setSource(page,hello(marker+'_ui').files['hello.e'].replace('class HELLO','class MAIN')); await page.locator('#run').click();
    await page.waitForFunction(()=>window.stage3.lastResult?.status==='success',null,{timeout:600000});
    assert.equal(await page.locator('#stdout').textContent(),marker+'_ui\n');
    assert.equal(await page.locator('#errors').isVisible(), false);
    assert.equal(await page.locator('#artifacts, #download, #generated, a[href="./stage2/"]').count(), 0);
    await setSource(page,'class MAIN create {} make feature {} make do absent_feature end end');
    await page.locator('#run').click();
    await page.waitForFunction(()=>window.stage3.lastResult?.status==='compiler_error',null,{timeout:600000});
    assert.equal(await page.locator('#errors').isVisible(), true);
    assert.match(await page.locator('#diagnostics').textContent(), /absent_feature/);
    await setSource(page,loop.files['hello.e'].replace('class HELLO','class MAIN')); await page.locator('#run').click();
    await page.waitForFunction(()=>document.getElementById('status').textContent==='Running…',null,{timeout:600000});
    assert.equal(await page.locator('.cm-content').getAttribute('contenteditable'), 'false');
    await page.locator('#stop').click(); await page.waitForFunction(()=>window.stage3.lastResult?.status==='cancelled');
    assert.equal(await page.evaluate(()=>window.stage3.getActiveWorkerCount()),0);
    await setSource(page,hello(marker+'_final').files['hello.e'].replace('class HELLO','class MAIN')); await page.locator('#run').click();
    await page.waitForFunction(()=>window.stage3.lastResult?.stdout?.includes('_final'),null,{timeout:600000});
    assert.equal(await page.evaluate(()=>window.stage3.lastResult.status),'success');
    assert.equal(await page.locator('#errors').isVisible(), false); assert.deepEqual(errors,[]);
    results.push(await checkLearningUI(page, siteUrl, { full:true }));
    results.push(await checkLibraryUI(page, siteUrl));
    await checkUnavailableStorage(browser, siteUrl);
    results.push(await checkDownloadUI(browser, siteUrl, value => { delivery = value; }));
    assert.deepEqual(errors, []);
    // A fresh context prevents the opaque response cache masking HTTP decoding.
    encodedGzip = true;
    const encodedContext = await browser.newContext();
    try {
        const encodedPage = await encodedContext.newPage();
        await encodedPage.goto(siteUrl); await encodedPage.waitForFunction(() => !!window.stage3);
        const { encodedResult, progress } = await encodedPage.evaluate(async input => {
            const progress = [];
            const encodedResult = await window.stage3.buildAndRun(input, { onProgress: value => progress.push(value) });
            return { encodedResult, progress };
        }, hello(marker+'_encoded'));
        record('http_encoded_gzip', encodedResult);
        assert.equal(encodedResult.status, 'success', encodedResult.diagnostics);
        assert.equal(encodedResult.stdout, marker+'_encoded\n');
        assert.ok(progress.some(value => value.loadedBytes > 0));
        assert.ok(progress.every(value => value.totalBytes === null));
        assert.equal(await encodedPage.evaluate(() => window.stage3.getActiveWorkerCount()), 0);
    } finally { await encodedContext.close(); }
    const provenance=JSON.parse(await readFile(`${root}/stage2/provenance.json`,'utf8'));
    const assets=JSON.parse(await readFile(`${root}/toolchain/assets.json`,'utf8'));
    const toolchain=JSON.parse(await readFile(`${root}/toolchain/toolchain.lock.json`,'utf8'));
    await writeFile(`${root}/stage3-result.json`,JSON.stringify({passed:true,date:new Date().toISOString(),browser:browser.version(),provenance,assets,toolchain,results,requests},null,2)+'\n');
    await page.screenshot({path:`${root}/stage3-browser.png`,fullPage:true});
    console.log('PASS: full browser pipeline, contracts, UTF-8 stdin/EOF, failures, cancellation, limits, recovery and UI.');
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
