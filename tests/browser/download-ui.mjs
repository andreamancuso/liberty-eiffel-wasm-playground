import assert from 'node:assert/strict';
import { setSource, runUI } from './ui-checks.mjs';

export async function checkDownloadUI(browser, siteUrl, setDelivery) {
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
    try {
        const page = await context.newPage();
        await page.goto(siteUrl);
        await page.waitForFunction(() => !!window.playground);
        assert.match(await page.locator('#download-note').textContent(), /around 25 MB/);
        assert.equal(await page.locator('#run-progress').count(), 0);
        await setSource(page, 'class MAIN create {} make feature {} make do absent_feature end end');
        assert.equal((await runUI(page)).status, 'compiler_error');
        assert.equal(await page.locator('#download-note').count(), 1);

        await setSource(page, 'class MAIN create {} make feature {} make do io.put_string("Progress works%N") end end');
        setDelivery('slow');
        await page.locator('#run').click();
        await page.waitForFunction(() => {
            const value = Number(document.getElementById('run-progress')?.getAttribute('aria-valuenow'));
            return value > 0 && value < 100;
        }, null, { timeout: 600000 });
        assert.equal(await page.locator('#status').textContent(), 'Loading tools…');
        const first = Number(await page.locator('#run-progress').getAttribute('aria-valuenow'));
        await page.waitForFunction(first => Number(document.getElementById('run-progress')?.getAttribute('aria-valuenow')) > first, first);
        assert.equal(await page.locator('#download-note').count(), 1);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.locator('#stop').click();
        await page.waitForFunction(() => window.playground.lastResult?.status === 'cancelled');
        await page.waitForTimeout(300);
        assert.equal(await page.locator('#run-progress').count(), 0);
        assert.equal(await page.locator('#download-note').count(), 1);
        assert.equal(await page.evaluate(() => window.playground.getActiveWorkerCount()), 0);

        setDelivery('timeout');
        const timeout = await page.evaluate(async () => {
            let updates = 0;
            const result = await window.playground.buildAndRun({ rootClass: 'main.e', files: {
                'main.e': 'class MAIN create {} make feature {} make do end end',
            } }, { buildTimeoutMs: 5000, onProgress: () => updates++ });
            const atFinish = updates;
            await new Promise(resolve => setTimeout(resolve, 300));
            return { status: result.status, phase: result.phase, atFinish, updates };
        });
        assert.equal(timeout.status, 'timed_out');
        assert.equal(timeout.phase, 'loading_backend');
        assert.ok(timeout.updates > 0);
        assert.equal(timeout.updates, timeout.atFinish);
        assert.equal(await page.evaluate(() => window.playground.getActiveWorkerCount()), 0);

        setDelivery('missing');
        assert.equal((await runUI(page)).status, 'initialization_error');
        assert.equal(await page.locator('#download-note').count(), 1);
        assert.equal(await page.locator('#run-progress').count(), 0);

        // Capture callback compatibility and the unknown-length fallback on a real run.
        await page.evaluate(() => {
            const build = window.playground.buildAndRun;
            window.downloadEvents = [];
            window.playground.buildAndRun = (input, options = {}) => build(input, { ...options,
                onProgress: value => { window.downloadEvents.push(value); options.onProgress?.(value); },
            });
        });
        setDelivery('unknown');
        await page.locator('#run').click();
        await page.waitForFunction(() => window.downloadEvents.some(value => value.loadedBytes > 0));
        assert.equal(await page.locator('#run-progress').getAttribute('aria-valuenow'), null);
        await page.waitForFunction(() => window.playground.lastResult?.status === 'success', null, { timeout: 600000 });
        assert.equal(await page.locator('#stdout').textContent(), 'Progress works\n');
        assert.equal(await page.locator('#download-note').count(), 0);
        assert.equal(await page.locator('#run-progress').count(), 0);
        assert.ok(await page.evaluate(() => window.downloadEvents.every(value => value.totalBytes === null)));

        setDelivery('normal');
        assert.equal((await runUI(page)).status, 'success');
        assert.equal((await runUI(page)).status, 'success'); // cache-enabled repeat
        assert.equal(await page.locator('#download-note').count(), 0);
        await page.locator('#example').selectOption('contracts');
        assert.equal(await page.locator('#download-note').count(), 0);
        await page.reload(); await page.waitForFunction(() => !!window.playground);
        assert.equal(await page.locator('#download-note').count(), 1);
        return { name: 'download_progress_ui', status: 'success' };
    } finally { setDelivery('normal'); await context.close(); }
}
