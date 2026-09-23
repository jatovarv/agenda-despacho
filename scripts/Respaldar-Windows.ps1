param([string]$Destino = '')
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
if (-not $Destino) { $Destino = Join-Path $PSScriptRoot 'backups' }
New-Item -ItemType Directory -Force -Path $Destino | Out-Null
& docker compose exec -T agenda node scripts/backup.mjs
if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear un respaldo consistente de SQLite.' }
& docker compose cp 'agenda:/app/backups/.' $Destino
if ($LASTEXITCODE -ne 0) { throw 'El respaldo existe dentro del volumen, pero no se pudo copiar a Windows.' }
Write-Host "Respaldos verificados en: $Destino"
