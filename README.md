# Agenda del despacho "MEMO" · Servidor propio

Aplicación de reservas de salas con usuarios individuales, equipos, asignación automática, 44 operaciones notariales, bloqueos, lista de espera, métricas y auditoría.

**Instalación en Windows con Docker:** abre [LEEME-WINDOWS.md](LEEME-WINDOWS.md) y ejecuta `Iniciar-Windows.cmd`.

**Código en GitHub y ejecución en PC:** consulta [el mapa de código, datos e instalación](docs/GITHUB-Y-PC.md). 

## Arquitectura

Next.js con salida standalone, Node.js 24 y SQLite en almacenamiento local persistente. La interfaz usa React y componentes accesibles. El catálogo proviene del PDF proporcionado. Horario inicial: 08:00–17:30, duración 60 minutos, zona America/Mexico_City.

No utiliza la plataforma Sites, Cloudflare Workers, D1 ni autenticación de ChatGPT. La base de datos local es la fuente. Las cuentas tienen hash PBKDF2-SHA256 con sal individual y 600.000 iteraciones; los hashes anteriores de 100.000 siguen siendo verificables. Sesiones de ocho horas, cookies HttpOnly/SameSite Strict y autorización del lado servidor. La primera cuenta requiere un código generado en el servidor.

La asignación conserva el orden Barra (5), Redonda (5), Anexo Not. (6), Rectangular (7), Acuerdos (16). Con discapacidad: Barra, Anexo Not., Redonda, Rectangular, Acuerdos. Se conserva la capacidad y se evita cualquier cruce con reservas o bloqueos. Las escrituras y sus entradas de auditoría son atómicas. Una revisión global protege ante solicitudes simultáneas; una edición antigua no sobrescribe otra nueva.

Las capacidades cuentan a todos los ocupantes, incluido el personal. Las personas recibidas se cuentan solo en citas marcadas atendidas. Las cancelaciones liberan el espacio y las eliminaciones son lógicas, manteniendo los datos y el registro. El Excel incluye cinco hojas con todo el historial. El PDF se obtiene mediante impresión del navegador.

## Desarrollo

```sh
npm ci
npm run dev
```

En desarrollo la base queda en `data/agenda.sqlite`. Obtén el código inicial con `node scripts/setup-code.mjs`. No ejecutes las pruebas de integración contra una base con datos reales.

```sh
npm run typecheck
node tests/local-database.mjs
node tests/exports.mjs
npm run build
node scripts/package-release.mjs
```

Para probar las rutas HTTP, inicia la aplicación con un `DATA_DIR` de pruebas separado y configura `APP_ORIGIN`, `DESK_TEST_URL` y `DATA_DIR` para `node tests/run-local-integration.mjs`.

Las migraciones generadas viven en `drizzle/`. La inicialización verifica su checksum, las aplica una vez y conserva su historial. No modifiques una migración ya aplicada; agrega una nueva. La base de datos usa WAL, escritura sincronizada y respaldo nativo SQLite.

## Fuentes técnicas

- [Next.js: alojamiento propio](https://nextjs.org/docs/app/guides/self-hosting)
- [Next.js: salida standalone](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
- [Node.js: SQLite](https://nodejs.org/api/sqlite.html)
- [Docker: instalación en Windows](https://docs.docker.com/desktop/setup/install/windows-install/)
