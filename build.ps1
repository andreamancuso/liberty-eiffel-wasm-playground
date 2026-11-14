param([string]$LibertySource, [switch]$RebuildNative)
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    node --test tests/browser/download.test.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Download progress regressions failed.' }
    $site = Join-Path $PSScriptRoot 'artifacts/site'
    $frontend = Join-Path $PSScriptRoot 'artifacts/compiler'
    $report = Join-Path $site 'browser-result.json'
    if (Test-Path -LiteralPath $report) { Remove-Item -LiteralPath $report }
    & (Join-Path $PSScriptRoot 'build/compiler.ps1') -LibertySource $LibertySource -RebuildNative:$RebuildNative
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build and regressions failed.' }
    docker build --platform linux/amd64 -f build/toolchain.Dockerfile --target probe --build-context "compiler_output=$frontend" -t liberty-playground:toolchain .
    if ($LASTEXITCODE -ne 0) { throw 'Toolchain preparation or C backend probe failed.' }
    docker build --platform linux/amd64 -f build/site.Dockerfile --target artifacts --build-context "compiler_output=$frontend" "--output=type=local,dest=$site" .
    if ($LASTEXITCODE -ne 0) { throw 'Playground static packaging failed.' }
    docker build --platform linux/amd64 -f tests/browser/Dockerfile -t liberty-playground:browser .
    if ($LASTEXITCODE -ne 0) { throw 'Playground browser verifier build failed.' }
    docker run --rm --platform linux/amd64 --network none --mount "type=bind,source=$site,target=/artifacts" liberty-playground:browser
    if ($LASTEXITCODE -ne 0) { throw 'Playground browser acceptance failed.' }
    Write-Output "PASS: browser-only compile and run. Report: $report"
} finally { Pop-Location }
