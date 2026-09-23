# Integración para desarrolladores

## 1. Alcance y base

Complemento de presentación y cálculo derivado para Agenda del despacho. Base comprobada: Next.js 16.3.4, React 19.2.6, TypeScript y Node.js 24. Commit de referencia:

```text
d0cafb56450b5d013701b944f8c1050d1971dfe1
```

No modifica el algoritmo de salas, autenticación, roles, catálogo, reservas, almacenamiento ni exportaciones existentes. El resumen usa los registros que ya entrega la aplicación. No precisa instalar paquetes adicionales en esa base.

**Preservación:** agregar el resumen después de la agenda o tablero, conservando cada columna y tarjeta existente. No eliminar las métricas previas. El nuevo panel añade la frecuencia de lo agendado y permite contrastarla con lo atendido.

## 2. Elegir UNA vía de integración

### A. Parche sobre una base compatible

Desde la raíz de una rama de trabajo del repositorio destino, con los cambios propios guardados:

```powershell
git apply --check "C:\ruta\agenda-modulo-operaciones\referencia\conteo-operaciones.patch"
git apply "C:\ruta\agenda-modulo-operaciones\referencia\conteo-operaciones.patch"
npm run build
```

El parche incluye los cinco archivos del módulo y las inserciones en `app/page.tsx`. No copiar el módulo antes de aplicar el parche. Si `--check` falla, usar la vía B; no forzar ni sustituir el archivo completo. La página original está escrita en líneas largas, por lo que cambios independientes en la misma línea pueden impedir aplicar el parche.

### B. Integración manual sobre la rama de los desarrolladores

**Copiar** `modulo/operations-summary/` a `modules/operations-summary/` dentro del proyecto. Se usa CSS Modules para aislar estilos. Conservar los nombres de los cinco archivos.

**En `app/page.tsx`, importar:**

```tsx
import { DailyOperationsSummary } from '@/modules/operations-summary/OperationsSummary';
import { OperationsMetrics } from '@/modules/operations-summary/OperationsMetrics';
import { useDayPrinting } from '@/modules/operations-summary/useDayPrinting';
```

**Dentro de `App`, antes de cualquier retorno condicional:**

```tsx
const printingDay = useDayPrinting();
```

**Al calcular las citas visibles, omitir búsqueda y filtro de sala solamente durante la impresión:**

```tsx
const selected = day
  .filter((b: any) => b.status !== 'waiting' && (
    printingDay || (
      (roomFilter === 'all' || b.room === roomFilter) &&
      [b.client, folio(b), b.attendeeName, b.teamName,
       ...b.operations.map((o: any) => o.name)]
        .join(' ').toLowerCase().includes(search.toLowerCase())
    )
  ))
  .sort((a: any, b: any) => a.time.localeCompare(b.time));
```

`day` ya excluye eliminadas en la aplicación de referencia. Mantener las canceladas en la tabla original si así se mostraban; el resumen indica explícitamente que no entran en el conteo de agendadas. Mantener el contador de citas de la tabla vinculado a `selected.length`.

Si hay una etiqueta de filtro de sala, cambiar su condición a `!printingDay && roomFilter !== 'all'` para que el papel no sugiera un filtro que no se aplicó. No modificar `search` ni `roomFilter`: así conservan sus valores al terminar la impresión. No añadir otro `window.print()` dentro del módulo.

**Después de la agenda/tablero y antes del footer del workspace:**

```tsx
{['agenda', 'ceo'].includes(view) && (
  <DailyOperationsSummary
    bookings={data.bookings}
    catalog={data.operations}
    date={date}
  />
)}
```

Pasar `data.bookings`, no `selected` ni solo las citas atendidas. Así el resumen cubre el día completo, incluso cuando la vista de pantalla se filtra. Mantener el mismo estado `date` para encabezado, citas, bloqueos y resumen. Los eliminados solo aportan al contador de excluidos si la API los entrega; no se debe ampliar el acceso a datos para obtenerlos.

**En `Metrics`, después de los indicadores actuales y antes de `metrics-grid`:**

```tsx
<OperationsMetrics
  bookings={data.bookings}
  catalog={data.operations}
  from={period === 'all' ? undefined : start}
  to={end}
/>
```

Usar el rango que ya calcula `Metrics`: 7/30 días inclusivos hasta `today()` en CDMX. Para historial pasar `from={undefined}`, no el centinela `0000-00-00` del código anterior. El historial llega hasta hoy; las citas futuras se consultan en su día de agenda. Los filtros de métrica no cambian el resumen del día.

## 3. Contrato de datos y cálculo

`aggregate.ts` no depende de React, DOM, Node ni base de datos. Puede reutilizarse en un backend TypeScript. Interfaces exportadas: `Operation`, `OperationBooking`, `ReportOptions`, `Report`, `OperationRow`, `Counts`, `Measure`.

```ts
const report = aggregateOperations(bookings, catalog, {
  from: '2026-09-22',
  to: '2026-09-22',
  includeZero: false,
});
// report.appointments: { scheduled, pending, attended }
// report.operations:   { scheduled, pending, attended }
// report.rows:         [{ id, name, matter, scheduled, pending, attended, active? }]
// report.excluded:     { waiting, cancelled, deleted }
// report.withoutOperations, report.unresolvedOperationIds
```

| Campo de entrada | Contrato |
|---|---|
| `bookings[].id` | ID persistente de cita, único dentro del rango; no una fila por evento de auditoría |
| `bookings[].date` | Fecha local de atención `AAAA-MM-DD`; no convertir desde UTC para agrupar |
| `bookings[].status` | `confirmed`, `attended`, `waiting`, `cancelled` o `deleted` |
| `bookings[].operationIds` | IDs seleccionados, autoritativos si el campo existe; un arreglo vacío significa ninguna operación |
| `bookings[].operations` | Instantáneas `{ id, name, matter }`; respaldan etiquetas y aportan IDs solo si `operationIds` no existe |
| `catalog` | Catálogo completo autorizado: `{ id, name, matter, active? }`, IDs únicos, incluir inactivas con historial |
| `from` / `to` | Límites inclusivos, fechas válidas; omitir `from` para no limitar el inicio |

El agregador rechaza fechas imposibles, rangos invertidos, citas repetidas dentro del rango y estados no reconocidos. El adaptador de otra API debe validar su contrato antes de renderizar y mostrar un error de carga si los datos no cumplen; no presentar un cero como si fuera una medición válida.

La fuente debe traer **todos los registros autorizados** del período, no solo la página visible. La API original entrega el conjunto completo para la vista; si los desarrolladores agregaron paginación, deberán obtener el agregado del lado servidor o cargar el conjunto completo. No sumar respuestas paginadas sin deduplicar por cita, ni calcular a partir del log de auditoría.

La instantánea más reciente por fecha de atención (desempate por ID de cita) del período respalda etiquetas ausentes del catálogo. Un ID sin etiqueta no se descarta: aparece como “Operación sin etiqueta (ID)” y genera un aviso. Una cita sin operaciones cuenta como cita y genera otro aviso. No se inventan operaciones para corregir datos faltantes.

`includeZero` añade operaciones activas del catálogo sin citas. Los tipos inactivos sin uso quedan fuera; los inactivos con uso sí aparecen. Para orden ascendente, primero se muestran los ceros si están incluidos. Los empates se ordenan por nombre y después ID, sin ocultar ninguna operación.

El total de operaciones de cada estado es la suma de sus filas. Agendadas = pendientes + atendidas tanto para citas como para operaciones. Los porcentajes se calculan con precisión completa y se muestran a un decimal; el total se presenta como 100% cuando existe un denominador positivo y 0% cuando está vacío. No sumar porcentajes ya redondeados.

## 4. Impresión, permisos y auditoría

- El botón existente conserva su llamada `api({action:'print', entity: 'agenda FECHA', format:'PDF'})` antes de `window.print()`. No se cambia la auditoría existente ni se registra un supuesto éxito de impresión: el usuario puede cancelar el diálogo.
- `useDayPrinting` usa `beforeprint` / `afterprint`. La actualización síncrona durante `beforeprint` permite dibujar las filas completas antes de que el navegador prepare el documento. También atiende la impresión desde el menú del navegador; esa ruta no agrega por sí sola un evento a la auditoría.
- El resumen hereda la orientación y márgenes actuales. Tiene encabezados de tabla repetibles, filas que evitan cortes y texto legible sin depender de colores. No imponer un alto fijo ni `overflow: hidden` a su contenedor.
- Mantener el resumen dentro del árbol protegido por login. El componente solo recibe datos ya autorizados; no consulta rutas nuevas, no amplía permisos de usuarios de equipo y no muestra clientes adicionales.
- El cálculo no escribe ni mantiene otro log. Los cambios de citas y catálogo siguen en la auditoría existente; se recalcula con la respuesta actualizada de la API y con el refresco normal de la aplicación.
- No modifica el Excel ni el CSV actuales. En esta entrega las métricas se consultan en pantalla y el resumen diario se incluye al imprimir.

Referencias técnicas: [React: actualización del DOM antes de imprimir](https://react.dev/reference/react-dom/flushSync#flushing-updates-for-third-party-integrations) y [MDN: evento beforeprint](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeprint_event).

## 5. Validar antes de integrar a producción

En esta carpeta, con Node.js 24, ejecutar sin instalar paquetes:

```powershell
node --test pruebas/aggregate.test.mjs
```

Después de integrar, ejecutar la compilación del proyecto y verificar:

- [ ] El ejemplo de `ejemplo/datos.json` produce 3 citas, 4 operaciones, 3 tipos y la tabla de `LEEME.md`.
- [ ] Agenda y Vista CEO conservan todos sus detalles y añaden el resumen al final del documento.
- [ ] Desde Agenda: aplicar un filtro de sala y una búsqueda sin resultados; pulsar “Imprimir día”. El documento contiene todas las citas del día, con su resumen completo. Al cancelar o cerrar la impresión, los filtros permanecen en pantalla.
- [ ] Un día vacío muestra ceros y un mensaje claro. Un día con esperas y canceladas no las suma como operaciones agendadas.
- [ ] Probar un día con varias páginas y nombres largos: ninguna columna se corta, el encabezado de la tabla se repite y todas las filas llegan a la impresión.
- [ ] Agregar una segunda operación a una cita suma una operación; marcar atendida traslada sus operaciones de pendientes a atendidas sin aumentar agendadas.
- [ ] Reagendar, cancelar y recuperar una espera actualiza correctamente el día y las métricas después de cargar datos actualizados.
- [ ] El selector 7/30/historial, orden por agendadas/atendidas, más/menos y ceros cambia el nuevo panel como indica su encabezado.
- [ ] Un usuario de equipo mantiene sus permisos previos. CEO/Admin conservan las vistas y bloqueos existentes.
- [ ] El botón “Imprimir día” sigue registrando la solicitud en auditoría. Reservas, asignación, exportaciones y PDF individual mantienen su funcionamiento.
- [ ] Compilar y probar impresión/Guardar como PDF en el navegador que use el despacho en Windows, antes de desplegar el contenedor.

Para revertir, retirar las inserciones indicadas y `modules/operations-summary/`. No hay cambios de base de datos que revertir. Si aplicaron el parche sin otros cambios posteriores, pueden comprobar primero `git apply --reverse --check` y luego revertirlo.
