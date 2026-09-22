param([Parameter(Mandatory=$true)][string]$Archivo)
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
$Source=(Resolve-Path $Archivo).Path
if ([IO.Path]::GetExtension($Source) -ne '.sqlite') { throw 'Selecciona un respaldo .sqlite generado por la agenda.' }
Write-Host 'La restauracion sustituye la base actual. Se guardara antes un respaldo de seguridad.'
$Answer=Read-Host 'Escribe RESTAURAR para continuar'
if ($Answer -cne 'RESTAURAR') { throw 'Restauracion cancelada.' }
& "$PSScriptRoot\Respaldar-Windows.ps1"
if (-not $?) { throw 'No se pudo crear el respaldo previo. No se modifico la base.' }
& docker compose stop agenda
if ($LASTEXITCODE -ne 0) { throw 'No se pudo detener la agenda.' }
$RestoreFolder=Join-Path ([IO.Path]::GetTempPath()) ('agenda-restore-'+[guid]::NewGuid())
New-Item -ItemType Directory -Path $RestoreFolder | Out-Null
Copy-Item -LiteralPath $Source -Destination (Join-Path $RestoreFolder 'restore.sqlite')
try {
    & docker compose run --rm --no-deps -v "${RestoreFolder}:/restore:ro" agenda node scripts/restore.mjs /restore/restore.sqlite
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo restaurar. La agenda permanece detenida; revisa el respaldo y los mensajes.' }
    & docker compose up -d --wait --wait-timeout 180
    if ($LASTEXITCODE -ne 0) { throw 'La base fue restaurada, pero el servicio requiere revision.' }
    Write-Host 'Base restaurada y agenda iniciada. Las sesiones previas se revocaron.'
} finally { Remove-Item -LiteralPath $RestoreFolder -Recurse -Force }
