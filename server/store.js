import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { readFileSync } from 'node:fs';
export const emptyState = () => ({
  version: 1,
  organizations: [],
  users: [],
  sessions: [],
  oauth: [],
});
export class Store {
  constructor({ url = process.env.DATABASE_URL, dir = process.env.DATA_DIR || '.local' } = {}) {
    this.dir = dir;
    this.queue = Promise.resolve();
    this.pool = url
      ? new pg.Pool({
          connectionString: url,
          max: Number(process.env.DATABASE_POOL_SIZE || 5),
          connectionTimeoutMillis: 15000,
          ...(process.env.DATABASE_SSL_CA_FILE || process.env.DATABASE_SSL_CA
            ? {
                ssl: {
                  ca: process.env.DATABASE_SSL_CA || readFileSync(process.env.DATABASE_SSL_CA_FILE, 'utf8'),
                  rejectUnauthorized: true,
                },
              }
            : {}),
        })
      : null;
  }
  async init() {
    if (this.pool) {
      await this.pool.query('CREATE SCHEMA IF NOT EXISTS moaplan_private');
      await this.pool.query('REVOKE ALL ON SCHEMA moaplan_private FROM PUBLIC');
      await this.pool.query(
        'CREATE TABLE IF NOT EXISTS moaplan_private.moaplan_state (id integer PRIMARY KEY CHECK(id=1), data jsonb NOT NULL)',
      );
      await this.pool.query('ALTER TABLE moaplan_private.moaplan_state ENABLE ROW LEVEL SECURITY');
      await this.pool.query('REVOKE ALL ON moaplan_private.moaplan_state FROM PUBLIC');
      for (const role of ['anon', 'authenticated']) {
        const { rows } = await this.pool.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role]);
        if (rows.length) {
          await this.pool.query(`REVOKE ALL ON SCHEMA moaplan_private FROM ${role}`);
          await this.pool.query(`REVOKE ALL ON moaplan_private.moaplan_state FROM ${role}`);
        }
      }
      await this.pool.query(
        'INSERT INTO moaplan_private.moaplan_state VALUES (1,$1) ON CONFLICT DO NOTHING',
        [emptyState()],
      );
    } else {
      await fs.mkdir(this.dir, { recursive: true });
      try {
        await fs.access(path.join(this.dir, 'state.json'));
      } catch {
        await fs.writeFile(path.join(this.dir, 'state.json'), JSON.stringify(emptyState()));
      }
    }
  }
  async transact(fn) {
    if (this.pool) {
      const c = await this.pool.connect();
      try {
        await c.query('BEGIN');
        const { rows } = await c.query(
          'SELECT data FROM moaplan_private.moaplan_state WHERE id=1 FOR UPDATE',
        );
        const state = rows[0].data;
        const result = await fn(state);
        await c.query('UPDATE moaplan_private.moaplan_state SET data=$1 WHERE id=1', [state]);
        await c.query('COMMIT');
        return structuredClone(result);
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    }
    const task = this.queue.then(async () => {
      const file = path.join(this.dir, 'state.json');
      const state = JSON.parse(await fs.readFile(file, 'utf8'));
      const result = await fn(state);
      await fs.writeFile(file + '.tmp', JSON.stringify(state));
      for (let attempt = 0; ; attempt++) {
        try {
          await fs.rename(file + '.tmp', file);
          break;
        } catch (e) {
          if (!['EPERM', 'EACCES', 'EBUSY'].includes(e.code) || attempt >= 12) throw e;
          await new Promise((r) => setTimeout(r, 30 * (attempt + 1)));
        }
      }
      return structuredClone(result);
    });
    this.queue = task.catch(() => {});
    return task;
  }
  async read(fn) {
    if (this.pool) {
      const { rows } = await this.pool.query(
        'SELECT data FROM moaplan_private.moaplan_state WHERE id=1',
      );
      return structuredClone(fn(rows[0].data));
    }
    await this.queue;
    return structuredClone(
      fn(JSON.parse(await fs.readFile(path.join(this.dir, 'state.json'), 'utf8'))),
    );
  }
  async close() {
    await this.pool?.end();
  }
}
