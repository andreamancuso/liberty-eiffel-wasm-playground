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

For UI-only checks, run `npm ci`, `npm test`, and `npm run build` in `ui/`.
For development, serve `artifacts/site` on port 8084 and run `npm run dev` in
`ui/`; Vite proxies `/runtime/` to the static asset server. Example metadata and
source are compiled into the UI and emitted as `examples.json` for verification.

Runtime code uses JavaScript modules because it is also executed directly by
Node and native browser workers. The interface uses TypeScript. Keep control
flow explicit, prefer descriptive names, and use ternaries only for simple
inline choices. Validate external inputs once at their boundary; internal code
can rely on the contracts of the modules it calls.
