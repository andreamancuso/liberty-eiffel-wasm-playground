# Liberty Eiffel WASM playground

A browser-only Liberty Eiffel compiler experiment for beyond-tabs.com. The
current harness translates edited Eiffel into C in a WebAssembly worker, shows
diagnostics, and lets you inspect and download generated files. Browser-side C
compilation and execution are the next milestone.

The playground owns the Docker recipes, asset packaging, worker API, interface,
integration tests, and measurements. Liberty compiler/runtime changes belong in
the [Liberty fork](https://github.com/andreamancuso/Liberty), included here as the
`liberty` Git submodule at a fixed commit. Neither build requires a sibling
checkout or machine-specific source path.

## Build and verify

Requirements: Git, PowerShell, and Docker Desktop with Linux containers.

```powershell
cd C:\dev\liberty-eiffel-wasm-playground
git submodule update --init --recursive
.\build-stage2.ps1
```

The default build uses the clean, pinned `liberty` checkout. The runner initializes
it if necessary and rejects a changed revision or dirty worktree. The first
native compiler bootstrap can take half an hour; subsequent builds reuse it.
Emscripten 7.0.0 and the other build images are pinned by digest.

For source development, explicitly select your fork checkout instead:

```powershell
.\build-stage2.ps1 -LibertySource C:\dev\LibertyFork
```

The override may contain uncommitted source changes. Reports identify its Git
revision, dirty state, repository, and full source-tree fingerprint separately
from the playground revision and fingerprint. `-RebuildNative` rebuilds the
native bootstrap seed from the selected source. Source changes are made in the
fork, then committed and selected by updating this repo's submodule pin.

The stage 2 runner checks Node initialization, browser translation, diagnostics,
cancellation, timeout and failure recovery, the editable UI, and downloads. It
also compiles browser-generated C offline and executes the resulting WASM, and
runs stage 1 regressions. Tests use static HTTP and disabled external networking.

- [Stage 2 guide: harness, API, measurements, and limits](stage2/README.md)
- [Recorded stage 2 results](stage2-result.json)
- [Stage 1 guide: ahead-of-time compilation experiment](docs/stage1.md)

Generated files, caches, logs, and screenshots remain under `artifacts/`, ignored
by Git. `artifacts/stage2/stage2-browser.png` shows the verified browser harness.

## Source pin and publishing

The `liberty` gitlink is the authoritative source pin; `.gitmodules` records the
fork's HTTPS URL. After creating a compiler fix locally, push its commit to the
fork before publishing a playground revision that references it. Otherwise a
fresh recursive clone cannot download that commit. The initialized local
checkout and `-LibertySource` work without publishing.

To select a newer committed fork revision, fetch and check out that revision
inside `liberty`, then commit the updated gitlink in this repo. Updating the
submodule does not copy playground tooling back into Liberty.

## License

[MIT](LICENSE) covers this repository's original tooling and harness. Liberty
and other third-party components retain their own licenses; see
[third-party notices](THIRD_PARTY_NOTICES.md).
