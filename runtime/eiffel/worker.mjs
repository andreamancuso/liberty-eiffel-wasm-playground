self.onmessage = async ({ data: input }) => {
    const stdout = [], stderr = [];
    let phase = 'loading';
    const started = performance.now();
    try {
        self.postMessage({ type: 'phase', phase });
        const { initialize, translate } = await import('./translator.mjs');
        const { module, initializationMs } = await initialize({ stdout, stderr });
        phase = 'compiling';
        self.postMessage({ type: 'phase', phase });
        const result = translate(module, input, stdout, stderr);
        const resources = performance.getEntriesByType('resource').map(entry => ({
            name: entry.name, transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize,
            decodedBodySize: entry.decodedBodySize, durationMs: entry.duration,
        }));
        self.postMessage({ type: 'result', result: { ...result, initializationMs, resources, elapsedMs: performance.now() - started } });
    } catch (error) {
        self.postMessage({ type: 'result', result: {
            status: phase === 'loading' ? 'initialization_error' : 'runtime_error', exitCode: null,
            stdout, stderr: [...stderr, String(error.stack || error)], artifacts: {}, elapsedMs: performance.now() - started,
        } });
    }
};
