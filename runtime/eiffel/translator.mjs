import createCompiler from "./compiler.mjs";

export async function initialize({ stdout, stderr, onPhase = () => {} }) {
  const started = performance.now();
  onPhase("loading");
  const fileURLToPath =
    typeof process !== "undefined" && process.versions?.node
      ? (await import("node:url")).fileURLToPath
      : null;
  const packageUrl = new URL("./compiler.data", import.meta.url);
  let packageBytes;
  if (fileURLToPath) {
    const bytes = await (await import("node:fs/promises")).readFile(packageUrl);
    packageBytes = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
  } else {
    const response = await fetch(packageUrl);
    if (!response.ok)
      throw new Error(`Cannot load compiler library: HTTP ${response.status}.`);
    packageBytes = await response.arrayBuffer();
  }
  const module = await createCompiler({
    getPreloadedPackage: (_name, expectedSize) => {
      if (packageBytes.byteLength !== expectedSize)
        throw new Error("Compiler library package has the wrong size.");
      return packageBytes;
    },
    locateFile: (name) => {
      const url = new URL(name, import.meta.url);
      return fileURLToPath ? fileURLToPath(url) : url.href;
    },
    print: (text) => stdout.push(text),
    printErr: (text) => stderr.push(text),
    preRun: [
      (instance) => {
        instance.ENV.LIBERTY_CONF = "/liberty/liberty.se";
        instance.ENV.HOME = "/home/playground";
        instance.ENV.USER = "playground";
        instance.FS.mkdirTree("/home/playground");
        instance.FS.mkdirTree("/work");
        instance.FS.chdir("/work");
      },
    ],
  });
  return { module, initializationMs: performance.now() - started };
}

export function translate(module, input, stdout, stderr) {
  for (const [name, text] of Object.entries(input.files))
    module.FS.writeFile(`/work/${name}`, text);
  const started = performance.now();
  const exitCode = module.callMain([
    "-no_gc",
    "-no_split",
    "-all_check",
    "-o",
    "program",
    input.rootClass,
  ]);
  const compilationMs = performance.now() - started;
  const artifacts = {};
  if (exitCode === 0) {
    for (const name of module.FS.readdir("/work")) {
      if (name === "." || name === ".." || Object.hasOwn(input.files, name))
        continue;
      const file = `/work/${name}`;
      if (module.FS.isFile(module.FS.stat(file).mode))
        artifacts[name] = module.FS.readFile(file, { encoding: "utf8" });
    }
  }
  return {
    status: exitCode === 0 ? "success" : "compiler_error",
    exitCode,
    stdout,
    stderr,
    artifacts,
    compilationMs,
    linearMemoryBytes: module.HEAPU8.buffer.byteLength,
  };
}
