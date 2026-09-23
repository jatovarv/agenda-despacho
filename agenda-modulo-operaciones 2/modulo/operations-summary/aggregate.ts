/** Conteos derivados de citas actuales; no escribe en la base ni en la auditoría. */
export interface Operation {
  id: string;
  name: string;
  matter: string;
  active?: boolean;
}

export interface OperationBooking {
  id: string;
  date: string; // Fecha de atención en CDMX, AAAA-MM-DD; no createdAt.
  status: 'confirmed' | 'attended' | 'waiting' | 'cancelled' | 'deleted';
  operationIds?: readonly string[];
  operations?: readonly Operation[]; // Instantáneas históricas.
}

export interface Counts {
  scheduled: number;
  pending: number;
  attended: number;
}

export interface OperationRow extends Operation, Counts {}
export type Measure = 'scheduled' | 'attended';
export interface Report {
  from?: string;
  to: string;
  appointments: Counts;
  operations: Counts;
  rows: OperationRow[];
  excluded: { waiting: number; cancelled: number; deleted: number };
  withoutOperations: number;
  unresolvedOperationIds: string[];
}

export interface ReportOptions {
  from?: string; // Omitir para todo el historial hasta to, inclusive.
  to: string;
  includeZero?: boolean; // Incluye catálogo activo sin uso en el período.
}

function validateDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') {
    throw new Error(`Fecha inválida: ${value}. Usa AAAA-MM-DD.`);
  }
  const date = new Date(value + 'T12:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Fecha inválida: ${value}.`);
  }
}

const counts = (): Counts => ({ scheduled: 0, pending: 0, attended: 0 });
function increment(target: Counts, status: 'confirmed' | 'attended') {
  target.scheduled += 1;
  target[status === 'attended' ? 'attended' : 'pending'] += 1;
}

/** Un ID de operación aporta como máximo una ocurrencia por cita. */
export function aggregateOperations(
  bookings: readonly OperationBooking[],
  catalog: readonly Operation[],
  options: ReportOptions,
): Report {
  validateDate(options.to);
  if (options.from !== undefined) {
    validateDate(options.from);
    if (options.from > options.to) throw new Error('El inicio del período supera el fin.');
  }
  const definitions = new Map(catalog.map(o => [o.id, o]));
  const rows = new Map<string, OperationRow>();
  const unresolved = new Set<string>();
  const seen = new Set<string>();
  const report: Report = {
    from: options.from, to: options.to, appointments: counts(), operations: counts(), rows: [],
    excluded: { waiting: 0, cancelled: 0, deleted: 0 }, withoutOperations: 0,
    unresolvedOperationIds: [],
  };
  if (options.includeZero) {
    for (const operation of catalog) {
      if (operation.active !== false) rows.set(operation.id, { ...operation, ...counts() });
    }
  }
  // Conserva una etiqueta histórica estable cuando ya no existe en el catálogo.
  const snapshots = new Map<string, Operation>();
  for (const booking of [...bookings].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
    validateDate(booking.date);
    if (booking.date > options.to || (options.from && booking.date < options.from)) continue;
    for (const operation of booking.operations ?? []) snapshots.set(operation.id, operation);
  }
  for (const booking of bookings) {
    if (booking.date > options.to || (options.from && booking.date < options.from)) continue;
    if (!booking.id || seen.has(booking.id)) throw new Error(`ID de cita vacío o repetido: ${booking.id}`);
    seen.add(booking.id);
    if (booking.status === 'waiting' || booking.status === 'cancelled' || booking.status === 'deleted') {
      report.excluded[booking.status] += 1;
      continue;
    }
    if (booking.status !== 'confirmed' && booking.status !== 'attended') {
      throw new Error(`Estado de cita no reconocido: ${booking.status}`);
    }
    increment(report.appointments, booking.status);
    // Si operationIds existe, es autoritativo (también si es []). Las instantáneas dan etiquetas.
    const ids = new Set(booking.operationIds ?? booking.operations?.map(o => o.id) ?? []);
    if (ids.size === 0) report.withoutOperations += 1;
    for (const id of ids) {
      if (!id) throw new Error(`ID de operación vacío en cita ${booking.id}`);
      const definition = definitions.get(id) ?? snapshots.get(id);
      if (!definition) unresolved.add(id);
      const row = rows.get(id) ?? {
        ...(definition ?? { id, name: `Operación sin etiqueta (${id})`, matter: 'Sin materia' }), ...counts(),
      };
      increment(row, booking.status);
      increment(report.operations, booking.status);
      rows.set(id, row);
    }
  }
  report.rows = sortOperations([...rows.values()]);
  report.unresolvedOperationIds = [...unresolved].sort();
  return report;
}

export function sortOperations(
  rows: readonly OperationRow[], measure: Measure = 'scheduled', order: 'most' | 'least' = 'most',
): OperationRow[] {
  return [...rows].sort((a, b) =>
    (order === 'most' ? b[measure] - a[measure] : a[measure] - b[measure]) ||
    a.name.localeCompare(b.name, 'es-MX') || a.id.localeCompare(b.id));
}

/** Participación sobre operaciones, no sobre citas; no redondear antes de sumar. */
export function operationShare(row: OperationRow, report: Report, measure: Measure): number {
  return report.operations[measure] ? row[measure] / report.operations[measure] * 100 : 0;
}
