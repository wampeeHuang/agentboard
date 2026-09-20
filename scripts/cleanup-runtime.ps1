# cleanup-runtime.ps1 - archive stale session packages in _runtime/work/
# reads scripts/cleanup-runtime.config.json; only touches whitelisted dirs.
# ASCII-only content: PS 5.1 misparses param blocks from BOM-less UTF-8 scripts.
[CmdletBinding()]
param(
    [switch]$DryRun,
    [switch]$WorkOnly
)

$ErrorActionPreference = 'Stop'
$ConfigPath = Join-Path $PSScriptRoot 'cleanup-runtime.config.json'
$RuntimeDir = Join-Path (Split-Path $PSScriptRoot -Parent) '_runtime'
$WorkDir = Join-Path $RuntimeDir 'work'
$LogPath = Join-Path (Join-Path $RuntimeDir 'logs') 'cleanup.log'

if (-not (Test-Path $ConfigPath)) { Write-Error "config missing: $ConfigPath"; exit 1 }
$cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json
$workDays = [int]$cfg.work.retention_days

$now = Get-Date
if ($workDays -lt 1) { throw 'work retention_days must be positive' }
$ProjectDir = Split-Path $PSScriptRoot -Parent
$ArchiveDir = Join-Path $ProjectDir 'archive'
$BatchDir = Join-Path $ArchiveDir ('runtime-work/' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8))

function Assert-Contained([string]$Candidate, [string]$Root) {
    $full = [IO.Path]::GetFullPath($Candidate)
    $prefix = [IO.Path]::GetFullPath($Root).TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
    if (-not $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Path escapes root: $full" }
    # Reject junctions/symlinks in every existing ancestor, including roots.
    $cursor = $full
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Reparse path: $cursor" }
        }
        $cursor = Split-Path $cursor -Parent
    }
}

function Get-PackageItems($Entry) {
    if ($Entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Reparse package: $($Entry.FullName)" }
    $Entry
    if ($Entry.PSIsContainer) {
        foreach ($child in Get-ChildItem -LiteralPath $Entry.FullName -Force) { Get-PackageItems $child }
    }
}

$records = @()
if (Test-Path -LiteralPath $WorkDir) {
    Assert-Contained $WorkDir $RuntimeDir
    foreach ($entry in Get-ChildItem -LiteralPath $WorkDir -Force) {
        try { $items = @(Get-PackageItems $entry) }
        catch { Write-Warning "Skipped unsafe package: $($entry.Name): $_"; continue }
        if (@($items | Where-Object { $_.Name -in @('.keep', '.active') }).Count) {
            Write-Output "retained protected package: $($entry.Name)"; continue
        }
        $latest = ($items | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime
        if (($now - $latest).TotalDays -le $workDays) { continue }
        Assert-Contained $entry.FullName $WorkDir
        $target = Join-Path $BatchDir $entry.Name
        Assert-Contained $target $ArchiveDir
        $files = @($items | Where-Object { -not $_.PSIsContainer } | ForEach-Object {
            [pscustomobject]@{ relative = $_.FullName.Substring($WorkDir.Length + 1); bytes = $_.Length; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
        })
        if ($DryRun) { Write-Output "[dry-run] archive $($entry.Name): $($files.Count) files -> $target"; continue }
        New-Item -ItemType Directory -Force -Path $BatchDir | Out-Null
        $record = [pscustomobject]@{ source = $entry.FullName; destination = $target; status = 'planned'; files = $files }
        $records += $record
        ConvertTo-Json -InputObject $records -Depth 6 | Set-Content -LiteralPath (Join-Path $BatchDir 'manifest.json') -Encoding UTF8
        Move-Item -LiteralPath $entry.FullName -Destination $target -ErrorAction Stop
        foreach ($file in $files) {
            $archived = Join-Path $BatchDir $file.relative
            if ((Get-FileHash -LiteralPath $archived -Algorithm SHA256).Hash -ne $file.sha256) { throw "Archive verification failed; retained at $target" }
        }
        $afterFiles = @(Get-PackageItems (Get-Item -LiteralPath $target -Force) | Where-Object { -not $_.PSIsContainer })
        if ($afterFiles.Count -ne $files.Count) { throw "Package changed during archive; retained at $target" }
        $record.status = 'verified'
        ConvertTo-Json -InputObject $records -Depth 6 | Set-Content -LiteralPath (Join-Path $BatchDir 'manifest.json') -Encoding UTF8
        Write-Output "archived and verified: $($entry.Name) ($($files.Count) files)"
    }
}
if (-not $DryRun) {
    New-Item -ItemType Directory -Force -Path (Split-Path $LogPath) | Out-Null
    Add-Content -LiteralPath $LogPath -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') cleanup: $($records.Count) work packages archived; retention=$workDays d; archive=$BatchDir"
}

if ($WorkOnly) { return }
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
