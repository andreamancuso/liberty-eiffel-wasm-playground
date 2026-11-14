import API from "./toolchain/runtime.mjs";
import { createDownloads } from "../download.mjs";
import { ConsoleFS, OUTPUT_LIMIT, OutputLimitError } from "./filesystem.mjs";
import { readBuffer, readModule } from "./assets.mjs";

export async function runApp(module, fs, name, args = [], onStart = () => {}) {
  const app = new API.App(module, fs, name, ...args);
  await app.ready;
  onStart();
  let exitCode = 0;
  try {
    app.exports._start();
  } catch (error) {
    if (error instanceof API.ProcExit) exitCode = error.code;
    else throw error;
  }
  return { exitCode, linearMemoryBytes: app.exports.memory.buffer.byteLength };
}

export async function createToolchain(onDiagnostic, download) {
  const api = new API({
    readBuffer: (name) => readBuffer(name, download),
    compileStreaming: (name) => readModule(name, download),
    hostWrite: onDiagnostic,
    MemFS: ConsoleFS,
    clang: "clang.wasm",
    lld: "lld.wasm",
    memfs: "memfs.wasm",
    sysroot: "sysroot.tar",
    clangResourceInclude: "/lib/clang/22/include",
    clangExtraArgs: ["-internal-isystem", "/include/wasm32-wasip1"],
  });
  await api.ready;
  return api;
}

export async function buildC(
  artifacts,
  onPhase = () => {},
  onProgress = () => {},
) {
  if (
    Object.values(artifacts).some((text) =>
      /^\s*#\s*define\s+SE_EXCEPTIONS\b/m.test(text),
    )
  )
    return {
      status: "unsupported_feature",
      phase: "c_compile",
      diagnostics: "rescue/retry is not supported by this WASI runtime.",
      wasm: null,
    };
  let diagnostics = "",
    phase = "loading_backend";
  const diagnostic = (text) => {
    diagnostics += text;
    if (diagnostics.length > OUTPUT_LIMIT)
      throw new OutputLimitError("Compiler diagnostics exceeded 1 MiB.");
  };
  const download = createDownloads(
    ["clang.wasm", "lld.wasm", "memfs.wasm", "sysroot.tar"],
    onProgress,
    () => {
      phase = "preparing_backend";
      onPhase(phase);
    },
  );
  try {
    onPhase(phase);
    const [api, clang, lld] = await Promise.all([
      createToolchain(diagnostic, download),
      readModule("clang.wasm", download),
      readModule("lld.wasm", download),
    ]);
    diagnostics = "";
    api.memfs.addDirectory("work");
    for (const [name, text] of Object.entries(artifacts)) {
      api.memfs.addFile(`work/${name}`, text);
    }
    const sources = Object.keys(artifacts).filter((name) =>
      name.endsWith(".c"),
    );
    phase = "c_compile";
    onPhase(phase);
    const objects = [];
    const memories = {};
    for (const name of sources) {
      const obj = `/work/${name}.o`;
      const result = await runApp(clang, api.memfs, "clang", [
        "-cc1",
        "-triple",
        "wasm32-unknown-wasi",
        "-emit-obj",
        ...api.clangCommonArgs.filter((arg) => arg !== "-fcolor-diagnostics"),
        "-D_WASI_EMULATED_SIGNAL",
        "-O0",
        "-x",
        "c",
        "-std=gnu11",
        "-I/work",
        "-o",
        obj,
        `/work/${name}`,
      ]);
      if (result.exitCode !== 0)
        return {
          status: "c_compile_error",
          phase,
          diagnostics,
          exitCode: result.exitCode,
        };
      memories.clang = result.linearMemoryBytes;
      objects.push(obj);
    }
    phase = "link";
    onPhase(phase);
    const lib = "/lib/wasm32-wasip1";
    const linked = await runApp(lld, api.memfs, "wasm-ld", [
      "-z",
      "stack-size=8388608",
      "--max-memory=268435456",
      "-L" + lib,
      `${lib}/crt1.o`,
      ...objects,
      "-lc",
      "-lclang_rt.builtins",
      "-lwasi-emulated-signal",
      "-o",
      "/work/program.wasm",
    ]);
    if (linked.exitCode !== 0)
      return {
        status: "link_error",
        phase,
        diagnostics,
        exitCode: linked.exitCode,
      };
    memories.lld = linked.linearMemoryBytes;
    return {
      status: "success",
      phase,
      diagnostics,
      wasm: api.memfs.getFileContents("work/program.wasm").slice().buffer,
      memories,
    };
  } catch (error) {
    return {
      status:
        phase === "loading_backend" || phase === "preparing_backend"
          ? "initialization_error"
          : "backend_error",
      phase,
      diagnostics: diagnostics + "\n" + (error.stack || error),
      wasm: null,
    };
  }
}

export async function execute(
  wasm,
  stdin,
  onOutput = () => {},
  onStart = () => {},
  onProgress = () => {},
  onDownloaded = () => {},
) {
  let stdout = "",
    stderr = "";
  const output = (text, fd) => {
    if (fd === 2) stderr += text;
    else stdout += text;
    onOutput(text, fd);
  };
  const download = createDownloads(["memfs.wasm"], onProgress, onDownloaded);
  const fs = new ConsoleFS({
    compileStreaming: (name) => readModule(name, download),
    memfsFilename: "memfs.wasm",
    hostWrite: output,
  });
  await fs.ready;
  fs.setInput(stdin);
  try {
    const result = await runApp(
      await WebAssembly.compile(wasm),
      fs,
      "program",
      [],
      onStart,
    );
    fs.flushOutput();
    return {
      status: result.exitCode === 0 ? "success" : "program_error",
      ...result,
      stdout,
      stderr,
    };
  } catch (error) {
    fs.flushOutput();
    return {
      status:
        error instanceof OutputLimitError
          ? "output_limit_exceeded"
          : "runtime_error",
      exitCode: null,
      stdout,
      stderr,
      error: String(error.stack || error),
    };
  }
}
