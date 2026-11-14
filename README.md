# Liberty Eiffel playground

[Open the playground](https://andreamancuso.github.io/liberty-eiffel-wasm-playground/).
Edit and run Eiffel entirely in your browser, with contracts, inheritance,
generic collections, multiple class files, and optional standard input.
Eight guided examples include a library-loan application. Drafts stay in your
browser. The first run downloads approximately 25 MB on GitHub Pages.

## Build and verify

Install Git, PowerShell, Node.js, and Docker with Linux containers, then run:

```powershell
git submodule update --init --recursive
.\build.ps1
```

The build bootstraps Liberty, packages its browser compiler and C toolchain,
builds the React interface, and runs compiler and browser regressions with
external networking disabled. Output goes to `artifacts/site/`.
The first native bootstrap can take half an hour; subsequent builds reuse layers.
CI persists the expensive compiler caches and runs the full browser suite once
against the final site. See the build guide for cold-build switches and timings.

For compiler source development, use your fork checkout:

```powershell
.\build.ps1 -LibertySource C:\dev\LibertyFork
```

The default source is the clean, pinned `liberty` submodule. Compiler fixes belong
in the [Liberty fork](https://github.com/andreamancuso/Liberty), then in an updated
submodule pin here. Playground code and tooling belong in this repository.

## Find your way around

- `runtime/`: browser compilation, workers, downloads, and WASI execution.
- `build/`: pinned Docker recipes and compiler/toolchain packaging.
- `tests/`: compiler harnesses and browser scenarios.
- `ui/`: React, TypeScript, CodeMirror, lessons, and saved workspaces.
- `release/`: artifact selection and release integrity checks.

[Architecture](docs/architecture.md), [building and development](docs/building.md),
and [publishing and rollback](docs/publishing.md) describe the maintained system.
Small educational console programs are the target. Garbage collection and
`rescue/retry` are currently unsupported.

## License

[MIT](LICENSE) covers the original playground code. Dependencies retain their
licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).
