# Liberty Eiffel: Emscripten stage 1

Stage 2 now ports the compiler itself to the browser. See the
[stage 2 instructions](../stage2/README.md) for its build, editable harness,
JavaScript interface, verification, and limits.

The [recorded browser check](../stage1-result.json) passed on 2026-11-14 with
Emscripten 7.0.0 and Chromium 141. Hello output and the intentional assertion
failure both behaved as expected. This stage required no changes to Liberty's
compiler or runtime sources.

This experiment checks the first prerequisite for a browser-only playground:
can a native Liberty compiler generate C that Emscripten compiles into a working
browser program?

```text
Docker:  native Liberty compiler -> C -> Emscripten -> .mjs + .wasm
Browser: static files -> WebAssembly execution -> Eiffel output
```

Compilation happens during the Docker build. This stage does not put the Eiffel
compiler or a C compiler in the browser and does not provide an editor.

## Build and verify

Requirements: Git, PowerShell and Docker Desktop with Linux containers. Run from the playground root:

```powershell
.\build-stage1.ps1
```

The build targets `linux/amd64`. It uses the pinned `liberty` submodule by
default, or an explicit `-LibertySource` checkout. It reuses the native compiler
seed, building it with the upstream installer when absent. The Debian base and
Emscripten 7.0.0 image are pinned by digest; Debian package repositories remain
live. The first build needs network access; allow at least half an hour for
the full upstream bootstrap, which also builds auxiliary tools.
Subsequent builds reuse Docker's cache. Upstream shell scripts are normalized
to LF inside the build image to support Git for Windows checkouts.

Each example uses `-no_gc -no_split -all_check`, and generated C uses `-O0`.
Garbage collection is disabled; this stage verifies short-lived programs.
Generated C is retained in the output for inspection.
Clang reports `-Wunused-value` warnings for comma expressions in the generated
C; they do not prevent linking or the verified browser behavior.

The Chromium smoke runs in a separate Docker container with external networking
disabled. It checks actual browser execution of both WASM modules, exact hello
output (`Hello from Liberty Eiffel and WebAssembly!` and `42`), and an intentional
Eiffel assertion failure with exit status 1 and its assertion label in the
diagnostic. Unexpected browser errors and failed requests fail verification.

Artifacts are written to `artifacts/site/` (ignored by Git):

- `index.html`, `hello.mjs`, `hello.wasm`, and the assertion example.
- `generated/`: the Eiffel compiler's C, headers, and native build recipes.
- `emscripten-version.txt`: the actual compiler version.
- `browser-result.json` and `browser-smoke.png`: browser verification evidence.

To run the commands individually from the repository root:

```sh
docker build --platform linux/amd64 -f Dockerfile.native --build-context liberty_source=./liberty -t liberty-emscripten:stage1-native .
docker build --platform linux/amd64 -f Dockerfile --build-context liberty_source=./liberty --target artifacts --output type=local,dest=artifacts/site .
docker build --platform linux/amd64 -f Dockerfile.browser -t liberty-emscripten:stage1-browser .
docker run --rm --platform linux/amd64 --network none --mount type=bind,source=/absolute/path/to/liberty-eiffel-wasm-playground/artifacts/site,target=/artifacts liberty-emscripten:stage1-browser
```

The next feasibility step is compiling Liberty's compiler itself to WebAssembly
and having it translate edited Eiffel in the browser. Browser compilation of
the generated C is a later step.
