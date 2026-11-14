# Architecture

The page sends source files and stdin through three disposable browser workers:

1. `runtime/eiffel` loads Liberty and translates Eiffel into C.
2. `runtime/wasi` loads Clang and LLD, then compiles and links that C into WebAssembly.
3. A fresh WASI instance runs the program and streams stdout and stderr.

`runtime/client.mjs` exposes `buildAndRun(input, options)` and coordinates these
operations. Input contains `files`, `rootClass` (an entry filename), and optional
`stdin`. Options include an AbortSignal, build/run deadlines, and `onPhase`,
`onOutput`, and `onProgress` callbacks. Results include status, output, diagnostics,
generated artifacts, phase timings, resource measurements, and elapsed time.
All assets are self-hosted; source code is never sent to a compilation service.

Each worker is terminated at completion, cancellation, or timeout. Compiler jobs
use `-no_gc -no_split -all_check`; assertions stay enabled. Programs have a
10-second execution deadline, a 1 MiB output limit, and a 256 MiB memory maximum.
Builds have a separate ten-minute deadline. Stop terminates the active worker.

Progress counts response-body bytes during backend loading. Totals are available
only when every expected asset has a comparable Content-Length. HTTP decoding
or missing sizes produce indeterminate progress. Preparing phases distinguish
completed transfers from WebAssembly initialization. The initial Eiffel loader
also uses indeterminate progress. The first-run note disappears after success
until the next page load; browser caching can reduce later transfers.

The UI keeps example IDs, deep links, and versioned local drafts stable. CodeMirror
keeps per-file selection and undo history. Compiler diagnostics link back to
submitted source; contract failures display their named precondition,
postcondition, or invariant. The library example keeps loan state in memory,
uses a generic catalogue, and derives counts instead of caching them.

The final site is browser-tested through a read-only mount by independent
API/lesson and UI/network groups. Both must pass with identical file inventories
before their reports can be combined. Release sealing requires both groups and
rejects any change to the tested bytes. Browser reports and screenshots remain outside the candidate.

Build and release metadata identify both playground and Liberty revisions.
Generated assets and reports stay under ignored `artifacts/`; source control
contains neither generated compiler binaries nor historical report snapshots.
