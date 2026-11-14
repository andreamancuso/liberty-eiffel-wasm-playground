# Stage 3: browser-only compile and run

Edited Eiffel is translated by Liberty's Emscripten-built WASM compiler, compiled
as C by browser-hosted Clang, linked by browser-hosted LLD, and executed as a
WASI command. No source or compilation request goes to a server.

## Build, verify, and open

From the playground repository root, with Git, PowerShell and Docker Desktop:

```powershell
git submodule update --init --recursive
.\build-stage3.ps1
```

`-LibertySource C:\dev\LibertyFork` selects a development checkout;
`-RebuildNative` rebuilds the native bootstrap seed. The default source is the
clean pinned submodule. Builds require internet access for dependencies. Tests
run with external networking disabled. The native bootstrap and tool downloads
are cached; a clean native bootstrap can take half an hour.

The runner runs all stage 2 and stage 1 checks, downloads and verifies the C
toolchain, probes WASI compatibility and the WASM C compiler under Node, packages
the static site, then runs the browser acceptance suite.

Serve the result using the verifier image's Python:

```powershell
docker run --rm --platform linux/amd64 -p 127.0.0.1:8084:8000 `
  --mount 'type=bind,source=C:\dev\liberty-eiffel-wasm-playground\artifacts\stage3,target=/site,readonly' `
  --entrypoint python3 liberty-emscripten:stage3-browser `
  -m http.server 8000 --bind 0.0.0.0 --directory /site
```

Open `http://localhost:8084`. Edit the source, optionally supply stdin text, and
choose **Run**. **Stop** cancels loading, compilation, linking or running.
Choose an example to explore its explanation and suggested edit, or use
**My program** for your own project. File tabs preserve editing history; add,
rename, and delete controls manage class files. **Run file** selects the entry
class independently of the active editor tab. Ctrl/Cmd+Enter also runs the project;
press Escape then Tab to leave the editor. Files and input are restored locally
between visits; **Reset** restores the selected example after confirming edits.
Links such as `#example=contracts` select an example directly.
The page shows output and relevant Eiffel/program errors. Successful builds do
not display backend warnings. Generated C and headers remain available in API
results; the stage 2 compiler is available separately at `/stage2/`.

No COOP/COEP headers, SharedArrayBuffer, or external CDN is required. This stage
targets desktop Chromium. The standalone beta uses GitHub Pages with manual
releases; beyond-tabs.com links to it. See [publishing](../docs/publishing.md)
for CI, release verification, and rollback. Generated artifacts are ignored by Git.

## Frontend development

The `ui/` package contains React, TypeScript, Vite, and CodeMirror 6, with the
Eiffel stream mode from `@codemirror/legacy-modes` (upstream:
<https://code.haverbeke.berlin/codemirror/legacy-modes>). Docker packages a local
bundle and dependency licenses alongside the existing runtime modules. The
compiler API and worker assets remain separate from the frontend bundle.

After building stage 3, serve `artifacts/stage3` on port 8084 (as above), then run
`npm ci` and `npm run dev` in `ui/`. Vite proxies runtime asset requests to that
static server. `npm test` checks workspace integrity, local storage fallback,
and diagnostic navigation; `npm run build` type-checks and bundles the UI.
Browser acceptance runs every example and verifies deliberate contract failures,
project editing, saved drafts, keyboard controls, and storage-unavailable mode.

SQLite is a separate feasibility task. There is no database example or browser
persistence for databases in this release.

## Library-loan showcase

Open `#example=library-loans` for the in-memory library example. `main.e` sets up
three books and two borrowers, then borrows and returns books and prints the
catalogue. `library.e` owns a private `LINKED_LIST[BOOK]`; `book.e` holds each
book's current borrower, and `borrower.e` defines names and positive loan limits.
Counts are derived from book state. Loan-state mutators are exported only to
`LIBRARY`, and catalogue membership compares object identity rather than titles.
The example models one library; limits apply within that catalogue.

The primary experiment attempts to borrow an unavailable book. Optional hints
exercise loan limits, return ownership, a missing state update, and the library
invariant after bypassing a precondition. Contracts stop the current run; Reset
restores the valid scenario. Each Run creates fresh domain objects. Existing
draft saving continues to preserve source and input, not library data.

The catalogue source is `ui/src/library-example.ts`. Browser regression tests
verify final assignments and counts, the named negative cases, `old` query
postconditions, and the invariant. Offline and live UI checks cover the direct
link, four files, failure navigation to `library.e`, Reset, and recovery.

## API and lifetime

```javascript
import { buildAndRun } from './client.mjs';
const controller = new AbortController();
const result = await buildAndRun({
    rootClass: 'hello.e',
    files: { 'hello.e': 'class HELLO create {} make feature {} make do io.read_line; io.put_string(io.last_string); io.put_new_line end end' },
    stdin: 'Hello!\n',
}, {
    signal: controller.signal,
    onPhase: phase => console.log(phase),
    onProgress: ({ phase, loadedBytes, totalBytes }) => console.log(phase, loadedBytes, totalBytes),
    onOutput: (text, fd) => console.log(fd === 2 ? 'stderr' : 'stdout', text),
});
```

The input extends stage 2's filename-to-Eiffel-source mapping with optional
UTF-8 stdin text. Input is available before execution and exhaustion returns EOF;
programs cannot wait for new interactive terminal input in this milestone.

The optional `onProgress` callback reports backend response-body bytes within the
current loading phase. `totalBytes` is null until all expected lengths are known,
and stays null when HTTP decompression makes those lengths incomparable. It is
not a percentage of total compilation time or a measure of network traffic on
cached runs. Progress is throttled to roughly ten updates per second, with extra
updates at response boundaries. `preparing_backend` and `preparing_program`
separate completed transfers from tool initialization; the initial Eiffel loader
continues to use indeterminate `loading_frontend` progress.

The UI explains the approximately 25 MB cold download on the current Pages host.
That note disappears after a successful run until the page is reloaded. Browser
caching may reduce later transfers; no permanent cache or stored preference is
introduced.

Results identify `status`, `phase`, `exitCode` or null, separate `stdout` and
`stderr`, compiler `diagnostics`, any runtime `error`, generated `artifacts`,
`wasmBytes`, `elapsedMs`, phase `timings`, resource transfers, and memory
measurements when available. Failure results expose no runnable binary. C output
can remain available for inspection when a later build phase fails.

In addition to stage 2 errors, statuses distinguish `c_compile_error`,
`link_error`, `backend_error`, `unsupported_feature`, `program_error`,
`output_limit_exceeded`, runtime errors, cancellation and deadline expiry.
The underlying C backend is an internal module; its Clang diagnostics and link
errors are retained rather than translated into misleading Eiffel errors.

Each job uses three sequential disposable workers: Liberty translation, C
compilation/linking, then execution. The preceding worker is terminated before
starting the next. The stage 2 JavaScript API is unchanged. HTTP caching applies
between jobs, but tool instances and program state are not reused.

Builds have a 600-second watchdog (`buildTimeoutMs`); execution has a separate
10-second deadline (`runTimeoutMs`). Programs link with an 8 MiB stack and a
256 MiB maximum linear memory. Combined stdout/stderr stops at 1 MiB, returning
`output_limit_exceeded`. Streaming batches bound the number of messages to the
page; the first output is delivered promptly and subsequent small writes are
batched. Cancellation or forced termination may omit the final buffered chunk.
The frontend retains its 1 GiB ceiling. Compiler binaries use their upstream
memory declarations; reported memory is WASM linear memory, not total browser
RSS, JIT code, JavaScript buffers, or downloaded sysroot storage.

## Toolchain, target compatibility, and provenance

`toolchain.lock.json` pins Clang 22.1.8 and LLD's `noeh` builds plus the matching
sysroot from cppstudio-io/wasm-clang-runtime v0.1.0, its runtime source commit,
and WASI SDK 33. Every download is checked against its SHA-256 hash. SDK 33
builds memfs from that source. The Docker build normalizes the sysroot archive,
retains C and Clang resource headers and C runtime libraries, and adds the
matching WASI signal-emulation library. C++ libraries and macOS metadata are
excluded. `assets.json` records the resulting sizes and checksums.

The browser downloads gzip assets from the same static origin and decompresses
them with `DecompressionStream`. Raw assets support the Node probes. Neither the
WASI SDK host compiler nor a host `emcc` process runs during browser requests.
Emscripten 7.0.0 remains the build tool for the Liberty frontend; browser-generated
programs use the WASI ABI instead of Emscripten's JavaScript runtime.

The upstream JavaScript runtime is exported as an ES module and accepts our
filesystem subclass. Our adapter preserves stdout/stderr descriptors, decodes
UTF-8 across write boundaries, supplies stdin as bytes, tracks regular files to
avoid directory lookup traps, and separates command exit codes from WASM traps.
The final program sees only its own ephemeral virtual filesystem, with no host
files or browser network API exposed through WASI.

Liberty's fork now avoids the WASI `setjmp` header for no-rescue programs and
selects the unsupported-process backend for WASI. Programs use `-no_gc
-no_split -all_check`; C compilation uses `-O0`. Assertions retain their runtime
checks. If generated code enables `SE_EXCEPTIONS`, the backend explicitly
rejects rescue/retry as unsupported. Rescue clauses are never silently removed,
and setjmp/longjmp is not replaced with fake recovery behavior.

Stage 1 and stage 2 fixtures plus hello, inheritance, collections, UTF-8 stdin,
EOF and assertion failures are verified. Garbage collection, rescue/retry,
arbitrary native bindings, graphics, and full language/library coverage remain
outside the demonstrated compatibility set.

## Evidence

The [recorded report](../stage3-result.json) includes fresh source markers,
cold/warm durations, frontend/C/link/execution timings, toolchain lock data,
source provenance and request sizes. The runner writes its report and screenshot
to `artifacts/stage3/stage3-result.json` and `stage3-browser.png`.

Acceptance also covers C and link failures, WASM traps, cancellation during all
phases, an infinite loop, output flooding, missing/corrupt compiler assets,
recovery, source editing, visible Eiffel errors, quiet successful runs and Stop. All ordinary requests must be
same-origin GETs. Compilation and execution have no network relay or endpoint.
No compilation-speed cutoff is imposed.
