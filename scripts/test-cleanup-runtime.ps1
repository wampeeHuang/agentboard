# Integration regression tests; fixtures are retained for inspection.
$ErrorActionPreference = 'Stop'
$root = Join-Path $env:TEMP ('agentboard-cleanup-test-' + [guid]::NewGuid().ToString('N'))
$scripts = New-Item -ItemType Directory -Path (Join-Path $root 'scripts')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'cleanup-runtime.ps1') -Destination $scripts.FullName
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'cleanup-runtime.config.json') -Destination $scripts.FullName
$work = Join-Path $root '_runtime/work'
foreach ($relative in @('expired/nested/a.txt','fresh/nested/b.txt','protected/.keep','protected/c.txt')) {
    $file = Join-Path $work $relative
    New-Item -ItemType Directory -Force -Path (Split-Path $file) | Out-Null
    Set-Content -LiteralPath $file -Value $relative
}
foreach ($relative in @('_runtime/inputs/reference.txt','state/api-calls/old.jsonl')) {
    $file = Join-Path $root $relative
    New-Item -ItemType Directory -Force -Path (Split-Path $file) | Out-Null
    Set-Content -LiteralPath $file -Value 'retain'
}
Get-ChildItem -LiteralPath $root -Recurse -Force | ForEach-Object { $_.LastWriteTime = (Get-Date).AddDays(-40) }
(Get-Item -LiteralPath (Join-Path $work 'fresh/nested/b.txt')).LastWriteTime = Get-Date
$script = Join-Path $scripts.FullName 'cleanup-runtime.ps1'
& powershell -NoProfile -File $script -WorkOnly -DryRun
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $work 'expired/nested/a.txt'))) { throw 'dry-run mutated or failed' }
& powershell -NoProfile -File $script -WorkOnly
if ($LASTEXITCODE -ne 0) { throw 'cleanup failed' }
if (Test-Path -LiteralPath (Join-Path $work 'expired')) { throw 'expired nested package remains' }
foreach ($relative in @('_runtime/work/fresh/nested/b.txt','_runtime/work/protected/c.txt','_runtime/inputs/reference.txt','state/api-calls/old.jsonl')) {
    if (-not (Test-Path -LiteralPath (Join-Path $root $relative))) { throw "protected file missing: $relative" }
}
$manifests = @(Get-ChildItem -LiteralPath (Join-Path $root 'archive') -Recurse -Filter manifest.json)
if ($manifests.Count -ne 1) { throw 'archive batch count' }
$parsed = Get-Content -LiteralPath $manifests[0].FullName -Raw | ConvertFrom-Json
$record = $parsed[0]
if ($record.status -ne 'verified' -or $record.files.Count -ne 1) { throw 'manifest incomplete' }
$archived = Join-Path $manifests[0].DirectoryName $record.files[0].relative
if ((Get-FileHash -LiteralPath $archived).Hash -ne $record.files[0].sha256) { throw 'archive hash mismatch' }
& powershell -NoProfile -File $script -WorkOnly
if ($LASTEXITCODE -ne 0 -or @(Get-ChildItem -LiteralPath (Join-Path $root 'archive') -Recurse -Filter manifest.json).Count -ne 1) { throw 'not idempotent' }
if (Test-Path -LiteralPath $record.source) { throw 'restore collision' }
foreach ($candidate in @($record.source, $record.destination)) {
    if (-not [IO.Path]::GetFullPath($candidate).StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'restore outside fixture' }
}
Move-Item -LiteralPath $record.destination -Destination $record.source
if ((Get-FileHash -LiteralPath (Join-Path $work 'expired/nested/a.txt')).Hash -ne $record.files[0].sha256) { throw 'restore mismatch' }
Write-Output "PASS: dry-run, recursive archive, recent-child protection, keep marker, inputs/state isolation, hash verification, idempotency, restore. Fixture: $root"
