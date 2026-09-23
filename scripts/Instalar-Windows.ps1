param(
    [string]$Direccion = '',
    [ValidateRange(1024,65535)][int]$Puerto = 3000
)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
function Run-Docker {
    param([string[]]$DockerArgs)
    & docker @DockerArgs
    if ($LASTEXITCODE -ne 0) { throw "Docker no pudo completar: $($DockerArgs -join ' ')" }
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'No se encontro Docker. Instala o inicia Docker en este servidor.' }
$Engine = & docker info --format '{{.OSType}}'
if ($LASTEXITCODE -ne 0) { throw 'Docker no esta iniciado o no se puede contactar con su motor.' }
if ($Engine.Trim() -ne 'linux') { throw 'Este paquete requiere un motor Docker de contenedores Linux. En Windows 10/11 selecciona Linux containers; en Windows Server utiliza un motor Linux en una maquina virtual.' }
Run-Docker -DockerArgs @('compose','version')
if (-not (Test-Path '.env')) {
    if (-not $Direccion) {
        $Direccion = Read-Host 'IP o nombre local de este servidor (Enter = solo localhost para probar)'
        if (-not $Direccion) { $Direccion = 'localhost' }
    }
    if ($Direccion -notmatch '^[a-zA-Z0-9][a-zA-Z0-9.-]*$') { throw 'Usa una IP o nombre de equipo, sin http://, rutas ni espacios.' }
    $Bind = if ($Direccion -in @('localhost','127.0.0.1')) { '127.0.0.1' } else { '0.0.0.0' }
    $Config = "APP_ORIGIN=http://${Direccion}:$Puerto`nPORT=$Puerto`nBIND_ADDRESS=$Bind`nNEXT_TELEMETRY_DISABLED=1`n"
    [IO.File]::WriteAllText((Join-Path $PSScriptRoot '.env'),$Config,(New-Object Text.UTF8Encoding($false)))
}
Write-Host 'Compilando e iniciando la agenda. La primera vez requiere acceso a Internet para descargar dependencias.'
Run-Docker -DockerArgs @('compose','up','-d','--build','--wait','--wait-timeout','180')
Write-Host ''
Run-Docker -DockerArgs @('compose','exec','-T','agenda','node','scripts/setup-code.mjs')
$OriginLine = Get-Content '.env' | Where-Object { $_ -match '^APP_ORIGIN=' } | Select-Object -First 1
$Origin = $OriginLine.Substring(11)
Write-Host "`nAgenda disponible en: $Origin"
Write-Host 'Abre esa direccion y crea la cuenta de Direccion con el codigo mostrado arriba.'
Write-Host 'Usa la misma direccion en los equipos de la oficina. Si no conecta, revisa el puerto del firewall segun la guia.'
