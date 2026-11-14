export async function readBuffer(name, download) {
  const url = new URL(`./toolchain/${name}`, import.meta.url);
  if (url.protocol === "file:") {
    const data = await (await import("node:fs/promises")).readFile(url);
    return data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    );
  }
  const response = await fetch(new URL(url.href + ".gz"));
  if (!response.ok)
    throw new Error(`Cannot load ${name}: HTTP ${response.status}`);
  // fetch decodes Content-Encoding automatically. Some static hosts serve .gz
  // as opaque files, while others attach that header; support both deliveries.
  let bytes = download
    ? await download(name, response)
    : new Uint8Array(await response.arrayBuffer());
  if (bytes[0] === 0x1f && bytes[1] === 0x8b)
    bytes = new Uint8Array(
      await new Response(
        new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
      ).arrayBuffer(),
    );
  const valid = name.endsWith(".wasm")
    ? bytes[0] === 0 &&
      bytes[1] === 0x61 &&
      bytes[2] === 0x73 &&
      bytes[3] === 0x6d
    : name === "sysroot.tar" &&
      bytes.length >= 1024 &&
      bytes.length % 512 === 0 &&
      new TextDecoder().decode(bytes.subarray(257, 262)) === "ustar";
  if (!valid) throw new Error(`Cannot load ${name}: invalid toolchain payload`);
  return bytes.buffer;
}
export async function readModule(name, download) {
  return WebAssembly.compile(await readBuffer(name, download));
}
