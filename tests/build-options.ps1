$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../build/docker-build.ps1')
. (Join-Path $PSScriptRoot '../build/common.ps1')
function Assert($Condition, [string]$Message) { if (-not $Condition) { throw $Message } }

$local = Get-DockerBuildArguments -Arguments @('-f', 'recipe', '.') -CacheScope native
Assert (-not ($local -contains '--cache-from')) 'Local builds must not require GitHub credentials.'
$warm = Get-DockerBuildArguments -Arguments @('.') -CacheScope compiler -CiCache -WriteCache
Assert ($warm -contains 'type=gha,version=2,scope=liberty-compiler-linux-amd64-v1') 'Warm builds must import the compiler scope.'
Assert ($warm -contains 'type=gha,version=2,scope=liberty-compiler-linux-amd64-v1,mode=max,ignore-error=true') 'Exports must include intermediate layers and be optional.'
$readOnly = Get-DockerBuildArguments -Arguments @('.') -CacheScope native -CiCache
Assert (-not ($readOnly -contains '--cache-to')) 'Read-only cache builds must not export.'
$cold = Get-DockerBuildArguments -Arguments @('.') -CacheScope toolchain -CiCache -ColdBuild -WriteCache
Assert (($cold -contains '--no-cache') -and -not ($cold -contains '--cache-from')) 'Cold builds must bypass both caches.'
Assert ($cold -contains '--cache-to') 'Cold builds can seed the cache.'
$rejected = $false
try { Get-BuildDirectory '../outside' | Out-Null } catch { $rejected = $true }
Assert $rejected 'Cleanup must reject paths outside artifacts.'

# An existing tag must never prevent Docker from checking the recipe inputs.
$script:invocations = @()
function Invoke-DockerBuild { param($Name, $Arguments, $CacheScope, [switch]$CiCache, [switch]$ColdBuild)
    $script:invocations += @{ name = $Name; cold = [bool]$ColdBuild }
}
function docker { 'image-id'; $global:LASTEXITCODE = 0 }
$source = @{ Path = 'fixture-source' }
Ensure-NativeCompiler $source | Out-Null
Ensure-NativeCompiler $source -Rebuild | Out-Null
Assert ($invocations.Count -eq 2) 'Native builds must be evaluated on both calls.'
Assert ((-not $invocations[0].cold) -and $invocations[1].cold) 'Only the explicit rebuild must force a cold native build.'
Write-Output 'PASS: cache options, cold builds, native selection, and output boundaries.'
