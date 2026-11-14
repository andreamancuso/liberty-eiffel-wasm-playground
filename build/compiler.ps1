param([string]$LibertySource, [switch]$RebuildNative, [switch]$CiCache, [switch]$ColdBuild)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
. (Join-Path $PSScriptRoot 'docker-build.ps1')
$repositoryRoot = Split-Path $PSScriptRoot -Parent
$compilerDirectory = Reset-BuildDirectory compiler
$validationDirectory = Reset-BuildDirectory generated-programs
Push-Location $repositoryRoot
try {
    $combinedReportPath = Join-Path $compilerDirectory 'compiler-result.json'
    if (Test-Path -LiteralPath $combinedReportPath) { Remove-Item -LiteralPath $combinedReportPath }
    $source = Get-LibertySource $repositoryRoot $LibertySource
    $nativeImageId = Ensure-NativeCompiler $source -Rebuild:$RebuildNative -CiCache:$CiCache -ColdBuild:$ColdBuild
    $playgroundRevision = & git rev-parse --verify HEAD 2>$null
    if ($LASTEXITCODE -ne 0) { $playgroundRevision = 'uncommitted' }
    $playgroundHash = Get-TreeFingerprint $repositoryRoot @('compiler-result.json', 'browser-result.json')
    Write-Output "Liberty $($source.Revision) ($($source.Mode)); source fingerprint $($source.TreeSha256)"
    $build = @('-f', 'build/compiler.Dockerfile', '--target', 'artifacts',
        '--build-context', "liberty_source=$($source.Path)",
        '--build-arg', "LIBERTY_REVISION=$($source.Revision)",
        '--build-arg', "SOURCE_DIFF_SHA256=$($source.TreeSha256)",
        '--build-arg', "LIBERTY_REPOSITORY=$($source.Repository)",
        '--build-arg', "SOURCE_DIRTY=$($source.Dirty.ToString().ToLowerInvariant())",
        '--build-arg', "SOURCE_MODE=$($source.Mode)",
        '--build-arg', "PLAYGROUND_REVISION=$playgroundRevision",
        '--build-arg', "PLAYGROUND_TREE_SHA256=$playgroundHash",
        '--build-arg', "BOOTSTRAP_IMAGE_ID=$nativeImageId",
        "--output=type=local,dest=$compilerDirectory", '.')
    Invoke-DockerBuild -Name compiler -CacheScope compiler -CiCache:$CiCache -ColdBuild:$ColdBuild -Arguments $build
    Invoke-DockerBuild -Name compiler-browser -ColdBuild:$ColdBuild -Arguments @('-f', 'build/compiler-browser.Dockerfile', '-t', 'liberty-playground:compiler-browser', '.')
    docker run --rm --platform linux/amd64 --network none --mount "type=bind,source=$compilerDirectory,target=/artifacts" liberty-playground:compiler-browser
    if ($LASTEXITCODE -ne 0) { throw 'Browser compiler acceptance failed.' }
    $verify = @('-f', 'build/verify-generated.Dockerfile', '--target', 'artifacts',
        '--build-context', "liberty_source=$($source.Path)",
        '--build-context', "browser_output=$compilerDirectory",
        "--output=type=local,dest=$validationDirectory", '.')
    Invoke-DockerBuild -Name generated-programs -ColdBuild:$ColdBuild -Arguments $verify
    docker run --rm --platform linux/amd64 --network none --mount "type=bind,source=$validationDirectory,target=/artifacts" liberty-playground:compiler-browser --execute
    if ($LASTEXITCODE -ne 0) { throw 'Ahead-of-time compiler regression or generated-program execution failed.' }
    $translation = Get-Content -Raw -LiteralPath (Join-Path $compilerDirectory 'translation-result.json') | ConvertFrom-Json
    $execution = Get-Content -Raw -LiteralPath (Join-Path $validationDirectory 'execution-result.json') | ConvertFrom-Json
    $report = @{ passed = $true; translation = $translation; execution = $execution } | ConvertTo-Json -Depth 100
    [System.IO.File]::WriteAllText($combinedReportPath, $report.Replace("`r`n", "`n") + "`n", [System.Text.UTF8Encoding]::new($false))
    Write-Output "PASS: compiler checks complete. Report: $combinedReportPath"
} finally { Pop-Location }
