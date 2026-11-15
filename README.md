# Liberty Eiffel playground

An online playground for learning and experimenting with Liberty Eiffel.
Source code is compiled and executed entirely in the browser using WebAssembly.

**[Open the playground](https://andreamancuso.github.io/liberty-eiffel-wasm-playground/)**

## Motivation

As the author of [beyond-tabs.com](https://beyond-tabs.com), I wanted an online
playground for Liberty Eiffel. I couldn't find one, so I decided to invest some
time in building one.

## Explore Eiffel

- **Eight guided examples:** greetings, variables and loops, text input, objects
  and state, generic collections, inheritance, contracts, and a library-loan
  application. Each includes an explanation, expected output, and an experiment.
- **Design by Contract:** preconditions, postconditions with `old`, and class
  invariants stay enabled. Failures display the condition's name and links back
  to the source.
- **Multiple source files:** edit class files in tabs, add or rename files, and
  choose the program's entry file. A separate workspace supports custom programs.
- **Console input and output:** supply text input before running, read the output
  and diagnostics, and stop a running program.
- **Saved drafts:** edits and input are stored locally in the browser. Reset
  restores an example's original source.

The [Contracts example](https://andreamancuso.github.io/liberty-eiffel-wasm-playground/#example=contracts)
demonstrates a bank account with rules for deposits and withdrawals.
[Library loans](https://andreamancuso.github.io/liberty-eiffel-wasm-playground/#example=library-loans)
combines several classes, a generic catalogue, and contracts enforcing borrowing
rules.

## How it works

The interface uses React, TypeScript, and CodeMirror. Compilation and execution
run in disposable Web Workers:

1. **Eiffel to C:** the Liberty Eiffel compiler, compiled to WebAssembly with
   Emscripten, translates the submitted class files into C.
2. **C to WebAssembly:** Clang and LLD, also running as WebAssembly, compile and
   link the generated C into a program.
3. **Execution:** a WASI runtime runs the program with the supplied text input
   and streams its output back to the page.

The compiler, toolchain, and runtime are served with the static site. Source
code is never sent to a remote compilation service. The
[architecture guide](docs/architecture.md) describes the workers, runtime API,
and resource handling.

## Current limitations

- The playground targets desktop Chrome and Edge.
- The first run downloads approximately 25 MB of compiler and runtime assets.
  Browser caching can reduce later transfers.
- Small console programs are the intended use. Input is supplied before
  execution rather than entered interactively while a program runs.
- Garbage collection and `rescue/retry` are currently unsupported.
- Programs have a default 10-second execution deadline, a 1 MiB output limit,
  and a 256 MiB memory maximum.

## Build locally

Prerequisites: Git, PowerShell, Node.js, and Docker with Linux containers.
Run these commands from PowerShell:

```powershell
git clone --recurse-submodules https://github.com/andreamancuso/liberty-eiffel-wasm-playground.git
cd liberty-eiffel-wasm-playground
./build.ps1
```

The build packages the compiler, toolchain, and interface, then verifies the
result in the browser. The generated site is written to `artifacts/site/`.
The first native compiler bootstrap can take half an hour; subsequent builds
reuse Docker's layer cache.

The default compiler source is the pinned `liberty` submodule from the
[Liberty fork](https://github.com/andreamancuso/Liberty). The
[build guide](docs/building.md) covers compiler development, local UI development,
caching, and verification.

## Repository layout

- `runtime/`: browser compilation, workers, downloads, and WASI execution.
- `build/`: pinned Docker recipes and compiler/toolchain packaging.
- `tests/`: compiler, runtime, and browser checks.
- `ui/`: React, TypeScript, CodeMirror, lessons, and saved workspaces.
- `release/`: artifact selection and release integrity checks.

[Architecture](docs/architecture.md), [building and development](docs/building.md),
and [publishing and rollback](docs/publishing.md) provide the technical and
deployment documentation.

## License

[MIT](LICENSE) covers the original playground code. Dependencies retain their
licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).
