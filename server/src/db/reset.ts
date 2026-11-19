// `npm run db:reset`: drop everything, re-apply migrations, re-seed (design doc §10).
import { sql } from 'drizzle-orm';
import { config } from '../config.ts';
import { createDb } from './client.ts';
import { runMigrations } from './migrate.ts';
import { seed } from './seed.ts';

const host = new URL(config.DATABASE_URL).hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`Refusing to reset a non-local database (${host}).`);
  process.exit(1);
}

const { db, pool } = createDb(config.DATABASE_URL);
try {
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`create schema public`);
  await runMigrations(db);
  const result = await seed(db);
  console.log(`Database reset: migrations applied, ${result.tasks} tasks seeded.`);
} finally {
  await pool.end();
}
