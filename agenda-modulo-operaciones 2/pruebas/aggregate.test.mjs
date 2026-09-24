import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aggregateOperations, sortOperations, operationShare } from '../modulo/operations-summary/aggregate.ts';

const sample = JSON.parse(readFileSync(new URL('../ejemplo/datos.json', import.meta.url)));
const opts = { from: sample.date, to: sample.date };
const run = (bookings = sample.bookings, catalog = sample.catalog, options = opts) => aggregateOperations(bookings, catalog, options);

test('Una cita multoperación suma dos operaciones y una cita; separa atendidas', () => {
  const report = run();
  assert.deepEqual(report.appointments, { scheduled: 3, pending: 1, attended: 2 });
  assert.deepEqual(report.operations, { scheduled: 4, pending: 2, attended: 2 });
  assert.deepEqual(report.rows.map(r => [r.name, r.scheduled, r.pending, r.attended]), [
    ['Compraventa CDMX', 2, 1, 1], ['Poderes', 1, 1, 0], ['Testamento', 1, 0, 1],
  ]);
  assert.deepEqual(report.excluded, { cancelled: 1, waiting: 1, deleted: 0 });
});

test('El mismo ID de operación repetido dentro de una cita cuenta una sola vez', () => {
  const report = run([{ ...sample.bookings[0], operationIds: ['op-4-2', 'op-4-2'] }]);
  assert.equal(report.operations.scheduled, 1);
});

test('Cuenta por fecha de atención y límites inclusivos, no por creación ni zona horaria del servidor', () => {
  const bookings = ['2026-09-15', '2026-09-16', '2026-09-22', '2026-09-23'].map((date, i) => ({ ...sample.bookings[0], id: String(i), date, createdAt: '2020-01-01T00:00:00Z' }));
  assert.equal(run(bookings, sample.catalog, { from: '2026-09-16', to: '2026-09-22' }).appointments.scheduled, 2);
  assert.equal(run(bookings, sample.catalog, { to: '2026-09-22' }).appointments.scheduled, 3);
});

test('Reagendar mueve las ocurrencias al nuevo día; se recibe el estado actual, no eventos', () => {
  const moved = [{ ...sample.bookings[0], date: '2026-09-23' }];
  assert.equal(run(moved).operations.scheduled, 0);
  assert.equal(run(moved, sample.catalog, { from: '2026-09-23', to: '2026-09-23' }).operations.scheduled, 2);
});

test('Esperas, canceladas y eliminadas no inflan la frecuencia', () => {
  const report = run(['waiting', 'cancelled', 'deleted'].map((status, i) => ({ ...sample.bookings[0], id: String(i), status })));
  assert.equal(report.operations.scheduled, 0);
  assert.deepEqual(report.excluded, { cancelled: 1, waiting: 1, deleted: 1 });
});

test('Atender una cita mueve pendientes a atendidas sin duplicar agendadas', () => {
  const before = run([sample.bookings[0]]);
  const after = run([{ ...sample.bookings[0], status: 'attended' }]);
  assert.equal(after.operations.scheduled, before.operations.scheduled);
  assert.equal(after.operations.pending, 0);
  assert.equal(after.operations.attended, 2);
});

test('Agrupa por ID: un cambio de nombre no divide la frecuencia ni une IDs distintos', () => {
  const bookings = sample.bookings.slice(0, 2).map(b => ({ ...b, operations: [{ id: 'op-4-2', name: 'Nombre anterior', matter: 'Anterior' }] }));
  const catalog = [...sample.catalog, { id: 'otra', name: 'Compraventa CDMX', matter: 'Otra' }];
  bookings.push({ id: 'otra-cita', date: sample.date, status: 'attended', operationIds: ['otra'] });
  const report = run(bookings, catalog);
  assert.equal(report.rows.find(r => r.id === 'op-4-2').scheduled, 2);
  assert.equal(report.rows.find(r => r.id === 'op-4-2').name, 'Compraventa CDMX');
  assert.equal(report.rows.filter(r => r.name === 'Compraventa CDMX').length, 2);
});

test('Operaciones inactivas o retiradas conservan su conteo e instantánea', () => {
  const bookings = [{ id: 'historica', date: sample.date, status: 'attended', operations: [{ id: 'vieja', name: 'Histórica', matter: 'Original' }] }];
  const report = run(bookings, [{ id: 'vieja', name: 'Histórica nueva etiqueta', matter: 'Original', active: false }]);
  assert.equal(report.rows[0].attended, 1);
  assert.equal(report.rows[0].active, false);
  assert.equal(run(bookings, []).rows[0].name, 'Histórica');
});

test('operationIds manda sobre instantáneas desactualizadas; [] no rescata operaciones retiradas', () => {
  const booking = { ...sample.bookings[0], operationIds: [], operations: [sample.catalog[0]] };
  const report = run([booking]);
  assert.equal(report.operations.scheduled, 0);
  assert.equal(report.withoutOperations, 1);
});

test('IDs sin etiqueta se contabilizan y se señalan para revisión', () => {
  const report = run([{ ...sample.bookings[0], operationIds: ['desconocida'] }]);
  assert.deepEqual(report.unresolvedOperationIds, ['desconocida']);
  assert.equal(report.operations.scheduled, 1);
  assert.match(report.rows[0].name, /sin etiqueta/);
});

test('Sin datos no hay NaN, y los ceros del catálogo son optativos', () => {
  assert.equal(run([]).rows.length, 0);
  const report = run([], [...sample.catalog, { id: 'off', name: 'Inactiva sin uso', matter: 'X', active: false }], { ...opts, includeZero: true });
  assert.equal(report.rows.length, 4);
  assert.equal(operationShare(report.rows[0], report, 'scheduled'), 0);
});

test('Más/menos frecuentes admiten ceros; porcentajes usan operaciones, no personas o citas', () => {
  const report = run(undefined, undefined, { ...opts, includeZero: true });
  assert.equal(sortOperations(report.rows, 'scheduled', 'least')[0].scheduled, 0);
  const sale = report.rows.find(r => r.id === 'op-4-2');
  assert.equal(operationShare(sale, report, 'scheduled'), 50);
  assert.equal(operationShare(sale, report, 'attended'), 50);
  assert.equal(report.rows.reduce((n, r) => n + operationShare(r, report, 'scheduled'), 0), 100);
});

test('Rechaza rangos inválidos, fechas imposibles, duplicados y estados desconocidos', () => {
  assert.throws(() => run(undefined, undefined, { from: '2026-09-23', to: sample.date }), /inicio/);
  assert.throws(() => run(undefined, undefined, { to: '2026-02-30' }), /Fecha/);
  assert.throws(() => run(undefined, undefined, { from: '0000-00-00', to: sample.date }), /Fecha/);
  assert.throws(() => run([sample.bookings[0], sample.bookings[0]]), /repetido/);
  assert.throws(() => run([{ ...sample.bookings[0], status: 'desconocido' }]), /Estado/);
});

test('No modifica los datos originales', () => {
  const input = structuredClone(sample);
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } };
  freeze(input);
  aggregateOperations(input.bookings, input.catalog, opts);
  assert.deepEqual(input, sample);
});
