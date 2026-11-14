param([string]$LibertySource, [switch]$RebuildNative, [switch]$CiCache, [switch]$ColdBuild)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'build/docker-build.ps1')
Push-Location $PSScriptRoot
try {
    Reset-BuildDirectory build-logs | Out-Null
    & (Join-Path $PSScriptRoot 'tests/build-options.ps1')
    node --test tests/browser/download.test.mjs tests/browser/site-inventory.test.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Download or inventory regressions failed.' }
    $site = Reset-BuildDirectory site
    $reports = Reset-BuildDirectory browser-reports
    $frontend = Join-Path $PSScriptRoot 'artifacts/compiler'
    & (Join-Path $PSScriptRoot 'build/compiler.ps1') -LibertySource $LibertySource -RebuildNative:$RebuildNative -CiCache:$CiCache -ColdBuild:$ColdBuild
    Invoke-DockerBuild -Name toolchain -CacheScope toolchain -CiCache:$CiCache -ColdBuild:$ColdBuild -Arguments @(
        '-f', 'build/toolchain.Dockerfile', '--target', 'probe', '--build-context', "compiler_output=$frontend", '-t', 'liberty-playground:toolchain', '.')
    Invoke-DockerBuild -Name site -ColdBuild:$ColdBuild -Arguments @(
        '-f', 'build/site.Dockerfile', '--target', 'artifacts', '--build-context', "compiler_output=$frontend", "--output=type=local,dest=$site", '.')
    Invoke-DockerBuild -Name browser -ColdBuild:$ColdBuild -Arguments @('-f', 'tests/browser/Dockerfile', '-t', 'liberty-playground:browser', '.')
    docker run --rm --platform linux/amd64 --network none --env REPORT_DIR=/reports --mount "type=bind,source=$site,target=/artifacts,readonly" --mount "type=bind,source=$reports,target=/reports" liberty-playground:browser
    if ($LASTEXITCODE -ne 0) { throw 'Playground browser acceptance failed.' }
    Write-Output "PASS: candidate verified once, without modifying its files. Report: $reports/browser-result.json"
} finally { Pop-Location }
