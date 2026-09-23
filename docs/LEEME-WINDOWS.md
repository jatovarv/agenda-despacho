# Agenda del despacho · Windows con Docker

Esta versión se instala en tu propio servidor. Las citas, usuarios, contraseñas y auditoría se almacenan en una base SQLite del servidor. El personal entra con sus cuentas del despacho; no necesita cuentas de ChatGPT ni Sites.

## Instalación

1. Descomprime el paquete en una carpeta fija, por ejemplo `C:\AgendaDespacho`.
2. Inicia Docker. Este paquete utiliza **contenedores Linux**. El instalador verifica el tipo de motor antes de hacer cambios.
3. Ejecuta `Iniciar-Windows.cmd`. También puedes abrir PowerShell en la carpeta y ejecutar:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\Instalar-Windows.ps1
   ```

4. Cuando el instalador lo pida, escribe la IP fija o el nombre del servidor en la red del despacho. Por ejemplo: `192.168.1.20`. Si dejas el campo vacío, se instalará para probar únicamente desde `localhost`.
5. La instalación mostrará la dirección de acceso y un **código de instalación**. Abre esa dirección y crea tu cuenta de Dirección usando ese código. El código no es la contraseña de tu cuenta y solo sirve antes de crear el primer usuario.
6. En Administración → Equipos y usuarios, crea los equipos y pega los usuarios de cada uno, por ejemplo `LDF, JATC, XAPT`. Se generan contraseñas temporales individuales que deben cambiar al ingresar.

También puedes indicar la dirección de una vez:

```powershell
.\Instalar-Windows.ps1 -Direccion 192.168.1.20 -Puerto 3000
```

Todos deben abrir **la misma dirección configurada**, por ejemplo `http://192.168.1.20:3000`. El ejemplo no es la IP real de tu servidor.

La instalación inicial necesita Internet para descargar la imagen de Node y las dependencias. Una vez creada la imagen, el funcionamiento diario utiliza el servidor y la red local; no llama a servicios de OpenAI o Cloudflare.

## Qué versión de Windows se necesita

- Si es un equipo con Windows 10/11 y Docker Desktop, debe estar seleccionado el motor de contenedores Linux.
- Si es Windows Server con un motor de contenedores Windows, este Dockerfile no se ejecuta directamente en ese motor. El administrador debe proporcionar un motor Linux en una máquina virtual del servidor o utilizar la instalación nativa de Node descrita abajo.
- Docker Desktop no está soportado en Windows Server. El instalador no instala Docker ni cambia la configuración del sistema.

Referencia: [Docker para Windows](https://docs.docker.com/desktop/setup/install/windows-install/).

## Configuración y acceso en la red

El instalador crea `.env` y lo conserva al ejecutarse nuevamente. Ejemplo:

```dotenv
APP_ORIGIN=http://192.168.1.20:3000
PORT=3000
BIND_ADDRESS=0.0.0.0
NEXT_TELEMETRY_DISABLED=1
```

Después de cambiar `.env`, ejecuta:

```powershell
docker compose up -d
```

`APP_ORIGIN` es la dirección exacta que utilizarán los navegadores, sin barra final. Al poner la IP local, el puerto se publica en las interfaces del servidor. Para limitarlo a una sola interfaz, usa esa IP como `BIND_ADDRESS`.

Si el servidor funciona pero otro equipo no puede abrirlo, el administrador debe permitir el puerto TCP configurado en el Firewall de Windows para la red interna correspondiente. El instalador no modifica el firewall automáticamente.

El ejemplo HTTP está pensado para probar en la red interna. Para la operación con contraseñas y datos de clientes, coloca la aplicación detrás del HTTPS administrado por el despacho: configura `APP_ORIGIN=https://agenda.tudominio` y dirige el proxy al puerto local de la aplicación. No es necesario cambiar el código. La cookie de sesión se marca `Secure` cuando la dirección configurada utiliza HTTPS.

## Datos y respaldos

La base se guarda en el volumen Docker `agenda-despacho_agenda-data`, dentro de `/app/data/agenda.sqlite`. Los respaldos consistentes se generan en el volumen `agenda-despacho_agenda-backups` y se copian a una carpeta de Windows:

```powershell
.\Respaldar-Windows.ps1
# O en una ubicación de respaldo del despacho:
.\Respaldar-Windows.ps1 -Destino 'D:\Respaldos\Agenda'
```

No basta con copiar un archivo SQLite abierto: estos scripts usan el mecanismo de respaldo de SQLite y verifican su integridad. El respaldo incluye usuarios y hashes de contraseñas, citas, catálogo, configuraciones y auditoría. Guarda esa carpeta con los permisos de respaldo del despacho.

Para restaurar un respaldo:

```powershell
.\Restaurar-Windows.ps1 -Archivo 'D:\Respaldos\Agenda\agenda-FECHA.sqlite'
```

El script solicita escribir `RESTAURAR`, crea un respaldo previo, detiene la aplicación, valida y restaura la copia, y vuelve a iniciarla. Las sesiones anteriores se revocan. Los usuarios conservan las contraseñas vigentes en el momento del respaldo. La restauración queda registrada en la auditoría restaurada; las operaciones posteriores a la fecha del respaldo solo permanecerán en el respaldo previo.

## Operación cotidiana

```powershell
docker compose ps             # Estado del servicio
docker compose logs --tail 50 # Diagnóstico
docker compose stop          # Detener sin borrar datos
docker compose up -d         # Iniciar de nuevo
docker compose restart       # Reiniciar
```

Para volver a ver el código de primera instalación:

```powershell
docker compose exec agenda node scripts/setup-code.mjs
```

Si ya existe una cuenta de Dirección, ese comando solo lo informa y no crea otra cuenta.

Para actualizar: realiza un respaldo, sustituye los archivos de código, conserva `.env` y ejecuta `docker compose up -d --build --wait`. Las migraciones pendientes se aplican al iniciar. No uses `docker compose down -v`: ese comando borra los volúmenes y sus datos.

La opción `restart: unless-stopped` reinicia la aplicación cuando el motor Docker vuelve a arrancar. Configura el inicio automático del motor Docker en el servidor según su versión de Windows; el instalador no modifica servicios del sistema.

## Alternativa nativa para Windows Server

Si no hay motor Docker Linux, el administrador puede instalar **Node.js 24** directamente en Windows y ejecutar desde la carpeta del proyecto:

```powershell
Copy-Item .env.example .env
# Editar APP_ORIGIN en .env con la dirección elegida.
npm ci
npm run build
node scripts/package-release.mjs
npm start
```

La base nativa se almacena en la carpeta `data` del proyecto. Para el código inicial: `node scripts/setup-code.mjs`. Para respaldar: `npm run backup`. Configura la aplicación como servicio de Windows con el gestor de servicios que use el despacho, conservando su directorio de trabajo. Mantén una sola instancia del servicio.

## Verificaciones realizadas

- Compilación de producción de Next.js y comprobación de TypeScript.
- Aplicación standalone ejecutada con SQLite local, sin servicios de Sites o Cloudflare.
- 34 comprobaciones HTTP: acceso, código inicial, reservas simultáneas, capacidades, accesibilidad, espera, bloqueos, roles, auditoría, exportación y horarios.
- Migraciones automáticas, rollback ante errores, persistencia entre procesos e integridad de respaldos SQLite.
- Generación de Excel y CSV y escapado de contenido en las confirmaciones.

El paquete no contiene cuentas de prueba ni una base precargada. Las pruebas se realizaron en macOS con Node 24. En esta computadora no hay motor Docker ni PowerShell: la construcción del contenedor y la ejecución del instalador de Windows deben verificarse en el servidor de destino.
