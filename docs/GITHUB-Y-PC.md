# Dónde está la agenda y cómo ejecutarla en la PC

Verificado el 22 de septiembre de 2026.

## Decisión de implementación

El código y su historial se guardan en un repositorio privado de GitHub. La aplicación y su base de datos se ejecutan en una PC del despacho. Los demás equipos acceden por navegador a la dirección de esa PC. No es necesario instalar la aplicación en cada equipo ni tener cuentas de GitHub para reservar.

```text
GitHub privado: código, documentación e historial de cambios
             | descargar o actualizar el código
             v
PC del despacho: aplicación Node.js + base SQLite + respaldos
             ^
             | red interna / navegador
             |
Personal del despacho: usuarios y contraseñas individuales
```

GitHub no será la base de datos de clientes ni el servidor que atiende reservas. GitHub Pages sirve contenido estático y no ejecuta este servidor de Node.js con su base SQLite.

## Ubicación del código

El proyecto local en la Mac está en:

`/Users/jaimealbertotovarvillegas/Documents/agenda-despacho`

La versión actual utiliza React, Next.js, TypeScript, Node.js 24 y SQLite. Tiene un historial Git local. La versión anterior para Sites se conserva en commits históricos; la rama actual utiliza el servidor propio.

| Archivo | Función |
| --- | --- |
| `app/page.tsx` | Pantallas, formularios, agenda, métricas y administración. |
| `app/globals.css` | Diseño y presentación. |
| `app/api/desk/route.ts` | Validación, permisos, reservas, usuarios, operaciones y auditoría. |
| `lib/catalog.ts` | Cinco salas, capacidades, catálogo inicial de 44 operaciones y algoritmo de asignación. |
| `lib/auth.ts` | Hashes de contraseñas y verificación de acceso. |
| `db/sqlite.mjs` | Apertura de la base local, migraciones, código de primera instalación y respaldo. |
| `db/raw.ts` | Consultas y transacciones de la aplicación. |
| `db/schema.ts` y `drizzle/` | Estructura e historial de cambios de la base. |
| `lib/export.ts` | Excel, CSV y confirmaciones de impresión/PDF. |
| `compose.yaml` y `Dockerfile` | Ejecución de la aplicación con Docker. |
| `Instalar-Windows.ps1` | Instalación asistida en Windows con motor Docker Linux. |
| `LEEME-WINDOWS.md` | Instalación, acceso en red, respaldos, restauración y alternativa nativa. |

## Cómo se alimenta

1. Al configurar por primera vez, se cargan las operaciones que se transcribieron del PDF y el horario inicial 08:00–17:30, con duración de 60 minutos.
2. Admin crea los equipos y usuarios. El catálogo y los ajustes posteriores se editan desde Administración.
3. Cada integrante captura las citas. La aplicación valida los datos, asigna la sala cuando la atención es en oficina y guarda la cita y su auditoría en una misma transacción.
4. Cambiar, reagendar, cancelar, atender o bloquear una sala actualiza la misma base compartida. Cada acción queda atribuida al usuario.
5. Las métricas se calculan con esos registros. Excel y CSV son exportaciones; no alimentan automáticamente la agenda.

Las citas marcadas «Fuera de la oficina» se confirman sin sala y cuentan en agenda y métricas de atención, pero no en uso de salas.

El PDF original fue una fuente inicial, no un documento conectado en tiempo real. Reemplazar el PDF no actualiza el catálogo. Editar el catálogo inicial en el código tampoco modifica automáticamente una base que ya fue configurada; para eso se utiliza Administración o una migración expresa.

## Dónde se guardan los datos

La versión local guarda la información en `agenda.sqlite`:

- **Instalación nativa:** carpeta `data` del proyecto, o la ruta configurada mediante `DATA_DIR`.
- **Instalación Docker:** volumen `agenda-despacho_agenda-data`, con el archivo `/app/data/agenda.sqlite` dentro del contenedor.
- **Respaldos Docker:** volumen `agenda-despacho_agenda-backups`; el script de respaldo puede copiarlos a una carpeta de Windows.

Las tablas principales son:

- `records`: citas, equipos, catálogo, ajustes y bloqueos.
- `users`: cuentas, equipos, roles y hashes de contraseña.
- `audit`: historial de acciones con estados anteriores y nuevos.
- `sessions` y `attempts`: sesiones e intentos de acceso.
- `revision` y `guard`: control de modificaciones simultáneas.
- `_local_migrations`: migraciones aplicadas en la instalación local.

Los datos y respaldos quedan excluidos de Git. Las contraseñas reales, la configuración `.env` y el código de primera instalación tampoco deben subirse al repositorio. Descargar el código de GitHub no descarga ni restaura los datos.

## La versión publicada anteriormente

La dirección `https://agenda-despacho-salas.jatovarv.chatgpt.site` sigue siendo una instalación independiente alojada por Sites sobre Cloudflare Workers, con base D1. Se verificó que su base tiene las tablas de la agenda. No es una base dentro de esta carpeta de código ni dentro de GitHub.

El paquete local no incluye los datos capturados en esa versión y no sincroniza con ella. Su traslado necesita una exportación completa y consistente de la base, importación a SQLite, validación de folios, usuarios, citas y auditoría, y revocación de sesiones antiguas. Los reportes Excel/CSV no son por sí solos un respaldo completo de cuentas y configuración.

Hasta completar ese traslado, las capturas de la versión publicada permanecen allí. La consulta y preparación del repositorio no eliminan ni modifican esos registros.

## Puesta en marcha en la PC

1. Descarga el código o el paquete de instalación desde el repositorio privado y descomprímelo, por ejemplo en `C:\AgendaDespacho`.
2. Sigue `LEEME-WINDOWS.md`. Con Docker ya instalado y su motor Linux iniciado, ejecuta `Iniciar-Windows.cmd`.
3. Indica la dirección de la PC que utilizará todo el equipo. El ejemplo de la guía es ilustrativo; hay que usar la IP real del despacho.
4. Si se empieza con una base nueva, crea Dirección con el código generado localmente. Si se conservarán los datos de Sites, completa primero la migración; no mezcles una instalación nueva con datos de prueba.
5. Configura el acceso por la red del despacho y los respaldos. La PC y el servicio deben estar encendidos para que otros usuarios entren.

La instalación inicial y las actualizaciones requieren Internet para descargar código y dependencias. Después de instalarse, la operación diaria puede funcionar en la red local, sin Sites, ChatGPT ni conexión continua con GitHub.

El paquete fue preparado y probado a nivel de aplicación en macOS con Node.js. Tener un ZIP o repositorio no demuestra que el servicio ya esté instalado en la PC; Docker y el instalador deben comprobarse en ese equipo.

## Actualizaciones

Respalda la base antes de actualizar. Descarga la nueva versión del código, conserva `.env` y el almacenamiento de datos, y sigue el procedimiento de actualización de `LEEME-WINDOWS.md`. No hay actualizaciones automáticas desde GitHub hacia la PC.

## Referencias

- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- Alojamiento propio de Next.js: https://nextjs.org/docs/app/guides/self-hosting
