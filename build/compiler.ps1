param([string]$LibertySource, [switch]$RebuildNative, [switch]$CiCache, [switch]$ColdBuild)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
. (Join-Path $PSScriptRoot 'docker-build.ps1')
$repositoryRoot = Split-Path $PSScriptRoot -Parent
$compilerDirectory = Reset-BuildDirectory compiler
Push-Location $repositoryRoot
try {
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
    Write-Output 'PASS: browser compiler packaged and Node translation smoke passed.'
} finally { Pop-Location }
