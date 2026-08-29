# cleanup-runtime.ps1 - purge stale session drafts in _runtime/work/
# reads scripts/cleanup-runtime.config.json; only touches whitelisted dirs.
# ASCII-only content: PS 5.1 misparses param blocks from BOM-less UTF-8 scripts.
[CmdletBinding()]
param(
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$ConfigPath = Join-Path $PSScriptRoot 'cleanup-runtime.config.json'
$RuntimeDir = Join-Path (Split-Path $PSScriptRoot -Parent) '_runtime'
$WorkDir = Join-Path $RuntimeDir 'work'
$LogPath = Join-Path (Join-Path $RuntimeDir 'logs') 'cleanup.log'

if (-not (Test-Path $ConfigPath)) { Write-Error "config missing: $ConfigPath"; exit 1 }
$cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json
$workDays = [int]$cfg.work.retention_days

if (-not (Test-Path $WorkDir)) { Write-Output "no work dir: $WorkDir"; exit 0 }

$now = Get-Date
$removed = @()
Get-ChildItem -Path $WorkDir -File | ForEach-Object {
    if (($now - $_.LastWriteTime).TotalDays -gt $workDays) {
        if ($DryRun) {
            Write-Output "[dry-run] would remove: $($_.Name)"
        } else {
            Remove-Item -Path $_.FullName -Force
            Write-Output "removed: $($_.Name)"
        }
        $removed += $_.Name
    }
}

if (-not $DryRun) {
    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -Path $LogPath -Value "$stamp cleanup: $($removed.Count) files removed from work/ (retention $workDays d)"
}

# state/api-calls purge (retention from config state.retention_days; ASCII-only)
$StateDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'state'
$stateCfg = $cfg.state
if ($stateCfg -and $stateCfg.retention_days) {
    $stateDays = [int]$stateCfg.retention_days
    $stateRemoved = @()
    if ($stateCfg.clean) {
        foreach ($sub in $stateCfg.clean) {
            $subDir = Join-Path $StateDir $sub
            if (Test-Path $subDir) {
                Get-ChildItem -Path $subDir -Recurse -File | ForEach-Object {
                    if (($now - $_.LastWriteTime).TotalDays -gt $stateDays) {
                        if ($DryRun) {
                            Write-Output "[dry-run] would remove state: $($_.FullName)"
                        } else {
                            Remove-Item -Path $_.FullName -Force
                            Write-Output "removed state: $($_.Name)"
                        }
                        $stateRemoved += $_.Name
                    }
                }
            }
        }
    }
    if (-not $DryRun) {
        $stateStamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
        Add-Content -Path $LogPath -Value "$stateStamp cleanup: $($stateRemoved.Count) files removed from state/ (retention $stateDays d)"
    }
}
