import { sql } from 'drizzle-orm';
import express from 'express';
import type { Db } from './db/client.ts';
import { errorHandler, notFoundHandler } from './middleware/error-handler.ts';

export interface AppDeps {
  db: Db;
}

// Exported separately from index.ts so tests can mount it with Supertest.
export function createApp({ db }: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', async (_req, res) => {
    await db.execute(sql`select 1`);
    res.json({ status: 'ok' });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
