# Complemento: conteo y frecuencia de operaciones

**Entrega independiente para los desarrolladores · versión 1.0.0 · 22 de septiembre de 2026**

Añadir a “Imprimir día” un **Resumen de operaciones del día**, después de la agenda existente. Conservar horarios, clientes, folios, salas, personas, responsables, estados y bloqueos de la vista actual. El mismo cálculo alimenta un nuevo panel en Métricas para identificar las operaciones más y menos frecuentes.

La aplicación original no se ha modificado. Este paquete contiene el código del complemento, un parche de referencia y las instrucciones para adaptarlo a la rama que los desarrolladores están implementando. Funciona con los datos existentes y no requiere tablas, migraciones ni servicios externos.

## Qué agrega

- Conteo por operación y materia, con columnas **Agendadas / Pendientes / Atendidas / Porcentaje**.
- Totales separados de citas, operaciones y tipos distintos. Orden de mayor a menor frecuencia en el resumen diario.
- Resumen visible al pie de Agenda del día y Vista CEO, que también sale al imprimir.
- Panel de frecuencia en Métricas: respeta 7 días, 30 días o historial; permite ordenar por agendadas o atendidas, de más a menos o de menos a más, e incluir tipos activos sin citas.
- Impresión del día completo aunque en pantalla haya búsqueda o filtro de sala. Al cerrar el diálogo se conservan los filtros anteriores.

## Cómo leerlo

Una cita puede contener varios tipos de operación. Una cita con **Compraventa CDMX + Poderes** suma **1 cita y 2 operaciones**. Seleccionar dos veces el mismo tipo dentro de una cita solo aporta una ocurrencia.

Ejemplo: tres citas vigentes, una con Compraventa + Poderes, otra con Compraventa y otra con Testamento:

| Operación | Agendadas | Pendientes | Atendidas | % agendadas |
|---|---:|---:|---:|---:|
| Compraventa CDMX | 2 | 1 | 1 | 50.0% |
| Poderes | 1 | 1 | 0 | 25.0% |
| Testamento | 1 | 0 | 1 | 25.0% |
| **Total** | **4** | **2** | **2** | **100.0%** |

Son **3 citas, 4 operaciones y 3 tipos distintos**. Una cita cancelada y una en espera se muestran como excluidas del conteo. El archivo `ejemplo/vista-previa.html` presenta este ejemplo con datos ficticios.

## Reglas acordadas para implementar

1. **Agendadas = pendientes confirmadas + atendidas.** No equivale al número de reservas que alguna vez se crearon. Canceladas, eliminadas y lista de espera quedan fuera del conteo principal.
2. Se usa la **fecha de atención** de la cita, en Ciudad de México. Reagendar mueve la operación al nuevo día. Los bloqueos de salas no son operaciones.
3. Cada combinación **ID de cita + ID de operación** cuenta una vez. Dos IDs de catálogo distintos se mantienen separados aunque compartan nombre.
4. Las operaciones atendidas son las seleccionadas en citas marcadas como atendidas. El modelo actual no registra cumplimiento parcial por operación ni cuántos instrumentos se firmaron. Este módulo mide frecuencia de tipos por cita.
5. El porcentaje es sobre **el total de operaciones del período**, según la medida elegida, nunca sobre personas. La gente no se multiplica por el número de operaciones de su cita.
6. Se conservan los datos históricos disponibles; los tipos inactivos con citas también cuentan. Los nombres actuales del catálogo se usan para el ranking, con la instantánea histórica como respaldo; no se cambia el detalle original de ninguna cita.
7. El reporte representa el estado actual de las citas, no una fotografía inmutable de cómo estaban en una fecha pasada. Guardar la impresión como PDF conserva una copia del reporte consultado.

## Qué entregar al equipo

Entregar **todo este paquete**. Deben comenzar por `INTEGRACION.md`.

| Archivo o carpeta | Uso |
|---|---|
| `modulo/operations-summary/` | Cinco archivos listos para copiar: cálculo, resumen, métricas, estilos y manejo de impresión |
| `referencia/conteo-operaciones.patch` | Cambios de referencia contra el commit indicado en `referencia/BASE.txt` |
| `INTEGRACION.md` | Integración manual, contrato de datos y criterios de aceptación |
| `pruebas/aggregate.test.mjs` | Pruebas del conteo, sin instalar dependencias |
| `ejemplo/` | Datos ficticios y vista previa del resumen |
| `VALIDACION.md` | Verificaciones efectuadas y las que deben completar los desarrolladores |

**Instrucción breve para los desarrolladores:**

> Integren este complemento de conteo de operaciones al final de la agenda impresa, tanto en Agenda del día como en Vista CEO. Conserven toda la información actual. Reutilicen su cálculo en el panel de frecuencia de Métricas. La guía especifica cómo contar citas con varias operaciones, excluir cancelaciones y esperas y mantener los filtros de fechas. El parche es una referencia contra la entrega original; si su rama ya cambió, hagan la integración manual sin reemplazar archivos completos. Validar en su entorno Windows/Docker antes de desplegar.
