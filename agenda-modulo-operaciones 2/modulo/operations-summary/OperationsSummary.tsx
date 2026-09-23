import { aggregateOperations, operationShare, sortOperations } from './aggregate';
import type { Measure, Operation, OperationBooking, Report } from './aggregate';
import styles from './operations.module.css';

const number = (value: number) => value.toLocaleString('es-MX');
const dateLabel = (date: string) => new Intl.DateTimeFormat('es-MX', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
}).format(new Date(date + 'T12:00:00Z'));

export function OperationsSummary({ report, title = 'Resumen de operaciones', measure = 'scheduled', order = 'most' }: {
  report: Report; title?: string; measure?: Measure; order?: 'most' | 'least';
}) {
  const rows = sortOperations(report.rows, measure, order);
  const label = measure === 'attended' ? 'atendidas' : 'agendadas';
  return <section className={styles.summary} aria-label={title}>
    <header className={styles.heading}>
      <div><p className={styles.eyebrow}>ACTIVIDAD DEL DESPACHO</p><h2>{title}</h2></div>
      <p>{report.from === report.to ? dateLabel(report.to) :
        `${report.from ? dateLabel(report.from) : 'Desde el inicio'} al ${dateLabel(report.to)}`}</p>
    </header>
    <dl className={styles.totals}>
      <div><dt>Citas agendadas</dt><dd>{number(report.appointments.scheduled)}</dd>
        <small>Pendientes: {number(report.appointments.pending)} · Atendidas: {number(report.appointments.attended)}</small></div>
      <div><dt>Operaciones agendadas</dt><dd>{number(report.operations.scheduled)}</dd>
        <small>Pendientes: {number(report.operations.pending)} · Atendidas: {number(report.operations.attended)}</small></div>
      <div><dt>Tipos de operación agendados</dt><dd>{number(report.rows.filter(row => row.scheduled > 0).length)}</dd>
        <small>Tipos distintos con al menos una cita</small></div>
    </dl>
    <div className={styles.tableWrap}><table className={styles.table}>
      <caption>Frecuencia por tipo · {order === 'most' ? 'Mayor' : 'Menor'} a {order === 'most' ? 'menor' : 'mayor'} número de operaciones {label}</caption>
      <thead><tr><th scope="col">Operación / materia</th><th scope="col">Agendadas</th><th scope="col">Pendientes</th><th scope="col">Atendidas</th><th scope="col">% de operaciones {label}</th></tr></thead>
      <tbody>{rows.length ? rows.map(row => <tr key={row.id}>
        <th scope="row"><strong>{row.name}</strong><small>{row.matter}{row.active === false ? ' · Inactiva en catálogo' : ''}</small></th>
        <td>{number(row.scheduled)}</td><td>{number(row.pending)}</td><td>{number(row.attended)}</td>
        <td>{operationShare(row, report, measure).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</td>
      </tr>) : <tr><td colSpan={5} className={styles.empty}>Sin operaciones agendadas en este período.</td></tr>}</tbody>
      <tfoot><tr><th scope="row">Total de operaciones</th><td>{number(report.operations.scheduled)}</td><td>{number(report.operations.pending)}</td><td>{number(report.operations.attended)}</td><td>{report.operations[measure] ? '100.0%' : '0.0%'}</td></tr></tfoot>
    </table></div>
    <p className={styles.note}>Agendadas = pendientes + atendidas. Cada tipo cuenta una vez por cita; una cita puede incluir varios tipos.
      El porcentaje usa el total de operaciones {label}; puede haber diferencias de redondeo.</p>
    <p className={styles.note}>Citas fuera del conteo — canceladas: {number(report.excluded.cancelled)}; en espera: {number(report.excluded.waiting)}; eliminadas: {number(report.excluded.deleted)}.
      Los bloqueos de salas no son operaciones.</p>
    {!!report.withoutOperations && <p className={styles.warning}>Revisar datos: {number(report.withoutOperations)} citas agendadas no tienen operaciones seleccionadas.</p>}
    {!!report.unresolvedOperationIds.length && <p className={styles.warning}>Revisar catálogo: hay {number(report.unresolvedOperationIds.length)} tipos sin etiqueta; sus cantidades sí se incluyen.</p>}
  </section>;
}

/** Recibir TODAS las citas autorizadas del día, sin búsqueda ni filtro de sala. */
export function DailyOperationsSummary({ bookings, catalog, date }: {
  bookings: readonly OperationBooking[]; catalog: readonly Operation[]; date: string;
}) {
  return <OperationsSummary title="Resumen de operaciones del día"
    report={aggregateOperations(bookings, catalog, { from: date, to: date })}/>;
}
