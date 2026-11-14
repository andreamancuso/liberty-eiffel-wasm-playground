# Building and development

Run `./build.ps1` from PowerShell for the complete build and checks. The entry
point prepares the UI and browser verifier alongside `build/compiler.ps1` and
the C toolchain, then assembles the site. At most two Docker builds run together.
`-LibertySource` selects a development checkout; `-RebuildNative` rebuilds the
native bootstrap. Default builds require a clean pinned Liberty submodule.
Source overrides may be dirty and are identified separately in provenance.

Docker images pin Emscripten and the other build environments. Downloaded
Clang, LLD, and WASI SDK assets are checksum-verified. A Node smoke test checks
compiler startup and exports generated C, headers, and expected output for the
WASI backend probe. Browser checks exercise the complete Eiffel-to-WASM path.
The full site tests exercise lessons, errors, limits, recovery, editing, storage,
and slow downloads under the same path prefix used on GitHub Pages.

## Caching and verification

Normal local builds use Docker's local layer cache. The native recipe is always
evaluated, so a stale image tag cannot bypass changed source or build inputs.
`-RebuildNative` bypasses native-layer reuse only. `-ColdBuild` bypasses layer
reuse for every recipe; use it deliberately because bootstrapping is expensive.

CI passes `-CiCache` and uses the GitHub Actions BuildKit cache backend with
separate `liberty-native-linux-amd64-v1`, `liberty-compiler-linux-amd64-v1`, and
`liberty-toolchain-linux-amd64-v1` scopes. Intermediate layers are exported with
`mode=max`. Docker's input hashes determine reuse, while playground provenance
is regenerated for the current revision after the expensive compiler layers.
Main-branch pushes and manual runs export caches; PR runs only import. Cache misses build
normally and failed cache exports do not fail an otherwise successful build.

CI configures Docker's containerd image store and default Docker driver so later
recipes can use locally built images. Local builds do not need this CI setup or
GitHub cache credentials. Use the manual workflow's `cold_build` input for a cold
benchmark which can also seed caches. Bump the scope suffix to reset CI caches.

The retained browser checks run against `artifacts/site` under the Pages prefix,
using a read-only mount. API/lesson checks and UI/network checks each have their
own Chromium process, HTTP server, contexts, storage, and delivery settings.
`-TestWorkers 2` runs these two groups concurrently; `-TestWorkers 1` runs the
same cases serially. The manual CI workflow exposes the same `test_workers`
choice. Each group writes its report and screenshot under
`artifacts/browser-reports/api` or `ui`. The aggregate report rejects missing,
failed, duplicate, or mismatched groups and includes their case lists, elapsed
times, and the exact candidate inventory. CI seals these tested bytes with `release.json`; no second
copy of the browser suite runs. The separate HTTPS smoke test still runs after
publication. Reports are never restored from build caches.

Build logs and separate per-build timing JSON files live in `artifacts/build-logs`.
Concurrent builds never append to a shared timing file. CI summarizes
cached steps and cache-transfer durations. Compare cold and warm run summaries
rather than assuming a cache hit makes transfers free.

The first [measured cold CI run](https://github.com/andreamancuso/liberty-eiffel-wasm-playground/actions/runs/43637238890)
took 26 minutes 7 seconds, including setup, all checks, sealing, and cache export.
The native build accounted for 972.8 seconds, including 15.5 seconds in its cache
export vertex. The three build scopes populated roughly 1.66 GB of cache data.
Use subsequent run summaries to compare warm timings, including transfer costs.

For UI-only checks, run `npm ci`, `npm test`, and `npm run build` in `ui/`.
The independent UI checks workflow runs these on UI changes for quick feedback.
It does not produce an eligible release; the main CI build still gates publishing.

## Test priorities

| Rank | Coverage | Decision |
| --- | --- | --- |
| 1 | All eight lessons, full compilation/execution, contracts, compiler diagnostics, UTF-8 stdin/EOF | Keep. These establish that the playground teaches and runs Eiffel correctly. |
| 2 | Editing and saved workspaces, contract source links, reset/recovery, Stop, real execution timeout, output cap | Keep. These exercise normal use and prevent stuck runs. |
| 3 | Slow/unknown-length downloads, HTTP-decoded gzip, missing/corrupt assets, storage failure, release integrity | Keep. These cover hosting and browser failures. |
| 4 | Library mutations for loan limits, wrong returns, distinct-object identity, `old` counts, and bypassed invariants | Keep five representative mutations. |
| 5 | Repeated Hello runs, all-phase cancellation matrix, duplicate UI run/error/Stop/recovery flow | Remove. The lesson loop and existing UI flows cover these outcomes. Hello runs last to prove API recovery; frontend cancellation, download Stop, and execution Stop remain. |
| 6 | Extra library final-state, unavailable-book, available-return, duplicate-registration, and missing-update mutations | Remove. The lesson output, unavailable-book UI flow, and retained contract mutations provide representative coverage. |
| 7 | Separate compiler-only browser suite and offline AOT audit | Delete the harnesses and recipes. Node translation, the WASI probe, and full browser acceptance retain the useful boundaries. |

The download deadline check observes real response bytes, then advances a clock
in its dedicated context instead of waiting 30 seconds. The real execution
deadline still terminates an infinite program. The output cap uses two bulk WASI
writes, retaining partial-output and worker-cleanup assertions without a slow
Eiffel print loop.

For performance comparisons, use one warm serial and two warm parallel CI runs
on the same revision. Compare case names and outcomes as well as elapsed times.
Keep two workers as the default only if both parallel runs beat the serial run;
otherwise use one. Failed runs remain failures rather than being retried to
obtain a favorable timing.

For development, serve `artifacts/site` on port 8084 and run `npm run dev` in
`ui/`; Vite proxies `/runtime/` to the static asset server. Example metadata and
source are compiled into the UI and emitted as `examples.json` for verification.

Runtime code uses JavaScript modules because it is also executed directly by
Node and native browser workers. The interface uses TypeScript. Keep control
flow explicit, prefer descriptive names, and use ternaries only for simple
inline choices. Validate external inputs once at their boundary; internal code
can rely on the contracts of the modules it calls.
