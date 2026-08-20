# backup-rotate.ps1 — حذف نسخ أقدم من BACKUP_KEEP_DAYS
$ErrorActionPreference = 'Stop'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $Root

if (Test-Path '.env') {
  Get-Content '.env' | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    $pair = $_.Split('=', 2)
    if ($pair.Length -eq 2) {
      [Environment]::SetEnvironmentVariable($pair[0].Trim(), $pair[1].Trim().Trim('"').Trim("'"), 'Process')
    }
  }
}

$Keep = 14
if ($env:BACKUP_KEEP_DAYS) { $Keep = [int]$env:BACKUP_KEEP_DAYS }
$BackupsRoot = if ($env:BACKUPS_DIR) { $env:BACKUPS_DIR } else { (Join-Path $Root 'backups') }
$FullDir = Join-Path $BackupsRoot 'full'
if (-not (Test-Path $FullDir)) { Write-Host 'No full backups dir'; exit 0 }

$cutoff = (Get-Date).AddDays(-$Keep)
Get-ChildItem $FullDir -Filter 'dentalcare-*.dump' | Where-Object { $_.LastWriteTime -lt $cutoff } | ForEach-Object {
  Write-Host "Removing $($_.Name)"
  Remove-Item $_.FullName -Force
}
Write-Host "Rotate done (keep $Keep days)"
