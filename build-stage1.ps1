param([string]$LibertySource, [switch]$RebuildNative)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'build-common.ps1')
$artifactDirectory = Join-Path $PSScriptRoot 'artifacts/site'
Push-Location $PSScriptRoot
try {
    $source = Get-LibertySource $PSScriptRoot $LibertySource
    $nativeImageId = Ensure-NativeCompiler $source -Rebuild:$RebuildNative
    Write-Output "Liberty $($source.Revision) ($($source.Mode))"
    $build = @('build', '--platform', 'linux/amd64', '-f', 'Dockerfile',
        '--build-context', "liberty_source=$($source.Path)",
        '--build-arg', "LIBERTY_REVISION=$($source.Revision)", '--target', 'artifacts',
        "--output=type=local,dest=$artifactDirectory", '.')
    & docker @build
    if ($LASTEXITCODE -ne 0) { throw 'Eiffel to WebAssembly build failed.' }
    docker build --platform linux/amd64 -f Dockerfile.browser -t liberty-emscripten:stage1-browser .
    if ($LASTEXITCODE -ne 0) { throw 'Browser smoke image build failed.' }
    docker run --rm --platform linux/amd64 --network none --mount "type=bind,source=$artifactDirectory,target=/artifacts" liberty-emscripten:stage1-browser
    if ($LASTEXITCODE -ne 0) { throw 'Browser smoke failed.' }
} finally { Pop-Location }
