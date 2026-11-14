# Third-party components

The MIT license at this repository's root covers its original playground code.
It does not replace the licenses of the compiler, libraries, or build tools.

- **Liberty Eiffel:** compiler sources are in the pinned `liberty` submodule.
  Its root `COPYING` contains GPL-3.0; individual source files carry their
  applicable notices, including permissive notices on core/runtime components.
  Stage 2 assets include Liberty's `COPYING` and `AUTHORS` under `licenses/`.
  The compiler source pin and source repository are recorded in provenance.
- **Emscripten:** the pinned SDK supplies the toolchain, JavaScript loader, and
  C library support, with the notices and licenses in that distribution.
- **Playwright:** the pinned npm dependency is Apache-2.0 and is used only for
  browser verification. Its package retains its license.
- **Browser Clang/LLD, memfs and WASI support:** stage 3 pins
  cppstudio-io/wasm-clang-runtime v0.1.0 and its source revision, derived from
  binji/wasm-clang. The runtime and memfs carry Apache-2.0 notices; LLVM uses
  Apache-2.0 with LLVM Exceptions. The WASI SDK distribution supplies the matching
  C library. Download hashes are in `build/toolchain.lock.json`. Runtime LICENSE,
  LICENSE.llvm and NOTICE are included in the generated site's `licenses/`.
  Our ES-module export and filesystem injection adjustments are recorded in
  `build/patch-runtime.py`; I/O handling is supplied by `runtime/wasi/program.mjs`.

The React/CodeMirror frontend uses pinned npm dependencies in `ui/package-lock.json`.
Their license declarations and installed license notices are bundled under
`licenses/ui/THIRD_PARTY_LICENSES.txt` in the generated site.

Generated Eiffel C and headers retain Liberty's generated notices. The submodule
retains the compiler and library sources and their original copyright headers.
