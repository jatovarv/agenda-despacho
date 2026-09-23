'use client';
import { useState } from 'react';
import { aggregateOperations } from './aggregate';
import type { Measure, Operation, OperationBooking } from './aggregate';
import { OperationsSummary } from './OperationsSummary';
import styles from './operations.module.css';

/** El rango lo controla el selector 7 / 30 días / historial de la aplicación. */
export function OperationsMetrics({ bookings, catalog, from, to }: {
  bookings: readonly OperationBooking[]; catalog: readonly Operation[]; from?: string; to: string;
}) {
  const [measure, setMeasure] = useState<Measure>('scheduled');
  const [order, setOrder] = useState<'most' | 'least'>('most');
  const [includeZero, setIncludeZero] = useState(false);
  return <div className={styles.metrics}>
    <div className={styles.controls}>
      <label>Ordenar y calcular porcentaje por
        <select value={measure} onChange={event => setMeasure(event.target.value as Measure)}>
          <option value="scheduled">Operaciones agendadas</option><option value="attended">Operaciones atendidas</option>
        </select>
      </label>
      <label>Orden
        <select value={order} onChange={event => setOrder(event.target.value as 'most' | 'least')}>
          <option value="most">Más frecuentes primero</option><option value="least">Menos frecuentes primero</option>
        </select>
      </label>
      <label className={styles.check}><input type="checkbox" checked={includeZero} onChange={event => setIncludeZero(event.target.checked)}/>
        Incluir catálogo activo sin citas</label>
    </div>
    <OperationsSummary title="Frecuencia de operaciones" measure={measure} order={order}
      report={aggregateOperations(bookings, catalog, { from, to, includeZero })}/>
  </div>;
}
