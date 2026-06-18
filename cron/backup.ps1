# Daily backup: workspace + bones → F drive (robocopy /MIR)
# Registered as cron job: 每日备份 → F 盘 (3:15 AM daily)
# Log: ~/.agentboard/cron/backup.log (last 100 lines kept)

$logPath = Join-Path $PSScriptRoot "backup.log"
$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

function Write-Log($msg) {
  $line = "[$ts] $msg"
  Add-Content -Path $logPath -Value $line -Encoding UTF8
}

# Check F drive
if (-not (Test-Path "F:\")) {
  Write-Log "FAIL: F drive not mounted"
  exit 1
}

$dest = "F:\_migration-snapshot"
if (-not (Test-Path $dest)) {
  New-Item -ItemType Directory -Path $dest -Force | Out-Null
}

$errors = 0
$pairs = @(
  @{src="D:\workspace"; dst="$dest\workspace"},
  @{src="$env:USERPROFILE\.claude"; dst="$dest\claude"},
  @{src="$env:USERPROFILE\.agentboard"; dst="$dest\agentboard"},
  @{src="$env:USERPROFILE\.scheduler"; dst="$dest\scheduler"},
  @{src="D:\workspace\_output"; dst="$dest\output"}
)

foreach ($pair in $pairs) {
  $src = $pair.src
  $dst = $pair.dst
  if (-not (Test-Path $src)) {
    Write-Log "SKIP: $src (not found)"
    continue
  }
  Write-Log "START: robocopy $src → $dst"
  $result = robocopy $src $dst /MIR /R:2 /W:5 /NFL /NDL
  if ($LASTEXITCODE -ge 8) {
    Write-Log "FAIL: robocopy $src → $dst (exit $LASTEXITCODE)"
    $errors++
  } else {
    Write-Log "OK: robocopy $src → $dst"
  }
}

# Rotate log: keep last 100 lines
if (Test-Path $logPath) {
  $lines = Get-Content $logPath
  if ($lines.Count -gt 100) {
    $lines[-100..-1] | Set-Content $logPath -Encoding UTF8
  }
}

Write-Log "DONE: $($pairs.Count - $errors)/$($pairs.Count) ok"
if ($errors -gt 0) { exit 1 } else { exit 0 }
