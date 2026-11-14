param([string]$LibertySource, [switch]$RebuildNative, [switch]$CiCache, [switch]$ColdBuild, [ValidateSet(1, 2)][int]$TestWorkers = 2)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'build/docker-build.ps1')
Push-Location $PSScriptRoot
$preparation = $null
try {
    Reset-BuildDirectory build-logs | Out-Null
    & (Join-Path $PSScriptRoot 'tests/build-options.ps1')
    node --test tests/browser/download.test.mjs tests/browser/site-inventory.test.mjs tests/browser/group-report.test.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Download or inventory regressions failed.' }
    $site = Reset-BuildDirectory site
    $reports = Reset-BuildDirectory browser-reports
    # One preparation job overlaps the compiler build; no more than two builds run at once.
    $preparation = Start-ThreadJob -ArgumentList $PSScriptRoot, ([bool]$ColdBuild) -ScriptBlock {
        param($RepositoryRoot, $Cold)
        $ErrorActionPreference = 'Stop'
        Set-Location $RepositoryRoot
        . (Join-Path $RepositoryRoot 'build/docker-build.ps1')
        Invoke-DockerBuild -Name frontend -ColdBuild:$Cold -Arguments @('-f', 'build/site.Dockerfile', '--target', 'frontend', '-t', 'liberty-playground:ui', '.')
        Invoke-DockerBuild -Name browser -ColdBuild:$Cold -Arguments @('-f', 'tests/browser/Dockerfile', '-t', 'liberty-playground:browser', '.')
    }
    $frontend = Join-Path $PSScriptRoot 'artifacts/compiler'
    & (Join-Path $PSScriptRoot 'build/compiler.ps1') -LibertySource $LibertySource -RebuildNative:$RebuildNative -CiCache:$CiCache -ColdBuild:$ColdBuild
    Invoke-DockerBuild -Name toolchain -CacheScope toolchain -CiCache:$CiCache -ColdBuild:$ColdBuild -Arguments @(
        '-f', 'build/toolchain.Dockerfile', '--target', 'probe', '--build-context', "compiler_output=$frontend", '-t', 'liberty-playground:toolchain', '.')
    $preparation | Wait-Job | Receive-Job -ErrorAction Stop
    if ($preparation.State -ne 'Completed') { throw 'UI or browser preparation failed.' }
    Invoke-DockerBuild -Name site -ColdBuild:$ColdBuild -Arguments @(
        '-f', 'build/site.Dockerfile', '--target', 'artifacts', '--build-context', "compiler_output=$frontend", "--output=type=local,dest=$site", '.')
    docker run --rm --platform linux/amd64 --network none --env REPORT_DIR=/reports --env "TEST_WORKERS=$TestWorkers" --mount "type=bind,source=$site,target=/artifacts,readonly" --mount "type=bind,source=$reports,target=/reports" liberty-playground:browser
    if ($LASTEXITCODE -ne 0) { throw 'Playground browser acceptance failed.' }
    Write-Output "PASS: candidate verified once, without modifying its files. Report: $reports/browser-result.json"
} finally {
    if ($preparation) {
        # Finish the bounded preparation task before removing its job, including on failure.
        $preparation | Wait-Job | Out-Null
        Remove-Job -Job $preparation
    }
    Pop-Location
}
