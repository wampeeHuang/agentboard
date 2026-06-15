$ErrorActionPreference = "Stop"
$taskName = "OpenClaw Gateway"
$gatewayCmd = "C:\Users\Administrator\.openclaw\gateway.cmd"

# Remove old tasks
schtasks /delete /tn $taskName /f 2>$null
schtasks /delete /tn "Clawdbot Gateway" /f 2>$null

# Create new boot-start task (SYSTEM account, no login required)
schtasks /create `
  /tn $taskName `
  /sc ONSTART `
  /ru SYSTEM `
  /rl HIGHEST `
  /tr "`"$gatewayCmd`"" `
  /delay 0000:30 `
  /f

Write-Host ""
Write-Host "=== Verify ==="
schtasks /query /tn $taskName /fo LIST
Write-Host ""
Write-Host "Done. Gateway will auto-start on boot, no login required."
