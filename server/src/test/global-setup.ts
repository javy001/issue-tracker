// Recreates the test database schema from the committed migrations before the test run.
import { sql } from 'drizzle-orm';
import { config } from '../config.ts';
import { createDb } from '../db/client.ts';
import { runMigrations } from '../db/migrate.ts';

export default async function setup() {
  const { db, pool } = createDb(config.TEST_DATABASE_URL);
  try {
    await db.execute(sql`drop schema if exists public cascade`);
    await db.execute(sql`drop schema if exists drizzle cascade`);
    await db.execute(sql`create schema public`);
    await runMigrations(db);
  } finally {
    await pool.end();
  }
}
