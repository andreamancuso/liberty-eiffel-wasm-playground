$ErrorActionPreference = 'Stop'

function Get-GitText([string]$Directory, [string[]]$Arguments) {
    $value = @(& git -C $Directory @Arguments)
    if ($LASTEXITCODE -ne 0) { throw "Git failed in ${Directory}: $Arguments" }
    return $value
}

function Get-TreeFingerprint([string]$Directory, [string[]]$Exclude = @()) {
    $index = @(Get-GitText $Directory @('-c', 'core.quotepath=false', 'ls-files', '--stage'))
    $changed = @(Get-GitText $Directory @('-c', 'core.quotepath=false', 'diff', '--name-only'))
    $newFiles = @(Get-GitText $Directory @('-c', 'core.quotepath=false', 'ls-files', '--others', '--exclude-standard'))
    $files = $changed + $newFiles
    $hash = [System.Security.Cryptography.IncrementalHash]::CreateHash([System.Security.Cryptography.HashAlgorithmName]::SHA256)
    try {
        foreach ($entry in $index) {
            $name = ($entry -split "`t", 2)[1]
            if ($name -notin $Exclude) { $hash.AppendData([System.Text.Encoding]::UTF8.GetBytes($entry + "`n")) }
        }
        foreach ($file in ($files | Sort-Object -Unique)) {
            if ($file -in $Exclude) { continue }
            $fullPath = Join-Path $Directory $file
            if (Test-Path -LiteralPath $fullPath -PathType Container) { continue }
            $hash.AppendData([System.Text.Encoding]::UTF8.GetBytes($file + [char]0))
            if (Test-Path -LiteralPath $fullPath -PathType Leaf) { $hash.AppendData([System.IO.File]::ReadAllBytes($fullPath)) }
            else { $hash.AppendData([System.Text.Encoding]::UTF8.GetBytes('<deleted>')) }
        }
        return [System.BitConverter]::ToString($hash.GetHashAndReset()).Replace('-', '').ToLowerInvariant()
    } finally { $hash.Dispose() }
}

function Get-LibertySource([string]$PlaygroundRoot, [string]$Override) {
    $defaultSource = [string]::IsNullOrWhiteSpace($Override)
    if ($defaultSource) {
        $path = Join-Path $PlaygroundRoot 'liberty'
        if (-not (Test-Path -LiteralPath (Join-Path $path '.git'))) {
            & git -C $PlaygroundRoot submodule update --init --recursive -- liberty
            if ($LASTEXITCODE -ne 0) { throw 'Cannot initialize the pinned Liberty fork. Its pinned commit must be available on the fork remote.' }
        }
    } else { $path = $Override }
    $path = (Resolve-Path -LiteralPath $path).Path
    $topLevel = (Get-GitText $path @('rev-parse', '--show-toplevel')) -join ''
    if ([System.IO.Path]::GetFullPath($topLevel) -ne [System.IO.Path]::GetFullPath($path)) { throw 'LibertySource must be the root of a Liberty Git checkout.' }
    $revision = (Get-GitText $path @('rev-parse', 'HEAD')) -join ''
    $dirty = @(Get-GitText $path @('status', '--porcelain')).Count -gt 0
    if ($defaultSource) {
        $gitlink = (Get-GitText $PlaygroundRoot @('ls-files', '--stage', '--', 'liberty')) -join ''
        if ($gitlink -notmatch '^160000 ([0-9a-f]+) 0\s+liberty$' -or $revision -ne $Matches[1] -or $dirty) {
            throw 'The default Liberty submodule must be clean and at its pinned revision. Use -LibertySource for a development checkout.'
        }
    }
    foreach ($required in @('install.sh', 'src/smarteiffel/commands/compile_to_c.e', 'sys/runtime/c/base.h')) {
        if (-not (Test-Path -LiteralPath (Join-Path $path $required))) { throw "Liberty checkout is missing $required" }
    }
    return [pscustomobject]@{
        Path = $path; Revision = $revision; Dirty = $dirty
        Repository = (Get-GitText $path @('remote', 'get-url', 'origin')) -join ''
        TreeSha256 = Get-TreeFingerprint $path
        Mode = $(if ($defaultSource) { 'pinned-submodule' } else { 'local-override' })
    }
}

function Ensure-NativeCompiler($Source, [switch]$Rebuild) {
    $exists = & docker image ls --quiet liberty-playground:native
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect Docker images.' }
    if (-not $exists -or $Rebuild) {
        & docker build --platform linux/amd64 -f build/native.Dockerfile --build-context "liberty_source=$($Source.Path)" -t liberty-playground:native .
        if ($LASTEXITCODE -ne 0) { throw 'Native bootstrap failed.' }
    }
    $imageId = & docker image inspect liberty-playground:native --format '{{.Id}}'
    if ($LASTEXITCODE -ne 0) { throw 'Cannot identify native compiler image.' }
    return $imageId
}
