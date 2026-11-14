// Count response-body bytes, comparing them only with lengths in the same units.
// The expected set is fixed before fetching so the percentage has a stable total.
export function createDownloads(names, onProgress = () => {}, onComplete = () => {}) {
    const assets = new Map(names.map(name => [name, { loaded: 0, total: null, done: false }]));
    let lastSent = -Infinity, failed = false;
    const report = (force = false) => {
        const now = performance.now();
        if (!force && now - lastSent < 100) return;
        lastSent = now;
        const values = [...assets.values()];
        onProgress({
            loadedBytes: values.reduce((sum, asset) => sum + asset.loaded, 0),
            totalBytes: values.every(asset => asset.total !== null)
                ? values.reduce((sum, asset) => sum + asset.total, 0) : null,
        });
    };
    return async (name, response) => {
        const asset = assets.get(name);
        if (!asset) throw new Error(`Unexpected download: ${name}`);
        const encoding = response.headers.get('Content-Encoding');
        const length = response.headers.get('Content-Length');
        const total = length && /^\d+$/.test(length) ? Number(length) : NaN;
        asset.total = (!encoding || encoding === 'identity') && Number.isSafeInteger(total) && total > 0 ? total : null;
        report(true);
        const chunks = [];
        const accept = bytes => {
            chunks.push(bytes);
            asset.loaded += bytes.byteLength;
            if (asset.total !== null && asset.loaded > asset.total) asset.total = null;
            report();
        };
        try {
            if (response.body) {
                const reader = response.body.getReader();
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        accept(value);
                    }
                } finally { reader.releaseLock(); }
            } else accept(new Uint8Array(await response.arrayBuffer()));
            if (asset.total !== null && asset.loaded !== asset.total) asset.total = null;
            asset.done = true;
            report(true);
            if (!failed && [...assets.values()].every(asset => asset.done)) onComplete();
            const bytes = new Uint8Array(asset.loaded);
            let offset = 0;
            for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
            return bytes;
        } catch (error) { failed = true; throw error; }
    };
}
