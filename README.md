# Agenda del despacho

Aplicación en español para cinco salas, con base de datos compartida en el servidor, acceso individual, roles y auditoría.

## Primer uso

1. Abre el enlace privado y crea la cuenta de Dirección. Será el primer CEO.
2. En Administración → Equipos y usuarios, crea o renombra equipos.
3. Agrega usuarios en lote: `LDF, JATC, XAPT`. Cada persona recibe una contraseña temporal distinta, que debe cambiar al entrar. Copia los accesos al generarlos: no se guardan en texto claro ni se muestran otra vez.
4. Revisa Configuración: horario 08:00–17:30, duración inicial 60 minutos, zona America/Mexico_City.
5. Crea una cita. El número de personas incluye a todos los ocupantes de la sala: clientes, acompañantes y personal.

El enlace de Sites empieza restringido a su propietario. Crear usuarios dentro de la agenda no les otorga automáticamente acceso a Sites. Se debe configurar la audiencia del sitio antes del despliegue al equipo. No hay usuarios ni citas de prueba en la base de producción.

## Funcionamiento

- Salas: Barra 5, Redonda 5, Anexo Not. 6, Rectangular 7 y Acuerdos 16.
- Se asigna la menor sala libre que alcance. Con discapacidad: Barra, Anexo, Redonda, Rectangular y Acuerdos, siempre respetando la capacidad.
- Se comprueba el intervalo completo. Dos citas pueden terminar y empezar a la misma hora. Las citas atendidas conservan su reserva hasta la hora de finalización original.
- Si no hay sala, se ofrecen hasta cuatro horas del mismo día, en intervalos de 15 minutos, ordenadas por cercanía a la hora solicitada, o lista de espera. Los grupos mayores de 16 personas deben ajustar su número de asistentes; no se dividen automáticamente entre salas.
- La duración admite de 15 a 600 minutos, en pasos de 15; siempre debe caber en el horario de atención.
- Cada cita tiene folio consecutivo estable. Cancelar libera la sala. Eliminar oculta una cita cancelada y conserva registro e historial; no borra físicamente la información.
- El PDF usa el diálogo de impresión del navegador. Permite las ventanas emergentes para abrir la confirmación automática. También puede imprimirse desde cada cita.
- Los bloqueos requieren Admin o CEO y no desplazan citas existentes.
- Equipo consulta la agenda y modifica citas de su propio equipo. Admin y CEO administran todas las citas, usuarios, equipos, bloqueos, catálogo y ajustes.

## Métricas y exportación

Los períodos de 7 y 30 días terminan hoy. Las personas recibidas y el promedio se calculan con citas marcadas atendidas, e incluyen el personal según el criterio de capacidad del formulario. Las operaciones se cuentan por cita, con varias operaciones posibles. El ranking incluye operaciones sin atenciones. Las citas canceladas, en espera y eliminadas no suman al uso de salas. Los usuarios desactivados se conservan para identificar su historial.

CSV y XLSX contienen todo el historial, independientemente del filtro de métricas: citas, operaciones por cita, auditoría, catálogo y bloqueos vigentes. El Excel es un archivo XLSX real con cinco hojas. En CSV, las secciones aparecen consecutivamente. Las operaciones de exportación se registran en auditoría.

## Implementación

- React / Vinext sobre Cloudflare Workers, D1 mediante Sites.
- Contraseñas PBKDF2-SHA256 con sal aleatoria, 100.000 iteraciones (compatible con Workers), sesión de ocho horas con cookie HttpOnly, SameSite Strict y Secure en HTTPS; los tokens de sesión se guardan como hash.
- Validación y autorización en servidor. Primer acceso obliga a cambiar la contraseña temporal. Restablecer o desactivar una cuenta revoca sus sesiones. Límite de intentos de acceso por usuario y origen.
- Cada modificación se ejecuta junto con su auditoría en una transacción D1. Un contador de revisión y una restricción SQL evitan dobles asignaciones por concurrencia. Las ediciones desactualizadas se rechazan.
- Auditoría consultable de solo lectura dentro de la aplicación, con usuario, momento, entidad y estados anterior/nuevo. Las claves y hashes de contraseñas no se incluyen en el log.
- Operaciones de catálogo almacenadas como instantánea en cada cita: los cambios de nombre no reescriben el pasado.
- La agenda se actualiza cada 30 segundos. La disponibilidad final se comprueba al guardar.
- El catálogo tiene 44 operaciones transcritas del PDF proporcionado. Las cinco materias son una clasificación organizativa añadida, no una clasificación presente en el PDF.
- La versión inicial carga el historial de reservas en la sesión del navegador. Para historiales de gran volumen conviene paginar consultas y agregar las métricas en el servidor.

## Desarrollo y verificación

```sh
npm ci
npm run db:generate
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_wise_risque.sql
npm run dev
```

La migración local se aplica una vez por base de pruebas. Las migraciones de producción las aplica Sites. No editar una migración ya desplegada.

Pruebas funcionales contra localhost, con datos ficticios exclusivamente locales:

```sh
node tests/integration.mjs
node tests/exports.mjs
node node_modules/typescript/bin/tsc --noEmit
```

No usar las credenciales de prueba en producción. La base local `.wrangler` no se incorpora a la publicación.
