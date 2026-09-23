import { openDatabase } from './sqlite.mjs';
type Result = { results: any[]; success: boolean; meta?: { changes: number } };
class Query {
  constructor(readonly sql: string, readonly parameters: any[] = []) {}
  bind(...parameters: any[]) { return new Query(this.sql, parameters); }
  private statement() { return openDatabase().prepare(this.sql); }
  async first<T = any>(): Promise<T | null> { return this.statement().get(...this.parameters) as T || null; }
  async all(): Promise<Result> { return { results: this.statement().all(...this.parameters), success: true }; }
  async run(): Promise<Result> { return this.execute(); }
  execute(): Result {
    const statement = this.statement();
    if (statement.columns().length) return { results: statement.all(...this.parameters), success: true };
    const result = statement.run(...this.parameters);
    return { results: [], success: true, meta: { changes: Number(result.changes) } };
  }
}
const adapter = {
  prepare(sql: string) { return new Query(sql); },
  async batch(queries: Query[]): Promise<Result[]> {
    const database = openDatabase();
    database.exec('BEGIN IMMEDIATE');
    try {
      const result = queries.map(query => query.execute());
      database.exec('COMMIT');
      return result;
    } catch (error) { database.exec('ROLLBACK'); throw error; }
  },
};
export function db() { openDatabase(); return adapter; }
