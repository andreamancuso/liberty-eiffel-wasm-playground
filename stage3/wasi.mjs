import API from './toolchain/runtime.mjs';
import { createDownloads } from './download.mjs';
export const OUTPUT_LIMIT = 1048576;
export class OutputLimitError extends Error {}

export class ConsoleFS extends API.MemFS {
    constructor(options) {
        super(options);
        this.input = new Uint8Array(); this.position = 0;
        this.decoders = { 1: new TextDecoder(), 2: new TextDecoder() };
        this.bytesWritten = 0;
        this.nodes = new Map();
    }
    addDirectory(path) { super.addDirectory(path); this.nodes.set(path.replace(/^\/+|\/$/g, ''), 'directory'); }
    addFile(path, contents) { super.addFile(path, contents); this.nodes.set(path.replace(/^\/+/, ''), 'file'); }
    getFileContents(path) {
        path = path.replace(/^\/+/, '');
        if (this.nodes.get(path) !== 'file') throw new Error(`Not a regular file: ${path}`);
        return super.getFileContents(path);
    }
    setInput(text) { this.input = new TextEncoder().encode(text); this.position = 0; }
    host_read(fd, iovs, count, nread) {
        if (fd !== 0) return 8; // WASI EBADF
        this.hostMem_.check();
        let read = 0;
        for (let i = 0; i < count; i++, iovs += 8) {
            const size = Math.min(this.hostMem_.read32(iovs + 4), this.input.length - this.position);
            this.hostMem_.write(this.hostMem_.read32(iovs), this.input.subarray(this.position, this.position + size));
            this.position += size; read += size;
        }
        this.hostMem_.write32(nread, read);
        return 0;
    }
    host_write(fd, iovs, count, written) {
        if (fd !== 1 && fd !== 2) return 8;
        this.hostMem_.check();
        let size = 0;
        for (let i = 0; i < count; i++, iovs += 8) {
            const start = this.hostMem_.read32(iovs), length = this.hostMem_.read32(iovs + 4);
            this.bytesWritten += length;
            if (this.bytesWritten > OUTPUT_LIMIT) throw new OutputLimitError('Program output exceeded 1 MiB.');
            this.hostWrite(this.decoders[fd].decode(this.hostMem_.u8.subarray(start, start + length), { stream: true }), fd);
            size += length;
        }
        this.hostMem_.write32(written, size);
        return 0;
    }
    flushOutput() {
        for (const fd of [1, 2]) { const text = this.decoders[fd].decode(); if (text) this.hostWrite(text, fd); }
    }
}

export async function readBuffer(name, download) {
    const url = new URL(`./toolchain/${name}`, import.meta.url);
    if (url.protocol === 'file:') {
        const data = await (await import('node:fs/promises')).readFile(url);
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    }
    const response = await fetch(new URL(url.href + '.gz'));
    if (!response.ok) throw new Error(`Cannot load ${name}: HTTP ${response.status}`);
    // fetch decodes Content-Encoding automatically. Some static hosts serve .gz
    // as opaque files, while others attach that header; support both deliveries.
    let bytes = download ? await download(name, response) : new Uint8Array(await response.arrayBuffer());
    if (bytes[0] === 0x1f && bytes[1] === 0x8b)
        bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    const valid = name.endsWith('.wasm')
        ? bytes[0] === 0 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d
        : name === 'sysroot.tar' && bytes.length >= 1024 && bytes.length % 512 === 0 && new TextDecoder().decode(bytes.subarray(257, 262)) === 'ustar';
    if (!valid) throw new Error(`Cannot load ${name}: invalid toolchain payload`);
    return bytes.buffer;
}
export async function readModule(name, download) { return WebAssembly.compile(await readBuffer(name, download)); }

export async function runApp(module, fs, name, args = [], onStart = () => {}) {
    const app = new API.App(module, fs, name, ...args);
    await app.ready;
    onStart();
    let exitCode = 0;
    try { app.exports._start(); }
    catch (error) { if (error instanceof API.ProcExit) exitCode = error.code; else throw error; }
    return { exitCode, linearMemoryBytes: app.exports.memory.buffer.byteLength };
}

export async function createToolchain(onDiagnostic, download) {
    const api = new API({ readBuffer: name => readBuffer(name, download), compileStreaming: name => readModule(name, download), hostWrite: onDiagnostic, MemFS: ConsoleFS,
        clang: 'clang.wasm', lld: 'lld.wasm', memfs: 'memfs.wasm', sysroot: 'sysroot.tar',
        clangResourceInclude: '/lib/clang/22/include',
        clangExtraArgs: ['-internal-isystem', '/include/wasm32-wasip1'],
    });
    await api.ready;
    return api;
}

export async function buildC(artifacts, onPhase = () => {}, onProgress = () => {}) {
    if (Object.values(artifacts).some(text => /^\s*#\s*define\s+SE_EXCEPTIONS\b/m.test(text)))
        return { status: 'unsupported_feature', phase: 'c_compile', diagnostics: 'rescue/retry is not supported by this WASI runtime.', wasm: null };
    let diagnostics = '', phase = 'loading_backend';
    const diagnostic = text => { diagnostics += text; if (diagnostics.length > OUTPUT_LIMIT) throw new OutputLimitError('Compiler diagnostics exceeded 1 MiB.'); };
    const download = createDownloads(['clang.wasm', 'lld.wasm', 'memfs.wasm', 'sysroot.tar'], onProgress,
        () => { phase = 'preparing_backend'; onPhase(phase); });
    try {
        onPhase(phase);
        const [api, clang, lld] = await Promise.all([createToolchain(diagnostic, download), readModule('clang.wasm', download), readModule('lld.wasm', download)]);
        diagnostics = '';
        api.memfs.addDirectory('work');
        for (const [name, text] of Object.entries(artifacts)) {
            if (!/^[a-zA-Z][a-zA-Z0-9_]*\.(c|h|id|make)$/.test(name) || typeof text !== 'string') throw new Error('Invalid generated artifact filename or contents.');
            api.memfs.addFile(`work/${name}`, text);
        }
        const sources = Object.keys(artifacts).filter(name => name.endsWith('.c'));
        if (!sources.length) throw new Error('No generated C translation unit.');
        phase = 'c_compile'; onPhase(phase);
        const objects = [];
        const memories = {};
        for (const name of sources) {
            const obj = `/work/${name}.o`;
            const result = await runApp(clang, api.memfs, 'clang', ['-cc1', '-triple', 'wasm32-unknown-wasi', '-emit-obj',
                ...api.clangCommonArgs.filter(arg => arg !== '-fcolor-diagnostics'), '-D_WASI_EMULATED_SIGNAL', '-O0', '-x', 'c', '-std=gnu11', '-I/work', '-o', obj, `/work/${name}`]);
            if (result.exitCode !== 0) return { status: 'c_compile_error', phase, diagnostics, exitCode: result.exitCode };
            memories.clang = result.linearMemoryBytes;
            objects.push(obj);
        }
        phase = 'link'; onPhase(phase);
        const lib = '/lib/wasm32-wasip1';
        const linked = await runApp(lld, api.memfs, 'wasm-ld', ['-z', 'stack-size=8388608',
            '--max-memory=268435456', '-L' + lib, `${lib}/crt1.o`, ...objects,
            '-lc', '-lclang_rt.builtins', '-lwasi-emulated-signal', '-o', '/work/program.wasm']);
        if (linked.exitCode !== 0) return { status: 'link_error', phase, diagnostics, exitCode: linked.exitCode };
        memories.lld = linked.linearMemoryBytes;
        return { status: 'success', phase, diagnostics, wasm: api.memfs.getFileContents('work/program.wasm').slice().buffer, memories };
    } catch (error) { return { status: phase === 'loading_backend' || phase === 'preparing_backend' ? 'initialization_error' : 'backend_error', phase, diagnostics: diagnostics + '\n' + (error.stack || error), wasm: null }; }
}

export async function execute(wasm, stdin, onOutput = () => {}, onStart = () => {}, onProgress = () => {}, onDownloaded = () => {}) {
    let stdout = '', stderr = '';
    const output = (text, fd) => { if (fd === 2) stderr += text; else stdout += text; onOutput(text, fd); };
    const download = createDownloads(['memfs.wasm'], onProgress, onDownloaded);
    const fs = new ConsoleFS({ compileStreaming: name => readModule(name, download), memfsFilename: 'memfs.wasm', hostWrite: output });
    await fs.ready;
    fs.setInput(stdin);
    try {
        const result = await runApp(await WebAssembly.compile(wasm), fs, 'program', [], onStart);
        fs.flushOutput();
        return { status: result.exitCode === 0 ? 'success' : 'program_error', ...result, stdout, stderr };
    } catch (error) {
        fs.flushOutput();
        return { status: error instanceof OutputLimitError ? 'output_limit_exceeded' : 'runtime_error', exitCode: null, stdout, stderr, error: String(error.stack || error) };
    }
}
