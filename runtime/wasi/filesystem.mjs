import API from "./toolchain/runtime.mjs";
export const OUTPUT_LIMIT = 1048576;
export class OutputLimitError extends Error {}

export class ConsoleFS extends API.MemFS {
  constructor(options) {
    super(options);
    this.input = new Uint8Array();
    this.position = 0;
    this.decoders = { 1: new TextDecoder(), 2: new TextDecoder() };
    this.bytesWritten = 0;
    this.nodes = new Map();
  }
  addDirectory(path) {
    super.addDirectory(path);
    this.nodes.set(path.replace(/^\/+|\/$/g, ""), "directory");
  }
  addFile(path, contents) {
    super.addFile(path, contents);
    this.nodes.set(path.replace(/^\/+/, ""), "file");
  }
  getFileContents(path) {
    path = path.replace(/^\/+/, "");
    if (this.nodes.get(path) !== "file")
      throw new Error(`Not a regular file: ${path}`);
    return super.getFileContents(path);
  }
  setInput(text) {
    this.input = new TextEncoder().encode(text);
    this.position = 0;
  }
  host_read(fd, iovs, count, nread) {
    if (fd !== 0) return 8; // WASI EBADF
    this.hostMem_.check();
    let read = 0;
    for (let i = 0; i < count; i++, iovs += 8) {
      const size = Math.min(
        this.hostMem_.read32(iovs + 4),
        this.input.length - this.position,
      );
      this.hostMem_.write(
        this.hostMem_.read32(iovs),
        this.input.subarray(this.position, this.position + size),
      );
      this.position += size;
      read += size;
    }
    this.hostMem_.write32(nread, read);
    return 0;
  }
  host_write(fd, iovs, count, written) {
    if (fd !== 1 && fd !== 2) return 8;
    this.hostMem_.check();
    let size = 0;
    for (let i = 0; i < count; i++, iovs += 8) {
      const start = this.hostMem_.read32(iovs),
        length = this.hostMem_.read32(iovs + 4);
      this.bytesWritten += length;
      if (this.bytesWritten > OUTPUT_LIMIT)
        throw new OutputLimitError("Program output exceeded 1 MiB.");
      this.hostWrite(
        this.decoders[fd].decode(
          this.hostMem_.u8.subarray(start, start + length),
          { stream: true },
        ),
        fd,
      );
      size += length;
    }
    this.hostMem_.write32(written, size);
    return 0;
  }
  flushOutput() {
    for (const fd of [1, 2]) {
      const text = this.decoders[fd].decode();
      if (text) this.hostWrite(text, fd);
    }
  }
}
