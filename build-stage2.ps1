param([string]$LibertySource, [switch]$RebuildNative)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'build-common.ps1')
$stage2Directory = Join-Path $PSScriptRoot 'artifacts/stage2'
$validationDirectory = Join-Path $PSScriptRoot 'artifacts/stage2-validation'
Push-Location $PSScriptRoot
try {
    $combinedReportPath = Join-Path $stage2Directory 'stage2-result.json'
    if (Test-Path -LiteralPath $combinedReportPath) { Remove-Item -LiteralPath $combinedReportPath }
    $source = Get-LibertySource $PSScriptRoot $LibertySource
    $nativeImageId = Ensure-NativeCompiler $source -Rebuild:$RebuildNative
    $playgroundRevision = & git rev-parse --verify HEAD 2>$null
    if ($LASTEXITCODE -ne 0) { $playgroundRevision = 'uncommitted' }
    $playgroundHash = Get-TreeFingerprint $PSScriptRoot @('stage2-result.json')
    Write-Output "Liberty $($source.Revision) ($($source.Mode)); source fingerprint $($source.TreeSha256)"
    $build = @('build', '--platform', 'linux/amd64', '-f', 'Dockerfile.stage2', '--target', 'artifacts',
        '--build-context', "liberty_source=$($source.Path)",
        '--build-arg', "LIBERTY_REVISION=$($source.Revision)",
        '--build-arg', "SOURCE_DIFF_SHA256=$($source.TreeSha256)",
        '--build-arg', "LIBERTY_REPOSITORY=$($source.Repository)",
        '--build-arg', "SOURCE_DIRTY=$($source.Dirty.ToString().ToLowerInvariant())",
        '--build-arg', "SOURCE_MODE=$($source.Mode)",
        '--build-arg', "PLAYGROUND_REVISION=$playgroundRevision",
        '--build-arg', "PLAYGROUND_TREE_SHA256=$playgroundHash",
        '--build-arg', "BOOTSTRAP_IMAGE_ID=$nativeImageId",
        "--output=type=local,dest=$stage2Directory", '.')
    & docker @build
    if ($LASTEXITCODE -ne 0) { throw 'WASM compiler build or Node smoke failed.' }
    docker build --platform linux/amd64 -f Dockerfile.stage2-browser -t liberty-emscripten:stage2-browser .
    if ($LASTEXITCODE -ne 0) { throw 'Browser verifier build failed.' }
    docker run --rm --platform linux/amd64 --network none --mount "type=bind,source=$stage2Directory,target=/artifacts" liberty-emscripten:stage2-browser
    if ($LASTEXITCODE -ne 0) { throw 'Browser compiler acceptance failed.' }
    $verify = @('build', '--platform', 'linux/amd64', '-f', 'Dockerfile.stage2-verify', '--target', 'artifacts',
        '--build-context', "liberty_source=$($source.Path)",
        '--build-context', "browser_output=$stage2Directory",
        "--output=type=local,dest=$validationDirectory", '.')
    & docker @verify
    if ($LASTEXITCODE -ne 0) { throw 'Offline validation of browser-generated C failed.' }
    docker run --rm --platform linux/amd64 --network none --mount "type=bind,source=$validationDirectory,target=/artifacts" liberty-emscripten:stage2-browser --execute
    if ($LASTEXITCODE -ne 0) { throw 'Stage 1 regression or generated-program execution failed.' }
    $translation = Get-Content -Raw -LiteralPath (Join-Path $stage2Directory 'stage2-browser-result.json') | ConvertFrom-Json
    $execution = Get-Content -Raw -LiteralPath (Join-Path $validationDirectory 'stage2-execution-result.json') | ConvertFrom-Json
    $report = @{ passed = $true; translation = $translation; execution = $execution } | ConvertTo-Json -Depth 100
    [System.IO.File]::WriteAllText($combinedReportPath, $report.Replace("`r`n", "`n") + "`n", [System.Text.UTF8Encoding]::new($false))
    Write-Output "PASS: stage 2 complete. Report: $combinedReportPath"
} finally { Pop-Location }
