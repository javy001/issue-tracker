import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { config } from './config.ts';
import { createDb } from './db/client.ts';

// Runs against the test database (docker compose service `postgres-test`).
const { db, pool } = createDb(config.TEST_DATABASE_URL);
const app = createApp({ db });

afterAll(async () => {
  await pool.end();
});

describe('app scaffold', () => {
  it('reports health when the database is reachable', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('returns the standard error format for unknown routes', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects malformed JSON with VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('content-type', 'application/json')
      .send('{"oops"');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
