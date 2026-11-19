import { sql } from 'drizzle-orm';
import express from 'express';
import { disabledLLM, type StructuredLLM } from './ai/llm.ts';
import type { Db } from './db/client.ts';
import { currentUserMiddleware, type CurrentUser } from './middleware/current-user.ts';
import { errorHandler, notFoundHandler } from './middleware/error-handler.ts';
import { aiRouter } from './routes/ai.ts';
import { referenceRouter } from './routes/reference.ts';
import { tasksRouter } from './routes/tasks.ts';
import { viewsRouter } from './routes/views.ts';

export interface AppDeps {
  db: Db;
  currentUser: CurrentUser;
  /** Claude client (§8); AI endpoints return AI_UNAVAILABLE without one. */
  llm?: StructuredLLM;
}

// Exported separately from index.ts so tests can mount it with Supertest.
export function createApp({ db, currentUser, llm = disabledLLM }: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', async (_req, res) => {
    await db.execute(sql`select 1`);
    res.json({ status: 'ok' });
  });

  app.use('/api', currentUserMiddleware(currentUser));
  app.use('/api', referenceRouter(db));
  app.use('/api/tasks', tasksRouter(db));
  app.use('/api/views', viewsRouter(db));
  app.use('/api/ai', aiRouter(db, llm));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
