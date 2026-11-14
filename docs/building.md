# Building and development

Run `./build.ps1` from PowerShell for the complete build and checks. The entry
point calls `build/compiler.ps1`, then packages the C toolchain, UI, and site.
`-LibertySource` selects a development checkout; `-RebuildNative` rebuilds the
native bootstrap. Default builds require a clean pinned Liberty submodule.
Source overrides may be dirty and are identified separately in provenance.

Docker images pin Emscripten and the other build environments. Downloaded
Clang, LLD, and WASI SDK assets are checksum-verified. The compiler tests verify
translation in Node and browser workers, then compile browser-generated C
offline and execute it. Internal HTML harnesses exist only in test artifacts.
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

Every run retains the full checks. The complete browser suite runs once against
`artifacts/site` under the Pages prefix, using a read-only mount. Its report and
screenshot go to `artifacts/browser-reports`. The report includes the exact
candidate inventory. CI seals these tested bytes with `release.json`; no second
copy of the browser suite runs. The separate HTTPS smoke test still runs after
publication. Reports are never restored from build caches.

Build logs and elapsed times live in `artifacts/build-logs`, and CI summarizes
cached steps and cache-transfer durations. Compare cold and warm run summaries
rather than assuming a cache hit makes transfers free.

The first [measured cold CI run](https://github.com/andreamancuso/liberty-eiffel-wasm-playground/actions/runs/43637238890)
took 26 minutes 7 seconds, including setup, all checks, sealing, and cache export.
The native build accounted for 972.8 seconds, including 15.5 seconds in its cache
export vertex. The three build scopes populated roughly 1.66 GB of cache data.
Use subsequent run summaries to compare warm timings, including transfer costs.

For UI-only checks, run `npm ci`, `npm test`, and `npm run build` in `ui/`.
For development, serve `artifacts/site` on port 8084 and run `npm run dev` in
`ui/`; Vite proxies `/runtime/` to the static asset server. Example metadata and
source are compiled into the UI and emitted as `examples.json` for verification.

Runtime code uses JavaScript modules because it is also executed directly by
Node and native browser workers. The interface uses TypeScript. Keep control
flow explicit, prefer descriptive names, and use ternaries only for simple
inline choices. Validate external inputs once at their boundary; internal code
can rely on the contracts of the modules it calls.
