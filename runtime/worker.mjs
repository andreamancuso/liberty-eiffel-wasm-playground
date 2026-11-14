self.onmessage = async ({ data }) => {
  let phase = data.action === "build" ? "loading_backend" : "loading_program";
  let pending = { 1: "", 2: "" },
    sent = false;
  const setPhase = (value) => {
    phase = value;
    self.postMessage({ type: "phase", phase });
  };
  const onProgress = (progress) =>
    self.postMessage({ type: "progress", progress: { phase, ...progress } });
  const flush = () => {
    for (const fd of [1, 2]) {
      if (pending[fd]) {
        self.postMessage({ type: "output", fd, text: pending[fd] });
        pending[fd] = "";
        sent = true;
      }
    }
  };
  try {
    self.postMessage({ type: "phase", phase });
    const wasi = await import("./wasi/program.mjs");
    let result;
    if (data.action === "build") {
      result = await wasi.buildC(data.artifacts, setPhase, onProgress);
    } else {
      result = await wasi.execute(
        data.wasm,
        data.stdin,
        (text, fd) => {
          pending[fd] += text;
          if (!sent || pending[fd].length >= 4096) flush();
        },
        () => setPhase("execute"),
        onProgress,
        () => setPhase("preparing_program"),
      );
    }
    flush();
    result.resources = performance
      .getEntriesByType("resource")
      .map((entry) => ({
        name: entry.name,
        transferSize: entry.transferSize,
        encodedBodySize: entry.encodedBodySize,
        durationMs: entry.duration,
      }));
    self.postMessage(
      { type: "result", result },
      result.wasm ? [result.wasm] : [],
    );
  } catch (error) {
    flush();
    self.postMessage({
      type: "result",
      result: {
        status: /^(loading|preparing)_/.test(phase)
          ? "initialization_error"
          : "runtime_error",
        phase,
        error: String(error.stack || error),
      },
    });
  }
};
