$ErrorActionPreference = 'Stop'

function Get-DockerBuildArguments {
    param([string[]]$Arguments, [string]$CacheScope, [switch]$CiCache, [switch]$ColdBuild, [switch]$WriteCache)
    $options = @('buildx', 'build', '--platform', 'linux/amd64', '--progress', 'plain')
    if ($ColdBuild) { $options += '--no-cache' }
    if ($CiCache -and $CacheScope) {
        $scope = "liberty-$CacheScope-linux-amd64-v1"
        if (-not $ColdBuild) { $options += @('--cache-from', "type=gha,version=2,scope=$scope") }
        if ($WriteCache) { $options += @('--cache-to', "type=gha,version=2,scope=$scope,mode=max,ignore-error=true") }
    }
    return $options + $Arguments
}

function Invoke-DockerBuild {
    param([string]$Name, [string[]]$Arguments, [string]$CacheScope, [switch]$CiCache, [switch]$ColdBuild)
    $options = Get-DockerBuildArguments -Arguments $Arguments -CacheScope $CacheScope -CiCache:$CiCache -ColdBuild:$ColdBuild -WriteCache:($env:BUILD_CACHE_WRITE -eq 'true')
    $logs = Join-Path $PSScriptRoot '../artifacts/build-logs'
    New-Item -ItemType Directory -Path $logs -Force | Out-Null
    $log = Join-Path $logs "$Name.log"
    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    & docker @options 2>&1 | Tee-Object -FilePath $log | Out-Host
    $code = $LASTEXITCODE
    $watch.Stop()
    $measurement = @{ name = $Name; elapsedSeconds = [Math]::Round($watch.Elapsed.TotalSeconds, 2); exitCode = $code; cold = [bool]$ColdBuild; ciCache = [bool]$CiCache }
    $measurement | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $logs "$Name.timing.json") -Encoding utf8
    if ($code -ne 0) { throw "Docker build '$Name' failed with exit code $code. See $log" }
}

function Get-BuildDirectory([string]$Name) {
    $root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../artifacts'))
    $target = [System.IO.Path]::GetFullPath((Join-Path $root $Name))
    if (-not $target.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::Ordinal)) {
        throw 'Build output must stay inside the artifacts directory.'
    }
    return $target
}

function Reset-BuildDirectory([string]$Name) {
    $target = Get-BuildDirectory $Name
    if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    return $target
}
