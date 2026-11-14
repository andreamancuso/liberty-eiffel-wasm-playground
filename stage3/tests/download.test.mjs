import assert from 'node:assert/strict';
import test from 'node:test';
import { createDownloads } from '../download.mjs';

function stream(headers = {}) {
    let controller;
    const response = new Response(new ReadableStream({ start(value) { controller = value; } }), { headers });
    return { response, controller };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('parallel transfers use a fixed total and finish only after every body', async () => {
    const events = [];
    let complete = false;
    const read = createDownloads(['a', 'b'], value => events.push(value), () => { complete = true; });
    const a = stream({ 'Content-Length': '4' }), b = stream({ 'Content-Length': '2' });
    const first = read('a', a.response);
    assert.equal(events.at(-1).totalBytes, null);
    const second = read('b', b.response);
    assert.deepEqual(events.at(-1), { loadedBytes: 0, totalBytes: 6 });
    a.controller.enqueue(new Uint8Array([1, 2]));
    b.controller.enqueue(new Uint8Array([5, 6])); b.controller.close();
    await second;
    assert.deepEqual(events.at(-1), { loadedBytes: 4, totalBytes: 6 });
    assert.equal(complete, false);
    a.controller.enqueue(new Uint8Array([3, 4])); a.controller.close();
    assert.deepEqual([...await first], [1, 2, 3, 4]);
    assert.equal(complete, true);
    assert.deepEqual(events.at(-1), { loadedBytes: 6, totalBytes: 6 });
});

test('unknown, invalid and HTTP-decoded lengths stay indeterminate', async () => {
    for (const headers of [{}, { 'Content-Length': '0' }, { 'Content-Length': '-1' },
        { 'Content-Length': 'NaN' }, { 'Content-Length': '9007199254740992' },
        { 'Content-Length': '1', 'Content-Encoding': 'gzip' }]) {
        const events = [];
        const read = createDownloads(['a'], value => events.push(value));
        const { response, controller } = stream(headers);
        const result = read('a', response);
        controller.enqueue(new Uint8Array(3)); controller.close(); await result;
        assert.equal(events.at(-1).loadedBytes, 3);
        assert.ok(events.every(value => value.totalBytes === null));
    }
});

test('incorrect lengths cannot produce a misleading completed percentage', async () => {
    for (const length of ['2', '4']) {
        const events = [];
        const read = createDownloads(['a'], value => events.push(value));
        const { response, controller } = stream({ 'Content-Length': length });
        const result = read('a', response);
        controller.enqueue(new Uint8Array(3)); controller.close(); await result;
        assert.deepEqual(events.at(-1), { loadedBytes: 3, totalBytes: null });
    }
});

test('a failed stream never announces completed loading', async () => {
    let complete = false;
    const read = createDownloads(['a', 'b'], () => {}, () => { complete = true; });
    const a = stream(), b = stream();
    const first = read('a', a.response), second = read('b', b.response);
    const rejected = assert.rejects(first, /connection lost/);
    a.controller.error(new Error('connection lost'));
    await rejected;
    b.controller.close(); await second;
    assert.equal(complete, false);
});

test('chunk updates are throttled while response boundaries are delivered', async () => {
    const events = [];
    const read = createDownloads(['a'], value => events.push(value));
    const { response, controller } = stream({ 'Content-Length': '50' });
    const result = read('a', response);
    for (let i = 0; i < 50; i++) controller.enqueue(new Uint8Array(1));
    await tick(); controller.close(); await result;
    assert.ok(events.length < 10);
    assert.deepEqual(events.at(-1), { loadedBytes: 50, totalBytes: 50 });
});
