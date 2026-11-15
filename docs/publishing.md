# Publishing

The playground is a static application linked from beyond-tabs.com:

<https://andreamancuso.github.io/liberty-eiffel-wasm-playground/>

The public beta targets desktop Chrome and Edge. Its first run downloads roughly
25 MB. Compilation and program execution take place in browser workers.

## CI

The `CI` workflow runs on pull requests, pushes to `main`, and manual dispatch.
It recursively checks out the pinned Liberty fork and runs `build.ps1` to build
the final candidate. API/lesson and UI/network checks run against its read-only
files under `/liberty-eiffel-wasm-playground/`. Both groups must pass with the
same tested file inventory. Sealing compares that inventory with the candidate
before adding `release.json`, then verifies the release. Diagnostics stay
outside the site directory.
Both opaque gzip and HTTP `Content-Encoding: gzip` delivery are tested.

The first native bootstrap can take half an hour. CI allows 180 minutes and logs
time, free disk, and Docker storage. Native, compiler, and toolchain layers use
separate persistent CI caches; local builds reuse Docker's local cache. The
manual `cold_build` input bypasses reuse while still allowing cache export.
Cache transfer costs and build timings appear in the workflow summary.
Generated binaries are not committed.

Successful runs produce `playground-site-<full-commit-SHA>` and diagnostic
artifacts, retained for seven days. The site contains third-party licenses,
compiler/toolchain provenance, and `release.json` with:

- `schemaVersion` (currently 1), `playgroundRevision`, and `libertyRevision`;
- `ciRunId` and `ciRunUrl` identifying the build;
- `files`, an inventory of relative paths, byte lengths, and SHA-256 checksums.

The manifest inventories every published file except itself. Sealing rejects
failed reports, mismatched revisions, dirty/unpinned compiler sources, symlinks,
and packages reaching the Pages 1 GB limit. Publication verifies that inventory
again, including missing, additional, or changed files.

## One-time repository setup

Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**.
Use the `github-pages` deployment environment with a custom branch rule allowing
only `main`. Enable HTTPS; the default github.io address supports it without DNS
configuration. No custom domain or special cross-origin headers are required.

## Publish a tested main build

1. Merge changes into `main` and wait for the corresponding `CI` run to succeed.
2. Copy that run's numeric ID from its URL or workflow summary.
3. Run **Actions → Publish Pages beta → Run workflow**, select `main`, and supply
   `ci_run_id`. Alternatively:

   ```powershell
   gh workflow run publish.yml --ref main -f ci_run_id=123456789
   ```

The publisher accepts only a successful same-repository `main` run from `ci.yml`.
It checks out the selected revision's verifier, downloads and verifies its
artifact, then uses the official Pages upload/deploy actions without rebuilding.
Publishing is manual and serialized.
Only the deployment job gets Pages/OIDC write permissions; no long-lived
deployment secret is needed.

After deployment, the verifier from the selected release tests the public HTTPS
address with Chromium, fresh edited source, UTF-8 stdin, visible Eiffel errors,
quiet successful runs, Stop, and recovery. It checks the release revision,
module/WASM delivery, and same-origin GET-only requests. The workflow summary
links the site and reports timings. `hosted-<publishing-run-ID>` contains detailed
results and a screenshot.

The learning workspace checks also cover contract failure navigation, class-file
operations, local draft restoration, Reset, and keyboard Run. The full offline
suite runs all example programs and verifies preconditions, postconditions with
`old`, invariants, and operation when local storage is unavailable.
The library-loan example adds checks for loan limits, borrowers, and object
identity. Live verification also opens its direct link, triggers an unavailable-book
failure, navigates to `library.e`, resets the example, and runs it successfully.

A failed hosted check marks the workflow failed **after publication**. The
deployed site remains live until a corrected release or rollback is published.

## Rollback

Dispatch `publish.yml` again with an earlier successful main CI run ID whose
artifact is still retained. This republishes the exact previous bytes and runs
hosted verification again. The browser verifier is built from the Docker recipe
available at the selected revision. If its artifact has expired, revert the
affected change on `main`, let CI rebuild and verify it, then publish that new run.

## Other static hosts

The generated site is portable static output. Assets and workers use relative
paths. The loader supports opaque `.gz` files and HTTP-decoded gzip responses;
the host must serve `.mjs` as JavaScript and `.wasm` as WebAssembly.
