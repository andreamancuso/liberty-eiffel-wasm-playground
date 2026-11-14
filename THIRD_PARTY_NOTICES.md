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

Generated Eiffel C and headers retain Liberty's generated notices. The submodule
retains the compiler and library sources and their original copyright headers.
