param([string]$LibertySource, [switch]$RebuildNative)
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    node --test stage3/tests/download.test.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Download progress regressions failed.' }
    $site = Join-Path $PSScriptRoot 'artifacts/stage3'
    $frontend = Join-Path $PSScriptRoot 'artifacts/stage2'
    $report = Join-Path $site 'stage3-result.json'
    if (Test-Path -LiteralPath $report) { Remove-Item -LiteralPath $report }
    & (Join-Path $PSScriptRoot 'build-stage2.ps1') -LibertySource $LibertySource -RebuildNative:$RebuildNative
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build and regressions failed.' }
    docker build --platform linux/amd64 -f Dockerfile.stage3-toolchain --target probe --build-context "stage2_output=$frontend" -t liberty-emscripten:stage3-toolchain .
    if ($LASTEXITCODE -ne 0) { throw 'Toolchain preparation or C backend probe failed.' }
    docker build --platform linux/amd64 -f Dockerfile.stage3 --target artifacts --build-context "stage2_output=$frontend" "--output=type=local,dest=$site" .
    if ($LASTEXITCODE -ne 0) { throw 'Stage 3 static packaging failed.' }
    docker build --platform linux/amd64 -f Dockerfile.stage3-browser -t liberty-emscripten:stage3-browser .
    if ($LASTEXITCODE -ne 0) { throw 'Stage 3 browser verifier build failed.' }
    docker run --rm --platform linux/amd64 --network none --mount "type=bind,source=$site,target=/artifacts" liberty-emscripten:stage3-browser
    if ($LASTEXITCODE -ne 0) { throw 'Stage 3 browser acceptance failed.' }
    Write-Output "PASS: browser-only compile and run. Report: $report"
} finally { Pop-Location }
