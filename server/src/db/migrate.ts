import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import type { Db } from './client.ts';

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

// Applies the committed drizzle-kit migrations (used by db:reset and the test setup).
export async function runMigrations(db: Db) {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
