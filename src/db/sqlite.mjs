import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const dataDirectory = resolve(process.env.DATA_DIR || './data');
export const databasePath = join(dataDirectory, 'agenda.sqlite');
const instanceKey = Symbol.for('agenda.local.sqlite');

export function openDatabase() {
  if (globalThis[instanceKey]) return globalThis[instanceKey];
  mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA busy_timeout=10000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;');
  const directory = resolve(process.env.MIGRATIONS_DIR || './drizzle');
  const journal = JSON.parse(readFileSync(join(directory, 'meta/_journal.json'), 'utf8'));
  database.exec('BEGIN IMMEDIATE');
  try {
    database.exec('CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)');
    for (const entry of journal.entries) {
      const name = `${entry.tag}.sql`;
      const sql = readFileSync(join(directory, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const applied = database.prepare('SELECT checksum FROM _local_migrations WHERE name=?').get(name);
      if (applied && applied.checksum !== checksum) throw new Error(`La migración aplicada ${name} fue modificada.`);
      if (!applied) {
        database.exec(sql);
        database.prepare('INSERT INTO _local_migrations VALUES(?,?,?)').run(name, checksum, new Date().toISOString());
      }
    }
    database.exec('COMMIT');
  } catch (error) { database.exec('ROLLBACK'); database.close(); throw error; }
  globalThis[instanceKey] = database;
  return database;
}

export function setupCode() {
  mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
  const path = join(dataDirectory, '.setup-code');
  if (!existsSync(path)) {
    try { writeFileSync(path, randomBytes(24).toString('hex'), { mode: 0o600, flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  return readFileSync(path, 'utf8').trim();
}
export function validSetupCode(input) {
  if (typeof input !== 'string') return false;
  const expected = Buffer.from(setupCode());
  const actual = Buffer.from(input.trim());
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export async function backupDatabase(destination) {
  const path = resolve(destination);
  if (path === databasePath || existsSync(path)) throw new Error('El destino ya existe. Elige un archivo nuevo.');
  await backup(openDatabase(), path);
  const copy = new DatabaseSync(path, { readOnly: true });
  try {
    if (copy.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('El respaldo no pasó la verificación.');
  } finally { copy.close(); }
  return path;
}
