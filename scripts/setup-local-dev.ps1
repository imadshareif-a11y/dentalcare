# setup-local-dev.ps1 — إعداد تطوير محلي بعد clone (جهاز جديد)
# الاستخدام من جذر المستودع:
#   powershell -ExecutionPolicy Bypass -File scripts\setup-local-dev.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Root "dentalcare-backend"))) {
  $Root = Get-Location
}

Write-Host "==> Root: $Root"

$Backend = Join-Path $Root "dentalcare-backend"
$Frontend = Join-Path $Root "dentalcare-frontend"
$EnvFile = Join-Path $Backend ".env"
$EnvExample = Join-Path $Backend ".env.example"

if (-not (Test-Path $EnvFile)) {
  if (-not (Test-Path $EnvExample)) { throw ".env.example missing" }
  Copy-Item $EnvExample $EnvFile
  Write-Host "==> Created dentalcare-backend/.env from .env.example — edit DB_* and JWT_SECRET before migrate."
} else {
  Write-Host "==> .env already exists — keeping it."
}

Write-Host "==> npm ci (backend)"
Push-Location $Backend
npm ci
Pop-Location

Write-Host "==> npm ci (frontend)"
Push-Location $Frontend
npm ci
Pop-Location

Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Edit dentalcare-backend/.env (DB_PASSWORD, JWT_SECRET, PORT)."
Write-Host "  2. CREATE DATABASE dentalcare;  (pgAdmin or psql)"
Write-Host "  3. cd dentalcare-backend; npm run migrate:all; npm run seed:trial"
Write-Host "  4. If PORT != 5001, update dentalcare-frontend/vite.config.js proxy target."
Write-Host "  5. Terminal A: cd dentalcare-backend; npm start"
Write-Host "  6. Terminal B: cd dentalcare-frontend; npm run dev"
Write-Host "  7. Open http://localhost:5173"
Write-Host "  Railway (same accounts): https://dentalcare-production-e6a9.up.railway.app/"
