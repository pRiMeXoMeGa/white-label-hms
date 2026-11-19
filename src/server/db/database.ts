import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { migrate } from './migrations';

export type Params = Record<string, SQLInputValue> | SQLInputValue[];

/**
 * Thin wrapper over node:sqlite. SQLite allows a single writer, so `BEGIN IMMEDIATE`
 * transactions are serialised: two guests can never both pass an availability check
 * and book the same room-night. The room_nights primary key is the final safety net.
 */
export class Db {
  readonly raw: DatabaseSync;
  private depth = 0;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.raw = new DatabaseSync(path);
    this.raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    migrate(this);
  }

  exec(sql: string) {
    this.raw.exec(sql);
  }

  run(sql: string, params: Params = []) {
    const stmt = this.raw.prepare(sql);
    const res = Array.isArray(params) ? stmt.run(...params) : stmt.run(params);
    return { changes: Number(res.changes), lastId: Number(res.lastInsertRowid) };
  }

  get<T>(sql: string, params: Params = []): T | undefined {
    const stmt = this.raw.prepare(sql);
    return (Array.isArray(params) ? stmt.get(...params) : stmt.get(params)) as T | undefined;
  }

  all<T>(sql: string, params: Params = []): T[] {
    const stmt = this.raw.prepare(sql);
    return (Array.isArray(params) ? stmt.all(...params) : stmt.all(params)) as T[];
  }

  /** Runs fn atomically; nested calls become savepoints. */
  tx<T>(fn: () => T): T {
    const name = `sp${this.depth}`;
    this.raw.exec(this.depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${name}`);
    this.depth++;
    try {
      const result = fn();
      this.depth--;
      this.raw.exec(this.depth === 0 ? 'COMMIT' : `RELEASE ${name}`);
      return result;
    } catch (err) {
      this.depth--;
      this.raw.exec(this.depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${name}; RELEASE ${name}`);
      throw err;
    }
  }

  close() {
    this.raw.close();
  }
}

export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed|PRIMARY KEY/i.test(err.message);
}
