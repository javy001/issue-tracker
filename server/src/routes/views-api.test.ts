// Saved views API (§6.2 v1.8, §11).
import type { SavedViewDto } from '@tracker/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { config } from '../config.ts';
import { createDb } from '../db/client.ts';
import { seed } from '../db/seed.ts';
import { loadCurrentUser } from '../middleware/current-user.ts';

const { db, pool } = createDb(config.TEST_DATABASE_URL);
let ana: ReturnType<typeof createApp>;
let ben: ReturnType<typeof createApp>;

beforeAll(async () => {
  await seed(db, new Date('2026-11-19T12:00:00Z'));
  ana = createApp({ db, currentUser: await loadCurrentUser(db, 'ana') });
  ben = createApp({ db, currentUser: await loadCurrentUser(db, 'ben') });
});
afterAll(async () => {
  await pool.end();
});

const urgentBugs = {
  conditions: [
    { field: 'priority', op: 'isAnyOf', value: ['urgent', 'high'] },
    { field: 'tag', op: 'is', value: 'bug' },
  ],
  sort: { field: 'updatedAt', dir: 'desc' },
};

describe('saved views', () => {
  let created: SavedViewDto;

  it('lists only my seeded views, with normalized filters', async () => {
    const res = await request(ana).get('/api/views');
    expect(res.status).toBe(200);
    const names = (res.body as SavedViewDto[]).map((v) => v.name);
    expect(names).toEqual(['My open tasks', 'Unassigned · needs owner', 'Urgent bugs · Web App']);
    expect((res.body as SavedViewDto[])[0]!.display).toEqual({ layout: 'list' });
  });

  it('creates a view and its filter runs', async () => {
    const res = await request(ana)
      .post('/api/views')
      .send({ name: '  Hot bugs  ', filter: urgentBugs, display: { layout: 'board' } });
    expect(res.status).toBe(201);
    created = res.body;
    expect(created).toMatchObject({ name: 'Hot bugs', display: { layout: 'board' } });
    expect(created.filter.sort).toEqual({ field: 'updatedAt', dir: 'desc' });

    const list = await request(ana).get(
      `/api/tasks?filter=${encodeURIComponent(JSON.stringify(created.filter))}`,
    );
    expect(list.status).toBe(200);
    expect(list.body.total).toBeGreaterThan(0);
  });

  it('renames, re-filters and changes layout', async () => {
    const res = await request(ana)
      .patch(`/api/views/${created.id}`)
      .send({
        name: 'Hot bugs (all)',
        filter: { conditions: [{ field: 'tag', op: 'is', value: 'bug' }] },
        display: { layout: 'list' },
      });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Hot bugs (all)', display: { layout: 'list' } });
    expect(res.body.filter.conditions).toHaveLength(1);
  });

  it("hides other users' views", async () => {
    expect((await request(ben).get(`/api/views/${created.id}`)).status).toBe(404);
    expect((await request(ben).patch(`/api/views/${created.id}`).send({ name: 'x' })).status).toBe(
      404,
    );
    expect((await request(ben).delete(`/api/views/${created.id}`)).status).toBe(404);
    const bens = (await request(ben).get('/api/views')).body as SavedViewDto[];
    expect(bens.some((v) => v.id === created.id)).toBe(false);
  });

  it.each([
    ['a blank name', { name: '  ', filter: urgentBugs }],
    [
      'an invalid operator',
      { name: 'x', filter: { conditions: [{ field: 'status', op: 'gt', value: 'todo' }] } },
    ],
    [
      'an unknown tag',
      { name: 'x', filter: { conditions: [{ field: 'tag', op: 'is', value: 'nope' }] } },
    ],
    ['an unknown layout', { name: 'x', filter: urgentBugs, display: { layout: 'grid' } }],
    ['extra fields', { name: 'x', filter: urgentBugs, ownerId: 'someone' }],
  ])('rejects %s with 400', async (_label, body) => {
    const res = await request(ana).post('/api/views').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('deletes a view', async () => {
    expect((await request(ana).delete(`/api/views/${created.id}`)).status).toBe(204);
    expect((await request(ana).get(`/api/views/${created.id}`)).status).toBe(404);
  });

  it('returns 404 for malformed ids', async () => {
    expect((await request(ana).get('/api/views/not-a-uuid')).status).toBe(404);
  });
});
