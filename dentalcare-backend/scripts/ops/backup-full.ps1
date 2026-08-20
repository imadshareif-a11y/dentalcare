# backup-full.ps1 — pg_dump -Fc للنسخة الكاملة
$ErrorActionPreference = 'Stop'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $Root

if (Test-Path '.env') {
  Get-Content '.env' | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    $pair = $_.Split('=', 2)
    if ($pair.Length -eq 2) {
      $name = $pair[0].Trim()
      $val = $pair[1].Trim().Trim('"').Trim("'")
      [Environment]::SetEnvironmentVariable($name, $val, 'Process')
    }
  }
}

$DbUser = if ($env:DB_USER) { $env:DB_USER } else { 'postgres' }
$DbHost = if ($env:DB_HOST) { $env:DB_HOST } else { 'localhost' }
$DbName = if ($env:DB_NAME) { $env:DB_NAME } else { 'dentalcare' }
$DbPort = if ($env:DB_PORT) { $env:DB_PORT } else { '5432' }
$DbPass = if ($env:DB_PASSWORD) { $env:DB_PASSWORD } else { 'postgres' }
$BackupsRoot = if ($env:BACKUPS_DIR) { $env:BACKUPS_DIR } else { (Join-Path $Root 'backups') }
$FullDir = Join-Path $BackupsRoot 'full'
New-Item -ItemType Directory -Force -Path $FullDir | Out-Null

$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$outFile = Join-Path $FullDir "dentalcare-$stamp.dump"
$PgDump = if ($env:PG_DUMP) { $env:PG_DUMP } else { 'pg_dump' }

$env:PGPASSWORD = $DbPass
& $PgDump -Fc -h $DbHost -p $DbPort -U $DbUser -d $DbName -f $outFile
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with code $LASTEXITCODE" }

$meta = @{
  ranAt = (Get-Date).ToUniversalTime().ToString('o')
  file = (Split-Path $outFile -Leaf)
  database = $DbName
  sizeBytes = (Get-Item $outFile).Length
} | ConvertTo-Json
Set-Content -Path (Join-Path $FullDir 'last-run.json') -Value $meta -Encoding UTF8
Write-Host "Backup written: $outFile"
