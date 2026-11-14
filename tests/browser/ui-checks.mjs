import assert from 'node:assert/strict';

export async function setSource(page, source) {
    const editor = page.locator('.cm-content');
    await editor.click(); await editor.press('ControlOrMeta+a'); await page.keyboard.insertText(source);
}
export async function runUI(page, { keyboard = false } = {}) {
    if (keyboard) await page.locator('.cm-content').press('ControlOrMeta+Enter');
    else await page.locator('#run').click();
    await page.waitForFunction(() => !!window.playground.lastResult, null, { timeout:600000 });
    assert.equal(await page.evaluate(() => window.playground.getActiveWorkerCount()), 0);
    return page.evaluate(() => {
        const { status, stdout, stderr, diagnostics, elapsedMs } = window.playground.lastResult;
        return { status, stdout, stderr, diagnostics, elapsedMs };
    });
}

export async function checkLearningUI(page, baseUrl, { full = false } = {}) {
    await page.goto(new URL('#example=contracts', baseUrl).href);
    await page.waitForSelector('.cm-content');
    await page.waitForFunction(() => !!window.playground);
    assert.equal(await page.locator('#example').inputValue(), 'contracts');
    const originalMain = await page.locator('.cm-content').innerText();
    assert.equal((await runUI(page)).stdout, 'Balance: 70\n');
    assert.equal(await page.locator('#errors').isVisible(), false);
    await setSource(page, originalMain.replace('withdraw(30)', 'withdraw(130)'));
    let result = await runUI(page, { keyboard:true });
    assert.equal(result.status, 'program_error', result.diagnostics);
    assert.match(await page.locator('#errors h2').textContent(), /Precondition failed: enough_funds/);
    const sourceLink = page.locator('.source-links button').filter({ hasText:'account.e:' }).first();
    assert.ok(await sourceLink.count(), 'Contract trace should have a link to account.e');
    await sourceLink.click();
    assert.equal(await page.getByRole('tab', { name:'account.e' }).getAttribute('aria-selected'), 'true');
    await page.getByRole('button', { name:'Reset', exact:true }).click();
    await page.getByRole('button', { name:'Cancel', exact:true }).click();
    assert.equal(await page.locator('#example').inputValue(), 'contracts');
    await page.getByRole('button', { name:'Reset', exact:true }).click();
    await page.getByRole('button', { name:'Reset project', exact:true }).click();
    assert.equal(await page.getByRole('tab', { name:'main.e' }).getAttribute('aria-selected'), 'true');
    assert.equal((await runUI(page)).stdout, 'Balance: 70\n');
    if (full) {
        await page.getByRole('tab', { name:'account.e' }).click();
        const account = await page.locator('.cm-content').innerText();
        await setSource(page, account.replace('balance := balance - amount', 'balance := balance - amount - 1'));
        result = await runUI(page);
        assert.equal(result.status, 'program_error');
        assert.match(await page.locator('#errors h2').textContent(), /Postcondition failed: debited/);
        await setSource(page, account.replace('balance := 0', 'balance := -1'));
        result = await runUI(page);
        assert.equal(result.status, 'program_error');
        assert.match(await page.locator('#errors h2').textContent(), /Class invariant failed: non_negative/);
        await page.getByRole('button', { name:'Reset', exact:true }).click();
        await page.getByRole('button', { name:'Reset project', exact:true }).click();
    }

    await page.locator('#example').selectOption('my-program');
    await page.getByRole('button', { name:'Add file', exact:true }).click();
    await page.getByLabel('Filename', { exact:true }).fill('MAIN.e');
    await page.getByRole('button', { name:'Add file', exact:true }).last().click();
    assert.match(await page.getByRole('alert').textContent(), /already/);
    await page.getByLabel('Filename', { exact:true }).fill('helper.e');
    await page.getByRole('button', { name:'Add file', exact:true }).last().click();
    assert.equal(await page.getByRole('tab', { name:'helper.e' }).getAttribute('aria-selected'), 'true');
    await page.locator('.cm-content').click(); await page.locator('.cm-content').press('ControlOrMeta+End');
    await page.keyboard.insertText('\n-- A saved note\n');
    await page.getByRole('tab', { name:'main.e' }).click();
    await page.getByRole('tab', { name:'helper.e' }).click();
    await page.locator('.cm-content').press('ControlOrMeta+z');
    assert.doesNotMatch(await page.locator('.cm-content').innerText(), /A saved note/);
    await page.locator('.cm-content').press('ControlOrMeta+Shift+z');
    assert.match(await page.locator('.cm-content').innerText(), /A saved note/);
    await page.getByRole('button', { name:'Rename', exact:true }).click();
    await page.getByLabel('Filename', { exact:true }).fill('utility.e');
    await page.getByRole('button', { name:'Rename', exact:true }).last().click();
    assert.ok(await page.getByRole('tab', { name:'utility.e' }).count());
    await page.getByLabel('Run file', { exact:true }).selectOption('utility.e');
    assert.equal(await page.getByRole('button', { name:'Delete', exact:true }).isDisabled(), true);
    await page.getByLabel('Run file', { exact:true }).selectOption('main.e');
    await page.getByRole('button', { name:'Delete', exact:true }).click();
    await page.getByRole('button', { name:'Delete', exact:true }).last().click();
    assert.equal(await page.getByRole('tab', { name:'utility.e' }).count(), 0);
    await page.getByRole('button', { name:'Rename', exact:true }).click();
    await page.getByLabel('Filename', { exact:true }).fill('hello.e');
    await page.getByRole('button', { name:'Rename', exact:true }).last().click();
    await setSource(page, 'class HELLO create {} make feature {} make do io.put_string("Saved draft%N") end end');
    await page.locator('#stdin').fill('Saved input');
    await page.locator('#example').selectOption('hello');
    await page.locator('#example').selectOption('my-program');
    assert.match(await page.locator('.cm-content').innerText(), /Saved draft/);
    assert.equal((await runUI(page, { keyboard:true })).stdout, 'Saved draft\n');
    await page.reload(); await page.waitForSelector('.cm-content'); await page.waitForFunction(() => !!window.playground);
    assert.equal(await page.locator('#example').inputValue(), 'my-program');
    assert.match(await page.locator('.cm-content').innerText(), /Saved draft/);
    assert.equal(await page.locator('#stdin').inputValue(), 'Saved input');
    await page.goto(new URL('#example=input', baseUrl).href);
    await page.waitForFunction(() => document.getElementById('example').value === 'input');
    assert.equal(await page.locator('#stdin').inputValue(), 'Ada\n');

    await page.locator('.cm-content').click();
    await page.locator('.cm-content').press('Escape'); await page.keyboard.press('Tab');
    assert.equal(await page.locator('.cm-content').evaluate(element => element.contains(document.activeElement)), false);
    await page.getByRole('button', { name:'Hide notes' }).click();
    assert.equal(await page.locator('#notes').count(), 0);
    await page.getByRole('button', { name:'Show notes' }).click();
    await page.setViewportSize({ width:390, height:844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Narrow layout must not overflow');
    await page.setViewportSize({ width:1280, height:900 });
    return { name:'learning_workspace', status:'success' };
}

export async function checkUnavailableStorage(browser, url) {
    const context = await browser.newContext();
    try {
        await context.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('Unavailable'); } }); });
        const page = await context.newPage(); await page.goto(url); await page.waitForSelector('.cm-content');
        await page.waitForFunction(() => !!window.playground);
        assert.match(await page.locator('.saving-notice').textContent(), /this tab/);
        assert.equal((await runUI(page)).stdout, 'Hello, world!\n');
    } finally { await context.close(); }
}

export async function checkLibraryUI(page, baseUrl) {
    await page.goto(new URL('#example=library-loans', baseUrl).href);
    await page.waitForSelector('.cm-content');
    await page.waitForFunction(() => !!window.playground && document.getElementById('example').value === 'library-loans');
    const catalogue = await (await page.request.get(new URL('examples.json', baseUrl).href)).json();
    const example = catalogue.find(value => value.id === 'library-loans');
    assert.ok(example);
    assert.equal(await page.getByRole('tab').count(), 4);
    assert.equal(await page.getByLabel('Run file', { exact:true }).inputValue(), 'main.e');
    let result = await runUI(page);
    assert.equal(result.status, 'success', result.diagnostics);
    assert.equal(result.stdout, example.expectedOutput);
    assert.equal(await page.locator('#errors').isVisible(), false);
    // CodeMirror virtualizes long files: DOM text is not the complete document.
    const source = example.files['main.e'];
    await setSource(page, source.replace('library.borrow(intro, ada)', 'library.borrow(intro, ada)\n         library.borrow(intro, grace)'));
    result = await runUI(page);
    assert.equal(result.status, 'program_error', result.diagnostics);
    assert.match(await page.locator('#errors h2').textContent(), /Precondition failed: book_available/);
    await page.locator('.source-links button').filter({ hasText:'library.e:' }).first().click();
    assert.equal(await page.getByRole('tab', { name:'library.e' }).getAttribute('aria-selected'), 'true');
    assert.match(await page.locator('.cm-content').innerText(), /within_loan_limit/);
    await page.getByRole('button', { name:'Reset', exact:true }).click();
    await page.getByRole('button', { name:'Reset project', exact:true }).click();
    assert.equal(await page.getByRole('tab', { name:'main.e' }).getAttribute('aria-selected'), 'true');
    result = await runUI(page);
    assert.equal(result.status, 'success', result.diagnostics);
    assert.equal(result.stdout, example.expectedOutput);
    assert.equal(await page.locator('#errors').isVisible(), false);
    return { name:'library_workspace', status:'success', elapsedMs:result.elapsedMs };
}
