# Stage 2: browser Eiffel-to-C compiler

This stage runs Liberty's actual `compile_to_c` compiler as WebAssembly inside
a dedicated browser worker. Edited source and compilation stay in the browser.
The server serves static assets only. The harness produces C and headers;
compiling and executing those outputs in the browser is a later milestone.

## Build and verify

From `C:\dev\liberty-eiffel-wasm-playground` in PowerShell, with Docker Desktop using Linux containers:

```powershell
.\build-stage2.ps1
```

No host Node, Eiffel compiler, or C compiler is required. Docker builds require
network access. Browser tests run with external networking disabled.

Liberty is supplied as the pinned `liberty` submodule. Use `-LibertySource` to
select a development checkout, and `git submodule update --init --recursive`
after cloning this repo. Compiler/runtime edits belong in that fork checkout;
playground edits belong here.

The runner reuses `liberty-emscripten:stage1-native` as a bootstrap seed, overlays
the current fork's sources, and regenerates the compiler's C. If the seed is
absent, it builds it using the upstream installer; allow at least half an hour.
Use `-RebuildNative` to rebuild that seed explicitly. Compiler and SDK build
layers are cached between runs. Builds target `linux/amd64` and pin the SDK and
browser images by digest. SDK version: Emscripten 7.0.0.

The runner performs these checks:

1. WASM compiler initialization, version, and Eiffel-to-C translation in Node.
2. Real browser translation of a fresh source marker and a multi-file example
   with inheritance and `ARRAY[INTEGER]`.
3. Syntax errors, type errors, missing classes, invalid paths, failure recovery,
   cancellation during loading and compilation, deadline expiry, and missing
   library data during initialization.
4. The editable page, generated-source display, and file download.
5. Offline SDK compilation of the browser-generated C, followed by browser
   execution and exact output checks. This validation is a Docker build, not a
   runtime compiler endpoint.
6. Regenerated stage 1 hello and intentional assertion-failure regressions using
   the current fork's runtime sources, without repeating the native bootstrap.

Outputs are ignored by Git under `artifacts/`:

- `stage2/`: static compiler harness, compiler assets, generated validation C,
  browser report, screenshot, provenance, and combined `stage2-result.json`.
- `stage2-validation/`: offline-compiled validation programs and their execution
  report, including stage 1 results.

The checked-in [recorded report](../stage2-result.json) captures a completed run.
Reports identify the compiler repository, revision, dirty state and source mode,
the native bootstrap image, and a separate playground revision. SHA-256
fingerprints include each repository's Git index plus unstaged and untracked
file contents. Ignored artifacts and the recorded stage 2 report itself are
excluded. The submodule pin is included in the playground index fingerprint;
compiler changes have their own fingerprint.

## Open the harness

After building, serve the output locally using the browser image's Python:

```powershell
docker run --rm --platform linux/amd64 -p 127.0.0.1:8084:8000 `
  --mount 'type=bind,source=C:\dev\liberty-eiffel-wasm-playground\artifacts\stage2,target=/site,readonly' `
  --entrypoint python3 liberty-emscripten:stage2-browser `
  -m http.server 8000 --bind 0.0.0.0 --directory /site
```

Open `http://localhost:8084`, edit Eiffel, and select **Translate to C**. Compiler
diagnostics and generated files appear below the editor. Select a generated file
to inspect or download it. **Cancel** stops the active worker. Stop the local
server with Ctrl+C.

Single-threaded workers require no COOP/COEP headers or SharedArrayBuffer. The
smoke explicitly verifies that the page is not cross-origin isolated. Embedding
on beyond-tabs.com and browser coverage beyond desktop Chromium remain later work.

## JavaScript interface and lifecycle

```javascript
import { compile } from './client.mjs';
const controller = new AbortController();
const result = await compile({
    files: { 'hello.e': 'class HELLO create {} make feature {} make do end end' },
    rootClass: 'hello.e',
}, { signal: controller.signal, onPhase: phase => console.log(phase) });
```

`files` maps `.e` basenames to source text; `rootClass` names a submitted file.
Absolute paths, directories, and non-Eiffel input files are rejected. Files live
in a fresh `/work` filesystem directory. Compiler configuration and the complete
core library, runtime/plugin tree, and short resources are packaged separately
under `/liberty`. `LIBERTY_CONF` selects the supplied minimal configuration.

Results contain `status`, `exitCode` (or null), `stdout`, `stderr`, `artifacts`
(a filename-to-text map), and `elapsedMs`. Compiler results also include
`initializationMs`, `compilationMs`, `linearMemoryBytes`, and resource timings.
Output names follow the root source basename: `-o program` controls the generated
recipe's executable name, not the generated `.c` and `.h` names.

Statuses are `success`, `compiler_error`, `invalid_input`, `initialization_error`,
`runtime_error`, `cancelled`, and `timed_out`. Failed requests return no artifacts.
Each request gets one new worker and compiler instance; completion, errors,
cancellation, and timeout all terminate it. Workers are never reused after
`callMain` because the compiler has process-global state and garbage collection
is disabled. HTTP asset caching still applies between requests.

The default watchdog is 600 seconds. Callers may supply a positive `timeoutMs`.
Loading and compilation are separate progress phases. Library data is fetched
and checked explicitly so a missing package reports an initialization error
instead of leaving the SDK loader waiting indefinitely.

## Port and measurements

The compiler is generated with `-boost -no_gc -split legacy` and compiled with
SDK `-O2`. User programs are translated with `-no_gc -no_split -all_check`.
The native-process selection in `sys/plugins/exec/c/exec.h` excludes Emscripten
from the POSIX branch and uses Liberty's existing unsupported-process backend.
Native platform selection is otherwise unchanged. Generated C is never patched.

WASM starts with 64 MiB linear memory, a 16 MiB stack, memory growth, and a 1 GiB
ceiling. `linearMemoryBytes` is the allocated WASM linear-memory size at the end
of translation, not total browser memory or process RSS. JavaScript, packaged
files, generated text, and browser JIT code add memory overhead.

`compilationMs` times the compiler call. `initializationMs` times asset loading
and instance setup after JavaScript imports. `elapsedMs` includes worker startup,
imports, initialization, translation, and result delivery. Resource timing fields
report transfers seen inside the worker; zero transfer sizes can indicate cache
hits. Reports separately record raw asset sizes and static-server response bytes.
There is no performance acceptance cutoff.

Compatibility is demonstrated for the recorded fixtures. Arbitrary native
bindings, desktop operating-system facilities, long-running allocation-heavy
programs, and full Liberty language/library coverage are not established here.
Clang's generated-C unused-value warnings are retained in build logs.
