# Agenda del despacho «MEMO» — README técnico de implementación nativa en Windows

Repositorio: <https://github.com/jatovarv/agenda-despacho>.

## 1. Decisión de arquitectura y estado

Implementar la aplicación existente en **una PC Windows con Node.js 24 y SQLite**, con acceso desde los navegadores de la red del despacho. GitHub guarda código/versiones; la PC ejecuta la aplicación y conserva la información. Priorizar funcionalidad, eficacia y mantenimiento sencillo.

**Este documento es la especificación técnica y el procedimiento de instalación.** El servidor nativo existe; las plantillas Windows incluidas deben guardarse, instalarse y verificarse en la PC. No son un instalador ya ejecutado. El despliegue en Windows y la migración desde Sites siguen pendientes de validación.

Código contrastado con `ea72db7e1cf56a8a52c0ac1ab1efcaf1eb00e878`; esta ampliación incorpora atenciones fuera de la oficina y su exclusión del uso de salas. Los scripts actuales `Iniciar-Windows.cmd`, `Instalar-Windows.ps1`, `Respaldar-Windows.ps1` y `Restaurar-Windows.ps1` corresponden a Docker: **no usarlos para la ruta nativa descrita aquí**. Docker queda como alternativa secundaria.

```text
GitHub privado ── descargar versión aprobada ──> PC Windows
                                                  │
Navegadores del personal ── red interna ──> Node.js / Next.js
                                                  │
                                                  ├── SQLite en disco local
                                                  └── backups consistentes
                                                         └── copia fuera de la PC
```

- Una sola instancia del servidor y una base compartida por la aplicación. Los clientes no abren el archivo SQLite.
- Reutilizar el código. No hace falta WSL, máquinas virtuales, microservicios, otro motor de base de datos o una aplicación de escritorio.
- El personal utiliza un acceso directo a la URL, sin instalar Node ni GitHub en cada equipo.
- La operación diaria funciona en LAN sin Internet; instalación y actualizaciones sí requieren descargar dependencias.
- Mantener la PC encendida, con dirección estable y sin suspensión durante la atención.
- SQLite activo en disco local; no en SMB, OneDrive o una carpeta sincronizada. Copiar al destino externo únicamente backups terminados.
- Usar inicialmente el Programador de tareas de Windows. Si TI ya utiliza un gestor de servicios, puede aplicar los mismos argumentos, permisos y directorio de trabajo.

## 2. Stack y mapa del código

| Elemento | Implementación actual |
| --- | --- |
| Runtime | Node.js `>=24.0.0 <25`; seleccionar un parche mantenido de la rama 24 |
| Framework | Next.js `16.3.4`, App Router, salida `standalone` |
| Interfaz | React `19.2.6`, TypeScript, Tailwind, componentes locales |
| Base | `node:sqlite`, `DatabaseSync`, API de backup SQLite |
| Esquema | Drizzle `0.45.2`, migraciones SQL verificadas por checksum |
| Exportación | CSV, XLSX con `fflate`, HTML imprimible/PDF en navegador |
| Dependencias | `npm ci` con `package-lock.json` |

No ejecutar `npm update` como parte rutinaria de instalación. Registrar versiones y revisar avisos oficiales de seguridad antes de liberar; las actualizaciones requieren pruebas. Compilar en Windows: no copiar `node_modules`/`.next` construidos en macOS o Linux.

| Ruta en el repositorio | Responsabilidad |
| --- | --- |
| `app/page.tsx` | Login, reserva, agenda, espera, métricas, CEO y Admin; refresco cada 30 s |
| `app/api/desk/route.ts` | API de negocio, permisos, validaciones, sesiones y auditoría |
| `app/api/health/route.ts` | Comprobación básica de disponibilidad de SQLite |
| `lib/catalog.ts` | Salas, 44 operaciones iniciales, horario y asignación |
| `lib/auth.ts` | Hashes, tokens y representación pública del usuario |
| `lib/server-config.ts` | Origen permitido y cookie segura |
| `lib/metrics.ts` | Actividad general y uso de salas con exclusión de atenciones externas |
| `lib/export.ts` | CSV, XLSX, folios y confirmación imprimible |
| `db/schema.ts` | Esquema lógico |
| `db/sqlite.mjs` | Apertura, migraciones, código inicial y backup consistente |
| `db/raw.ts` | Adaptador SQL y transacciones `BEGIN IMMEDIATE` |
| `drizzle/` | Migraciones y `meta/_journal.json` |
| `scripts/start.mjs` | Entrada de producción, carga `.env` y abre SQLite |
| `scripts/package-release.mjs` | Completa el árbol standalone con estáticos, recursos y scripts |
| `scripts/setup-code.mjs` | Obtiene código local para la primera cuenta |
| `scripts/backup.mjs` | Genera y verifica un backup |
| `scripts/restore.mjs` | Restaura backup compatible, revoca sesiones y registra restauración |
| `tests/` | Pruebas de persistencia, exportación y API |

El PDF del catálogo fue fuente de la carga inicial. No se consulta en cada arranque. Después del setup, catálogo/equipos/usuarios se administran desde la aplicación; cambiar el PDF o `CATALOG` no actualiza automáticamente una base existente.

## 3. Contrato funcional

### 3.1 Horario, captura y personas

- Zona de negocio: `America/Mexico_City`. Fecha civil `YYYY-MM-DD`, hora `HH:mm`.
- Horario inicial **08:00–17:30**; duración inicial **60 minutos**.
- Duración entera entre 15 y 600, múltiplo de 15, siempre terminando antes o al cierre. Con el horario inicial, máximo efectivo 570 minutos.
- La hora de inicio se valida al minuto; la API no exige múltiplos de 15. Las alternativas sí usan pasos de 15 minutos.
- Campos: cliente, integrante que atiende, fecha, hora, duración, personas, operaciones, accesibilidad y notas opcionales. Equipo/nombres se derivan del integrante seleccionado.
- `people` cuenta **todos los ocupantes, incluido personal**. Entero de 1 a 100; en oficina, más de 16 no consigue sala y puede entrar en espera. Fuera de la oficina no aplica el límite de capacidad de las salas.
- Al menos una operación activa; IDs únicos. Selector agrupado por materia, checkboxes y chips removibles.
- Crear/reagendar exige fecha/hora futuras. No hay calendario de festivos ni exclusión de fines de semana.

### 3.2 Algoritmo de asignación

| Orden normal | ID | Sala | Capacidad | Orden con accesibilidad |
| --- | --- | --- | ---: | ---: |
| 1 | `barra` | Sala Barra | 5 | 1 |
| 2 | `redonda` | Sala Redonda | 5 | 3 |
| 3 | `anexo` | Sala Anexo Not. | 6 | 2 |
| 4 | `rectangular` | Sala Rectangular | 7 | 4 |
| 5 | `acuerdos` | Sala Acuerdos | 16 | 5 |

Seleccionar la primera sala del orden aplicable que alcance y no tenga cita/bloqueo superpuesto. La accesibilidad es **prioridad con fallback**, no exclusión absoluta de las otras salas.

```text
Intervalos [inicio, fin):
cruce = inicio_existente < fin_solicitado && fin_existente > inicio_solicitado
```

10:00–11:00 y 11:00–12:00 son compatibles. Ocupan sala las citas en oficina con estado `confirmed` o `attended`; las externas nunca ocupan sala. Reagendar excluye la propia cita; `waiting`, `cancelled`, `deleted` no ocupan.

Sin sala: `409`, `conflict: true`, hasta cuatro horarios del mismo día ordenados por cercanía a la hora solicitada; desempate por hora ascendente. No ofrece horas pasadas del día actual. Con `waiting: true` guarda espera si no hay sala; si existe disponibilidad, confirma incluso con ese campo activado.

### Atención fuera de la oficina

Checkbox «Fuera de la oficina» en crear/editar cita. La API guarda `outsideOffice: true`, `room: null`, `status: confirmed`, aun con todas las salas ocupadas/bloqueadas o con más de 16 personas. Mantiene fecha, hora, duración, personas, operaciones, integrante y folio. Se conservan horario 08:00–17:30, duración válida, permisos y demás validaciones.

- No solicita alternativas de sala ni lista de espera. Una espera convertida en externa pasa a confirmada.
- Al convertir oficina → externa, libera la sala en la misma transacción. Al convertir externa → oficina, vuelve a validar capacidad, bloqueos y disponibilidad; ante conflicto, no modifica la cita hasta resolverlo o pedir espera.
- Un booleano omitido en una cita antigua significa oficina. En una edición con campo omitido conserva el valor existente. No requiere migración SQL: el dato está en JSON de `records`.
- Incluida en agenda, totales, personas atendidas, promedio, ranking de operaciones y actividad por integrante. Excluida del número de salas ocupadas y de los conteos, horas y denominadores de uso por sala.
- Agenda muestra «Fuera de la oficina» y filtro propio. Vista CEO conserva cinco salas y agrega una sección de atenciones externas, también imprimible.
- PDF identifica el lugar; CSV/XLSX agregan columna explícita «Fuera de la oficina» en Citas y Operaciones por cita. Auditoría conserva el campo y los cambios antes/después.

El módulo de resumen de operaciones del PR #1 debe seguir recibiendo `data.bookings` completo, no `roomActive`/`roomBookings`: su cálculo por estado y operaciones incluye las citas externas. Al integrar su parche de presentación, conservar `outsideOffice`, `bookingLocation`, el filtro externo y la sección externa de CEO; no reemplazar la página por una referencia anterior. La forma de contar salas es independiente del resumen de operaciones.

### 3.3 Estados y folios

```text
crear fuera de oficina ── sin sala ──> confirmed
crear en oficina ── con sala ──> confirmed ── llegada de la hora ──> attended
   └── sin sala ──> waiting ── retry disponible ──> confirmed
confirmed / waiting ── motivo ──> cancelled
confirmed / waiting / cancelled ── Admin/CEO + motivo ──> deleted
```

`attended` es terminal en la API actual. Espera requiere acción explícita «Intentar asignar»; cancelar no dispara asignación automática. No se reabren estados terminales.

Folio visible `C-000001`, secuencia `max(folio)+1` protegida por transacción/revisión. Reagendar conserva folio y creador. Eliminar una cita es lógico: conserva fila e historial. No borrar filas manualmente.

### 3.4 Equipos, roles y credenciales

Setup crea CEO en Dirección y el equipo Equipo 16. Admin/CEO puede crear equipos y hasta 30 usuarios por lote: `LDF, JATC, XAPT`, separados por coma, punto y coma o salto de línea. Normalización a mayúsculas, patrón `[A-Z0-9._-]{2,30}`. Cada cuenta tiene contraseña temporal individual y cambio obligatorio inicial.

Staff lee la agenda completa, pero modifica solo citas de su equipo y selecciona integrantes del propio equipo. **No existe aislamiento de lectura entre equipos.** Admin y CEO tienen el mismo alcance elevado actual. No se puede desactivar/cambiar el propio rol ni quitar al último CEO activo.

### 3.5 Métricas, PDF y exportación

| Indicador | Definición actual |
| --- | --- |
| Periodo | 7 o 30 días civiles incluyendo hoy; todo el historial hasta hoy |
| Citas totales | Confirmadas + atendidas; excluye espera/cancelación/eliminación |
| Personas atendidas | Suma de `people` atendidas, en oficina y fuera; incluye personal y visitas repetidas |
| Promedio | Personas / citas atendidas; cero si no hay atenciones |
| Ranking | Frecuencia por operación en citas atendidas; incluye ceros |
| Uso por sala | Solo citas confirmadas/atendidas en salas de oficina; externas excluidas también del denominador |
| Por integrante | Persona que atiende (`attendee`), no necesariamente quien capturó |

Exportación Admin/CEO de todo el historial, incluyendo futuro, cancelaciones y eliminaciones, independientemente del filtro de métricas. XLSX: Citas, Operaciones por cita, Auditoría, Catálogo, Bloqueos vigentes. CSV: esas secciones concatenadas, BOM UTF-8 y protección de fórmulas; no es una tabla única normalizada.

El PDF usa HTML y diálogo de impresión del navegador. Requiere permitir emergentes y elegir Guardar como PDF. No se almacena PDF en el servidor. La auditoría registra intención de imprimir/exportar, no prueba de que se imprimió o guardó.

## 4. Persistencia, concurrencia y auditoría

| Tabla | Contenido |
| --- | --- |
| `records(id,kind,data)` | JSON: `booking`, `block`, `team`, `operation`, `settings` |
| `users` | ID, username único, nombre, equipo, rol, hash, activo y cambio obligatorio |
| `sessions` | Digest SHA-256 del token, usuario, vencimiento Unix en milisegundos |
| `audit` | ID, UTC ISO, actor, acción, entidad, JSON antes/después |
| `revision` | Revisión global para control optimista |
| `guard` | Restricción `valid_mutation` para detectar escritura obsoleta |
| `attempts` | Intentos de login por hash del nombre de usuario |
| `_local_migrations` | Nombre, SHA-256 y fecha de migración |

Pragmas: `journal_mode=WAL`, `synchronous=FULL`, `busy_timeout=10000`, `foreign_keys=ON`. No todas las referencias JSON tienen FK: se validan en aplicación. Las citas guardan snapshots de nombres/equipos/operaciones que no cambian retroactivamente al editar catálogos.

Migraciones automáticas en transacción con verificación de checksum. Nunca editar SQL ya aplicado ni silenciar el checksum: agregar migración nueva, revisar y ensayar sobre una copia. `npm run db:generate` genera, no sustituye la revisión del SQL.

Flujo de escritura: snapshot con revisión → validación → `BEGIN IMMEDIATE` → comprobar `guard` → modificar + auditar + incrementar revisión → commit; ante falla, rollback completo. Hasta ocho intentos ante revisión obsoleta. La edición de cita también exige `expectedUpdatedAt`; `status`/`retry` revalidan estado pero no usan ese campo. No configurar clúster de procesos web.

Auditoría de setup, accesos/fallos, logout, citas/estados, bloqueos, equipos, usuarios, contraseñas, catálogo, ajustes, impresión/exportación. No incluye cada lectura/clic/validación rechazada; no tiene sellado criptográfico frente a un administrador de SQLite. Nunca registrar hashes/contraseñas/tokens. Restauración usa actor `SERVIDOR`; anotar el operador en la bitácora de mantenimiento.

## 5. Contrato HTTP

| Endpoint | Comportamiento |
| --- | --- |
| `GET /api/health` | Público: `200 {"status":"ok"}` o `503 {"status":"unavailable"}` |
| `GET /api/desk` | `setup:true` sin cuentas; `401` sin sesión; snapshot autenticado |
| `GET /api/desk?audit=1` | Auditoría, Admin/CEO |
| `GET /api/desk?export=1` | Snapshot consistente con auditoría, Admin/CEO |
| `POST /api/desk` | JSON discriminado por `action`, cookie `desk_session` |

`health` abre SQLite y ejecuta `SELECT 1`: puede inicializar una base vacía si la ruta es errónea. Un `200` no acredita que sea la base correcta o que todo el archivo sea íntegro.

| Acción | Campos específicos principales | Permiso |
| --- | --- | --- |
| `setup` | `setupCode, username, name, password` | Base sin usuarios + código local |
| `login` / `logout` | Credenciales / ninguno | Público / autenticado |
| `password` | `current, password` | Usuario actual |
| `booking` | `id?, expectedUpdatedAt?, client, attendee, date, time, duration, people, accessibility, outsideOffice?, operationIds, notes?, waiting?` | Propio equipo o elevado |
| `status` | `id, status, reason?` | Propio equipo; `deleted` solo elevado |
| `retry` | `id` | Espera del equipo o elevado |
| `block` | `room,date,start,end,reason` | Admin/CEO |
| `unblock` | `id` | Admin/CEO |
| `team` | `id?,name` | Admin/CEO |
| `users` | `team,names` | Admin/CEO; devuelve `credentials` una vez |
| `user` | `id,name,team,role,active` | Admin/CEO |
| `resetPassword` | `id` | Admin/CEO; revoca sesiones |
| `operation` | `id?,name,matter,active` | Admin/CEO |
| `settings` | `name,open,close,duration` | Admin/CEO; duración inicial 15/30/45/60/90/120 |
| `print` / `export` | `entity,format` | Autenticado / Admin/CEO |

Ejemplo: fecha e ID ilustrativos; usar valores futuros/IDs del snapshot real.

```json
{"action":"booking","client":"Cliente de ejemplo","attendee":"UUID-USUARIO","date":"2027-01-12","time":"10:00","duration":60,"people":5,"accessibility":false,"operationIds":["op-3-1"],"notes":"","waiting":false}
```

El servidor calcula sala; no aceptar un override del cliente. Conflicto:

```json
{"conflict":true,"error":"No hay sala disponible para ese horario.","alternatives":[{"time":"11:00","room":"barra","name":"Sala Barra"}]}
```

`409` también significa edición obsoleta, estado incompatible o error de persistencia: inspeccionar cuerpo. Otros códigos: 400 validación, 401 sesión, 403 permisos/origen, 404 ausente, 413 tamaño, 415 formato, 429 intentos, 503 lectura. Cuerpo limitado a 60.000 caracteres después de leerlo; no es una API pública versionada.

Autenticación: PBKDF2-SHA256 con sal individual, 600.000 iteraciones nuevas; verifica hashes heredados entre 100.000 y 1.000.000, sin rehash automático. Claves de 12–200 caracteres. Token aleatorio de 32 bytes, sesiones de 8 horas. Cookie `HttpOnly`, `SameSite=Strict`, `Path=/`, `Secure` cuando `APP_ORIGIN` es HTTPS. Ocho fallos de login activan bloqueo temporal por usuario según `attempts`.

POST con `Origin` debe coincidir con `APP_ORIGIN`; la ausencia de `Origin` no se rechaza por ese control. Mantener autenticación/roles. Usuarios con contraseña temporal no reciben la agenda hasta cambiarla.

## 6. Instalación nativa

### 6.1 Requisitos y estructura

Registrar Windows/edición/arquitectura reales y comprobar soporte de Node 24. Instalar Node 24 para todos los usuarios. Ejemplos: `C:\Program Files\nodejs\node.exe`, PowerShell con módulo `ScheduledTasks`, Git o ZIP aprobado. Medir disco/memoria; no hay benchmark de capacidad establecido. Usar sesión elevada para ACL, firewall y tareas, no para el proceso de la agenda.

```text
C:\AgendaDespacho\
  app\          checkout, .env, node_modules, .next
  data\         agenda.sqlite, WAL/SHM, .setup-code
  backups\      respaldos consistentes
  logs\         logs de procesos/tareas
  ops\          scripts Windows de este procedimiento
```

Estas rutas e IP son propuestas, no configuración comprobada del despacho. Mantener consistencia si se cambian. Datos fuera del checkout permiten reemplazar código sin reemplazar la base.

### 6.2 Descargar y compilar

En PowerShell, por etapas; detenerse ante error:

```powershell
$AgendaRoot = 'C:\AgendaDespacho'
$AgendaApp = Join-Path $AgendaRoot 'app'
New-Item -ItemType Directory -Force -Path $AgendaRoot | Out-Null
git clone https://github.com/jatovarv/agenda-despacho.git $AgendaApp
if ($LASTEXITCODE -ne 0) { throw 'Falló la descarga.' }
Set-Location $AgendaApp
git rev-parse HEAD  # Registrar commit instalado.
node --version     # v24.x
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Falló npm ci.' }
npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Falló TypeScript.' }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Falló build.' }
node scripts/package-release.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló empaquetado standalone.' }
```

`npm.cmd` evita seleccionar `npm.ps1` bajo políticas restrictivas. `package-release.mjs` no crea instalador: copia estáticos, `public`, migraciones/scripts a `.next/standalone`. Omitirlo puede dejar la interfaz sin recursos. No utilizar `npm run dev` como servicio productivo.

### 6.3 Configuración persistente

```powershell
Set-Location 'C:\AgendaDespacho\app'
foreach ($AgendaDir in @('data','backups','logs','ops')) {
    New-Item -ItemType Directory -Force -Path "C:\AgendaDespacho\$AgendaDir" | Out-Null
}
if (Test-Path '.env') { throw 'Conservar y revisar el .env existente.' }
$AgendaEnvironment = @'
APP_ORIGIN=http://192.168.1.20:3000
PORT=3000
DATA_DIR=C:/AgendaDespacho/data
BACKUP_DIR=C:/AgendaDespacho/backups
MIGRATIONS_DIR=C:/AgendaDespacho/app/drizzle
NEXT_TELEMETRY_DISABLED=1
'@
[IO.File]::WriteAllText((Join-Path (Get-Location) '.env'),
    $AgendaEnvironment, [Text.UTF8Encoding]::new($false))
```

| Variable | Comportamiento real |
| --- | --- |
| `APP_ORIGIN` | Obligatoria, URL canónica sin ruta ni barra final |
| `PORT` | Predeterminado 3000 |
| `DATA_DIR` | Carpeta SQLite; predeterminado `./data` relativo al directorio de trabajo |
| `BACKUP_DIR` | Destino de backup; predeterminado `./backups` |
| `MIGRATIONS_DIR` | Migraciones; predeterminado `./drizzle` |
| `NODE_ENV` | Inicio fuerza `production` |
| `NEXT_TELEMETRY_DISABLED` | Inicio deshabilita telemetría |
| `BIND_ADDRESS` | Solo Docker; **no tiene efecto en inicio nativo** |
| `HOSTNAME` | Inicio nativo fuerza `0.0.0.0`; `.env` no lo limita |

Variables heredadas pueden prevalecer sobre `.env`: no dejar parámetros de pruebas en el entorno de producción. `start`, `backup` y `setup-code` cargan `.env`; **restore no lo carga por sí mismo**. Usar `node --env-file=.env` al restaurar.

### 6.4 Primer arranque y red

```powershell
Set-Location 'C:\AgendaDespacho\app'
npm.cmd start
```

En otra consola, manteniendo abierto el servidor:

```powershell
Invoke-RestMethod 'http://127.0.0.1:3000/api/health'
Set-Location 'C:\AgendaDespacho\app'
node scripts/setup-code.mjs
```

Base nueva: ingresar por `APP_ORIGIN`, usar código local y crear CEO. El código está en `DATA_DIR/.setup-code`; no subirlo a GitHub ni adjuntarlo en soporte. Si habrá migración de Sites, **importar primero: no crear una cuenta nueva ni mezclar datos de pruebas**.

Para diagnóstico LAN, TI puede abrir el puerto a la subred correspondiente:

```powershell
New-NetFirewallRule -DisplayName 'Agenda despacho - LAN 3000' `
    -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 `
    -Profile Domain,Private -RemoteAddress LocalSubnet
```

Adaptar subred/perfiles reales. No hacer NAT público del puerto. Para operar con datos reales, HTTPS con certificado confiable mediante el proxy que administre TI; `APP_ORIGIN` debe ser la URL externa. Si hay proxy, restringir el backend al proxy según topología. No confundir HTTP de diagnóstico con TLS implementado. Dar a todos la misma URL, incluido el navegador del servidor.

## 7. Inicio automático sin Docker

Las siguientes son **plantillas a guardar y validar**, no archivos que ya existan en `ops`. La tarea arranca con Windows sin depender de login interactivo. Aplicar la política de firma/ejecución de scripts de TI; no deshabilitar globalmente PowerShell.

### 7.1 Cuenta y permisos

Identidad local `LOCAL SERVICE`, SID `S-1-5-19`, sin contraseña almacenada ni privilegios de administrador. La copia externa que requiera credenciales debe usar la identidad administrada por TI; no asumir que LOCAL SERVICE puede escribir a una ruta SMB.

En una instalación nueva, desde PowerShell elevado:

```powershell
icacls 'C:\AgendaDespacho' /inheritance:r /grant:r `
    '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-19:(OI)(CI)RX'
if ($LASTEXITCODE -ne 0) { throw 'Fallaron permisos base.' }
foreach ($AgendaWritable in @('data','backups','logs','app\.next')) {
    icacls "C:\AgendaDespacho\$AgendaWritable" /grant '*S-1-5-19:(OI)(CI)M'
    if ($LASTEXITCODE -ne 0) { throw "Falló permiso: $AgendaWritable" }
}
```

Revisar permisos explícitos preexistentes: esto no sanea recursivamente ACL arbitrarias. Los modos POSIX 0600/0700 del código no sustituyen ACL Windows. Desplegar como administrador; el proceso lee código/ops/.env y modifica solo datos, logs, backups y caché Next. Tras cada reemplazo de código, revisar permisos de `.next`.

### 7.2 Lanzador

Guardar `C:\AgendaDespacho\ops\Start-Agenda.ps1`:

```powershell
$ErrorActionPreference = 'Stop'
$AgendaLog = 'C:\AgendaDespacho\logs\server-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
try {
    Set-Location 'C:\AgendaDespacho\app'
    & 'C:\Program Files\nodejs\node.exe' 'scripts/start.mjs' `
        1>> "$AgendaLog.out.log" 2>> "$AgendaLog.err.log"
    $AgendaExit = $LASTEXITCODE
    if ($AgendaExit -eq 0) { exit 1 } # Servidor finalizado inesperadamente.
    exit $AgendaExit
} catch {
    $_ | Out-String | Add-Content "$AgendaLog.err.log"
    exit 1
}
```

Logs separados por arranque, no por cada medianoche. Definir retención y vigilar tamaño. No registrar contraseñas o cuerpos completos de peticiones.

### 7.3 Registro

Detener con Ctrl+C el servidor manual. En consola elevada:

```powershell
$AgendaAction = New-ScheduledTaskAction `
    -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
    -Argument '-NoProfile -NonInteractive -File "C:\AgendaDespacho\ops\Start-Agenda.ps1"' `
    -WorkingDirectory 'C:\AgendaDespacho\app'
$AgendaPrincipal = New-ScheduledTaskPrincipal -UserId 'S-1-5-19' `
    -LogonType ServiceAccount -RunLevel Limited
$AgendaSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
    -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'AgendaDespacho' -Action $AgendaAction `
    -Principal $AgendaPrincipal -Trigger (New-ScheduledTaskTrigger -AtStartup) `
    -Settings $AgendaSettings
Start-ScheduledTask -TaskName 'AgendaDespacho'
```

Si existe una tarea homónima, inspeccionarla antes de actualizar; no usar reemplazo forzoso indiscriminado. Límite cero evita terminación por duración predeterminada. `IgnoreNew` evita duplicados desde esa tarea, no otros Node manuales. Diez reintentos no son supervisión infinita; un proceso colgado requiere detección adicional por health check.

```powershell
Get-ScheduledTask -TaskName 'AgendaDespacho'
Get-ScheduledTaskInfo -TaskName 'AgendaDespacho'
Get-NetTCPConnection -LocalPort 3000 -State Listen
Invoke-RestMethod 'http://127.0.0.1:3000/api/health'
```

Control de mantenimiento: `Disable-ScheduledTask`, `Stop-ScheduledTask`, verificar que terminó su Node hijo, intervenir, `Enable-ScheduledTask`, `Start-ScheduledTask`. Identificar PID/línea de comandos si queda un proceso; no terminar todos los Node de la PC. Running no prueba salud. Validar tras reiniciar Windows, **sin iniciar sesión**, desde otra PC.

## 8. Backups y restauración

### 8.1 Respaldo consistente y periódico

```powershell
Set-Location 'C:\AgendaDespacho\app'
if (!(Test-Path 'C:\AgendaDespacho\data\agenda.sqlite')) {
    throw 'No existe la base esperada; revisar DATA_DIR.'
}
node scripts/backup.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló el respaldo.' }
```

Utiliza backup SQLite y `PRAGMA integrity_check` sobre resultado; puede ejecutarse con servidor activo. No sobrescribe archivos existentes. El script abre/aplica migraciones del código actual: respaldar **con la versión anterior antes de actualizar**.

No copiar solamente `agenda.sqlite` abierto: WAL puede contener cambios. Excel/CSV no contienen el respaldo completo de usuarios/configuración. Conservar `.env`, commit, Node y configuración de tareas en almacenamiento protegido fuera de Git.

Guardar `C:\AgendaDespacho\ops\Backup-Agenda.ps1`:

```powershell
$ErrorActionPreference = 'Stop'
$AgendaLog = 'C:\AgendaDespacho\logs\backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
try {
    Set-Location 'C:\AgendaDespacho\app'
    if (!(Test-Path 'C:\AgendaDespacho\data\agenda.sqlite')) { throw 'Base ausente.' }
    & 'C:\Program Files\nodejs\node.exe' 'scripts/backup.mjs' `
        1>> "$AgendaLog.out.log" 2>> "$AgendaLog.err.log"
    exit $LASTEXITCODE
} catch {
    $_ | Out-String | Add-Content "$AgendaLog.err.log"
    exit 1
}
```

Probarlo y registrar:

```powershell
$AgendaBackupAction = New-ScheduledTaskAction `
    -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
    -Argument '-NoProfile -NonInteractive -File "C:\AgendaDespacho\ops\Backup-Agenda.ps1"' `
    -WorkingDirectory 'C:\AgendaDespacho\app'
$AgendaBackupSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'AgendaDespacho-Backup' `
    -Action $AgendaBackupAction `
    -Principal (New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount) `
    -Trigger (New-ScheduledTaskTrigger -Daily -At '18:00') -Settings $AgendaBackupSettings
Start-ScheduledTask -TaskName 'AgendaDespacho-Backup'
```

Horario de la tarea según reloj Windows: comprobar correspondencia con CDMX. Verificar `LastTaskResult=0`, log y archivo. Esta plantilla **no configura copia externa, retención ni alertas**: integrarlas con el mecanismo del despacho y ensayar recuperación.

Objetivo operativo propuesto: copia diaria, mínimo 30 copias diarias y segunda ubicación fuera de la PC. Confirmar espacio/política; no borrar backups sin copia externa verificada. Un backup diario puede perder hasta un día de movimientos: aumentar frecuencia si es inaceptable. Medir tiempo de recuperación, no prometerlo sin ensayo.

### 8.2 Restaurar

1. Registrar operador, motivo, fecha/versión del backup.
2. Deshabilitar/detener tareas de servidor y backup; verificar que no queda proceso ni herramienta SQLite usando la base.
3. Conservar backup previo con el código vigente. Si no abre, copiar todo el directorio detenido con sus archivos para preservar evidencia.
4. Ejecutar sobre archivo compatible:

```powershell
Set-Location 'C:\AgendaDespacho\app'
$AgendaRestoreFile = 'C:\AgendaDespacho\backups\agenda-FECHA-VERIFICADA.sqlite'
if (!(Test-Path $AgendaRestoreFile)) { throw 'Seleccionar respaldo real.' }
node --env-file=.env scripts/restore.mjs $AgendaRestoreFile
if ($LASTEXITCODE -ne 0) { throw 'Falló restauración; no habilitar servidor.' }
```

Sin `--env-file=.env`, el script podría restaurar `./data` en vez del destino externo. Verifica integridad/tablas, elimina sesiones, inserta `RESTAURAR RESPALDO`, hace checkpoint y sustituye la base. **No detiene procesos ni guarda automáticamente la base previa.** Probar sustitución de archivo y ACL en Windows.

Validar citas/folios/usuarios/auditoría, iniciar una instancia y reactivar backup. Todos vuelven a autenticarse. No restaurar esquema más nuevo en código anterior sin analizar compatibilidad.

## 9. Actualización y reversión

No hay autoactualización desde GitHub.

1. Preparar commit aprobado en otra carpeta, `npm ci`, compilar y probar con datos aislados.
2. Ventana de mantenimiento, detener capturas/servidor/backup y comprobar procesos.
3. Backup con **código anterior**, guardar código/configuración/base como conjunto de reversión.
4. Sustituir `app` con versión preparada; conservar `.env` y directorios externos persistentes.
5. Revisar ACL y recursos standalone. Iniciar una instancia, aplicar migraciones, verificar health/login/operación.
6. Reactivar backups, registrar commit/resultados y abrir captura al personal.

No compilar sobre un servidor atendiendo, ni utilizar limpiezas indiscriminadas o `git reset --hard` como método de despliegue. Revisar cambios locales.

Rollback: detener, recuperar código/configuración y, si cambió esquema, backup compatible. Si hubo nuevas capturas tras actualización, preservarlas y conciliarlas: restaurar el backup las perdería. Volver al código anterior no deshace migraciones.

## 10. Migración desde Sites: trabajo pendiente

El repositorio no trae ni sincroniza datos del sitio anterior. No existe importador D1 listo. Desarrollar y ensayar:

1. Exportación completa, autorizada y consistente; congelar capturas durante el corte final.
2. Inventariar esquema/conteos/relaciones JSON: `records`, `users`, `audit`, `revision` y auxiliares.
3. Crear SQLite temporal con migraciones locales. Un volcado D1 sin `_local_migrations` no es un backup compatible con `restore.mjs`.
4. Importar transaccionalmente, columnas explícitas, conservando UUID, folios, snapshots, hashes, estados, fechas, equipos/roles y auditoría; resolver diferencias de esquema.
5. Revocar sesiones; vaciar `sessions`, `attempts`, `guard`. Asegurar fila de revisión, secuencia de auditoría posterior al máximo importado y registro local de migraciones válido. No ejecutar setup si se importan usuarios.
6. Conciliar conteos por fecha/estado/equipo, máximos/duplicados de folio, usuarios, referencias y muestras. Verificar integridad SQLite.
7. Probar login de hashes heredados. PBKDF2 de 100.000 iteraciones se acepta; otros formatos requieren adaptación/restablecimiento controlado.
8. Ensayo aislado, corte definitivo, respaldo de origen y destino, validación operativa y entrega de URL única.

No permitir escrituras en dos instalaciones sin conciliación. Definir responsable de validación y fuente de verdad; conservar origen para reversión. Publicar documentación no autoriza eliminar la instalación anterior.

## 11. Verificación y aceptación

### 11.1 Pruebas del repositorio

```powershell
npm.cmd run typecheck
node tests/local-database.mjs
node tests/outside-office.mjs
npm.cmd run build
node scripts/package-release.mjs
```

Comprobar `$LASTEXITCODE` en cada paso. `local-database.mjs` usa temporal y cubre migraciones, rollback, persistencia, backup/restauración. `tests/exports.mjs` escribe `/private/tmp/...`: **hacerlo portable con `os.tmpdir()` antes de incluirlo en validación Windows**. Eso no implica que la exportación del navegador falle en Windows.

La suite HTTP modifica datos. Localhost no basta para seguridad: usar base nueva/desconectada de producción.

Terminal A, desde código compilado:

```powershell
Set-Location 'C:\AgendaDespacho\app'
$env:DATA_DIR = Join-Path $env:TEMP ('agenda-qa-' + [guid]::NewGuid().ToString())
$env:APP_ORIGIN = 'http://127.0.0.1:3187'
$env:PORT = '3187'
$env:MIGRATIONS_DIR = Join-Path (Get-Location) 'drizzle'
Write-Host "Copiar esta ruta exacta a terminal B: $env:DATA_DIR"
node scripts/start.mjs
```

Terminal B:

```powershell
Set-Location 'C:\AgendaDespacho\app'
$env:DATA_DIR = 'C:\RUTA-TEMPORAL-MOSTRADA-EN-A'
if (!(Test-Path $env:DATA_DIR)) { throw 'Usar ruta de A.' }
$env:APP_ORIGIN = 'http://127.0.0.1:3187'
$env:DESK_TEST_URL = 'http://127.0.0.1:3187'
$env:MIGRATIONS_DIR = Join-Path (Get-Location) 'drizzle'
node tests/run-local-integration.mjs
if ($LASTEXITCODE -ne 0) { throw 'Fallaron pruebas HTTP.' }
```

El runner obtiene código inicial de la misma carpeta. `npm run test:integration` invoca suite directamente y no obtiene el código; usar runner para base nueva. Conservar salida/commit; detener servidor y cerrar consolas para no heredar variables de QA en producción.

### 11.2 Matriz de aceptación sobre la PC real

| Ensayo | Resultado requerido |
| --- | --- |
| Reiniciar Windows sin login | Tarea activa, health 200, otra PC accede |
| Caída controlada de solo la agenda | Reinicia proceso; revisar PID, logs y health |
| Doble inicio de tarea | Un servidor y un listener |
| Persistencia | Citas y auditoría conservadas tras reinicio |
| Setup | Código incorrecto rechazado; CEO válido; setup cerrado |
| Usuarios | Equipo 16/LDF/JATC/XAPT, claves individuales y cambio obligatorio |
| Permisos | Staff no bloquea, administra/exporta ni modifica otro equipo; lectura global verificada |
| Concurrencia | Seis citas simultáneas de 4 personas: cinco salas distintas y un conflicto |
| Accesibilidad | Barra ocupada: Anexo antes de Redonda para 5 personas |
| Fuera de oficina | Con cinco salas ocupadas se confirma sin sala; convertir libera/reasigna; métricas generales sí y uso de salas no |
| Capacidades | Grupo de 7 a Rectangular disponible; 17 nunca obtiene sala |
| Horario | 16:30 + 60 válido; 17:00 + 60 rechazado; intervalos contiguos válidos |
| Espera | Hasta 4 alternativas, cancelar libera, retry asigna |
| Reagendar | Folio estable; edición obsoleta 409; antes/después auditados |
| Bloqueos | Se excluyen al asignar y se rechaza choque con cita existente |
| Catálogo | Múltiples operaciones/chips; cambios no alteran snapshots previos |
| Métricas | Conciliadas con datos de prueba, periodos y ranking con ceros |
| PDF | Diálogo automático al registrar y botón posterior, datos correctos |
| Exportación | CSV abre en Excel; XLSX cinco hojas con auditoría/eliminaciones |
| CEO | Cinco columnas, bloqueos, impresión del día |
| Recuperación | Backup programado, copia externa, restauración aislada y sesiones revocadas |
| Sin Internet | Captura/consulta entre equipos LAN tras instalar |

Pruebas en macOS no sustituyen estos ensayos. Medir rendimiento con usuarios e historial representativos, acordar objetivos y documentar resultados; no prometer capacidad o latencia sin medir.

## 12. Diagnóstico y límites explícitos

| Síntoma | Revisar |
| --- | --- |
| Node/SQLite no disponible | Node 24 para todos y ruta absoluta de tarea |
| Recursos 404 | Build y `package-release.mjs` |
| Origen rechazado | URL del navegador = `APP_ORIGIN` |
| Tarea Running, servidor inaccesible | Logs, proceso hijo, política de scripts, ACL, health |
| `EADDRINUSE` | Proceso previo o puerto ocupado; identificar dueño |
| Base vacía inesperada | `DATA_DIR`, entorno heredado y working directory; no ejecutar setup |
| SQLite bloqueada | Otro proceso/herramienta, migración o disco compartido |
| Checksum de migración | Recuperar SQL original; no alterar checksum |
| Otra PC no entra | IP/DNS, firewall/perfil, proxy, suspensión |
| Cookie perdida | HTTPS real y URL canónica |
| Restauración en otra carpeta | `--env-file=.env` y `DATA_DIR` efectivo |
| No hay copia externa | Identidad/permisos del mecanismo de copia y verificación de transferencia |

Límites relevantes:

- API devuelve historial completo sin paginación; métricas en navegador, refresco de 30 s. Medir crecimiento.
- Salas/capacidades viven en código; no hay edición dinámica de salas en Admin.
- Zona CDMX está codificada en helpers; `settings.timezone` no habilita multizona.
- Bloqueo rechaza fechas pasadas, pero no un inicio pasado dentro del día actual; agregar validación si se exige.
- Accesibilidad es preferencia; personas incluye personal; no representa clientes únicos.
- Auditoría no es inmutable ante acceso al archivo y export/print no confirma entrega efectiva.
- Sin recordatorios, importador Excel, importador D1 ni sincronización entre instalaciones.
- Inicio nativo fuerza `0.0.0.0`; un bind configurable exige cambiar y probar `start.mjs`.
- Este README no configura por sí mismo TLS, tareas, copia externa, retención o supervisión de salud.

## 13. Definición de entrega completa

Entregar: commit y versiones; PC/URL identificadas; una instancia nativa; configuración/rutas protegidas; tareas probadas tras reinicio; usuarios/equipos; backups y copia externa con ensayo de restauración; matriz de aceptación; migración conciliada si aplica; procedimiento de actualización/reversión y responsable de mantenimiento.

Las contraseñas se entregan por canal apropiado, nunca en README, commits o logs. Un ZIP o una pantalla abierta no acreditan instalación operativa. Priorizar estos resultados sobre cambios cosméticos o infraestructura adicional.

## Referencias oficiales

- [Next.js: servidor propio](https://nextjs.org/docs/app/guides/self-hosting) y [standalone](https://nextjs.org/docs/app/api-reference/config/next-config-js/output).
- [Node.js: SQLite/backup](https://nodejs.org/api/sqlite.html); consultar documentación de la rama 24 instalada, pues el enlace general puede mostrar una versión posterior.
- [Microsoft: identidad de tareas](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtaskprincipal), [acción y directorio](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtaskaction), [recuperación y límites](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtasksettingsset).
