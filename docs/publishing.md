# Publishing the standalone beta

The playground is a static application linked from beyond-tabs.com:

<https://andreamancuso.github.io/liberty-eiffel-wasm-playground/>

The public beta targets desktop Chrome and Edge. Its first run downloads roughly
33 MB. Compilation and program execution take place in browser workers.

## CI

The `CI` workflow runs on pull requests, pushes to `main`, and manual dispatch.
It recursively checks out the pinned Liberty fork, runs `build-stage3.ps1`, and
packages the passing static site. It repeats browser acceptance against the
packaged bytes under `/liberty-eiffel-wasm-playground/` and verifies the inventory.
Both opaque gzip and HTTP `Content-Encoding: gzip` delivery are tested.

The first native bootstrap can take half an hour. CI allows 180 minutes and logs
time, free disk, and Docker storage. It starts without a persistent build cache;
local Docker builds still reuse layers. Generated binaries are not committed.

Successful runs produce `playground-site-<full-commit-SHA>` and diagnostic
artifacts, retained for seven days. The site contains third-party licenses,
compiler/toolchain provenance, and `release.json` with:

- `schemaVersion` (currently 1), `playgroundRevision`, and `libertyRevision`;
- `ciRunId` and `ciRunUrl` identifying the build;
- `files`, an inventory of relative paths, byte lengths, and SHA-256 checksums.

The manifest inventories every published file except itself. Packaging rejects
failed reports, mismatched revisions, dirty/unpinned compiler sources, symlinks,
and packages reaching the Pages 1 GB limit. Publication verifies that inventory
again, including missing, additional, or changed files.

## One-time repository setup

Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**.
Use the `github-pages` deployment environment with a custom branch rule allowing
only `main`. Enable HTTPS; the default github.io address supports it without DNS
configuration. No custom domain or special cross-origin headers are required.

## Publish a tested main build

1. Merge changes into `main` and wait for its own `CI` run to succeed.
2. Copy that run's numeric ID from its URL or workflow summary.
3. Run **Actions → Publish Pages beta → Run workflow**, select `main`, and supply
   `ci_run_id`. Alternatively:

   ```powershell
   gh workflow run publish.yml --ref main -f ci_run_id=123456789
   ```

The publisher accepts only a successful same-repository `main` run from `ci.yml`.
It downloads and verifies the selected artifact, then uses the official Pages
upload/deploy actions without rebuilding. Publishing is manual and serialized.
Only the deployment job gets Pages/OIDC write permissions; no long-lived
deployment secret is needed.

After deployment, Chromium tests the public HTTPS address with fresh edited
source, UTF-8 stdin, visible Eiffel errors, quiet successful runs, Stop, and
recovery. It checks the release revision, module/WASM delivery, and same-origin
GET-only requests. The workflow summary links the site and reports timings;
`hosted-<publishing-run-ID>` contains detailed results and a screenshot.

A failed hosted check marks the workflow failed **after publication**, so that
site remains live until another deployment. Inspect its diagnostics before
linking or announcing the beta.

## Rollback

Dispatch `publish.yml` again with an earlier successful main CI run ID whose
artifact is still retained. This republishes the exact previous bytes and runs
hosted verification again. If its artifact has expired, revert the affected
change on `main`, let CI rebuild and verify it, then publish that new run.

The package is portable static output and can later be hosted on lima-city.
Assets and workers use relative paths. The loader supports opaque `.gz` files
and HTTP-decoded gzip responses; the host must serve `.mjs` as JavaScript and
`.wasm` as WebAssembly.
