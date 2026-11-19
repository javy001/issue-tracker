// API integration tests (§11): reference data, task CRUD, list/filter/search/pagination, errors.
import type { ListTasksResponse, TaskDetailDto, TaskDto } from '@tracker/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { config } from '../config.ts';
import { createDb } from '../db/client.ts';
import { seed } from '../db/seed.ts';
import { loadCurrentUser } from '../middleware/current-user.ts';

const { db, pool } = createDb(config.TEST_DATABASE_URL);
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  await seed(db, new Date('2026-11-19T12:00:00Z'));
  app = createApp({ db, currentUser: await loadCurrentUser(db, 'ana') });
});
afterAll(async () => {
  await pool.end();
});

const listUrl = (filter?: object, extra = '') =>
  `/api/tasks?${filter ? `filter=${encodeURIComponent(JSON.stringify(filter))}` : ''}${extra}`;

describe('reference data', () => {
  it('returns the current user without internal ids', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      handle: 'ana',
      name: 'Ana Ruiz',
      avatarColor: '#7C4DCC',
      team: 'ENG',
    });
  });

  it('lists users with their team, plus teams, products and tags', async () => {
    const [users, teams, products, tags] = await Promise.all([
      request(app).get('/api/users'),
      request(app).get('/api/teams'),
      request(app).get('/api/products'),
      request(app).get('/api/tags'),
    ]);
    expect(users.body).toContainEqual({
      handle: 'dana',
      name: 'Dana Park',
      avatarColor: '#2F64C8',
      team: 'DES',
    });
    expect(teams.body.map((t: { key: string }) => t.key).sort()).toEqual(['DES', 'ENG', 'PLT']);
    expect(products.body).toEqual([{ name: 'API' }, { name: 'Mobile' }, { name: 'Web App' }]);
    expect(tags.body).toContainEqual({ name: 'bug', color: '#E5534B' });
  });

  it('creates tags, rejecting duplicates and bad input', async () => {
    const created = await request(app)
      .post('/api/tags')
      .send({ name: 'Billing', color: '#123456' });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ name: 'billing', color: '#123456' });

    const dup = await request(app).post('/api/tags').send({ name: 'billing', color: '#123456' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('CONFLICT');

    const bad = await request(app).post('/api/tags').send({ name: 'has spaces', color: 'red' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/tasks', () => {
  it('returns the first page, a cursor and the total', async () => {
    const res = await request(app).get(listUrl());
    const body = res.body as ListTasksResponse;
    expect(res.status).toBe(200);
    expect(body.items).toHaveLength(50);
    expect(body.total).toBeGreaterThan(450);
    expect(body.nextCursor).toEqual(expect.any(String));
    expect(body.items[0]!.priority).toBe('urgent');
    expect(body.items[0]!.id).toMatch(/^TSK-\d+$/);
  });

  it('follows cursors to the end', async () => {
    const seen = new Set<string>();
    let url = listUrl(undefined, '&limit=120');
    let total = 0;
    for (let guard = 0; guard < 10; guard++) {
      const body = (await request(app).get(url)).body as ListTasksResponse;
      total = body.total;
      body.items.forEach((t) => seen.add(t.id));
      if (!body.nextCursor) break;
      url = listUrl(undefined, `&limit=120&cursor=${encodeURIComponent(body.nextCursor)}`);
    }
    expect(seen.size).toBe(total);
  });

  it('filters, and reports the filtered total', async () => {
    const filter = {
      conditions: [
        { field: 'assignee', op: 'is', value: 'me' },
        { field: 'status', op: 'isNoneOf', value: ['done', 'canceled'] },
      ],
    };
    const body = (await request(app).get(listUrl(filter, '&limit=200'))).body as ListTasksResponse;
    expect(body.total).toBe(body.items.length);
    expect(
      body.items.every((t) => t.assignee === 'ana' && !['done', 'canceled'].includes(t.status)),
    ).toBe(true);
  });

  it.each([
    ['malformed filter JSON', '/api/tasks?filter=%7Bnope'],
    ['unknown operator', listUrl({ conditions: [{ field: 'status', op: 'gt', value: 'todo' }] })],
    ['unknown user', listUrl({ conditions: [{ field: 'assignee', op: 'is', value: 'nobody' }] })],
    ['limit too large', listUrl(undefined, '&limit=500')],
    ['garbage cursor', listUrl(undefined, '&cursor=abc')],
  ])('rejects %s with 400', async (_label, url) => {
    const res = await request(app).get(url);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a cursor from a different sort', async () => {
    const first = (await request(app).get(listUrl())).body as ListTasksResponse;
    const res = await request(app).get(
      listUrl(
        { sort: { field: 'createdAt', dir: 'asc' } },
        `&cursor=${encodeURIComponent(first.nextCursor!)}`,
      ),
    );
    expect(res.status).toBe(400);
  });
});

describe('task CRUD', () => {
  let created: TaskDetailDto;

  it('creates a task with the next global number', async () => {
    const before = (await request(app).get(listUrl(undefined, '&limit=1')))
      .body as ListTasksResponse;
    const res = await request(app)
      .post('/api/tasks')
      .send({
        title: '  Add dark mode toggle  ',
        priority: 'high',
        assignee: 'ben',
        product: 'Web App',
        tags: ['feature', 'design'],
        estimateHours: 3,
      });
    expect(res.status).toBe(201);
    created = res.body;
    expect(created).toMatchObject({
      id: `TSK-${before.total + 1}`,
      title: 'Add dark mode toggle',
      status: 'backlog',
      priority: 'high',
      assignee: 'ben',
      product: 'Web App',
      tags: ['design', 'feature'],
      estimateHours: 3,
      estimateSource: 'manual',
      createdBy: 'ana',
    });
    expect(res.headers.location).toBe(`/api/tasks/${created.id}`);
    expect(created.activity.map((a) => a.kind)).toEqual(['created']);
  });

  it('reads a task by display ID (case-insensitive)', async () => {
    const res = await request(app).get(`/api/tasks/${created.id.toLowerCase()}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.id);
  });

  it('updates fields and records activity', async () => {
    const res = await request(app)
      .patch(`/api/tasks/${created.id}`)
      .send({
        status: 'in_progress',
        assignee: 'chen',
        assigneeSource: 'ai',
        estimateHours: 4.5,
        estimateSource: 'ai',
        tags: ['feature'],
        title: 'Add a dark mode toggle',
      });
    expect(res.status).toBe(200);
    const task = res.body as TaskDetailDto;
    expect(task).toMatchObject({
      status: 'in_progress',
      assignee: 'chen',
      estimateHours: 4.5,
      estimateSource: 'ai',
      tags: ['feature'],
      title: 'Add a dark mode toggle',
    });
    expect(new Date(task.updatedAt).getTime()).toBeGreaterThan(
      new Date(created.updatedAt).getTime(),
    );
    const kinds = task.activity.map((a) => a.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        'created',
        'edited',
        'status_changed',
        'assigned',
        'estimated',
        'tags_changed',
      ]),
    );
    const assigned = task.activity.find((a) => a.kind === 'assigned')!;
    expect(assigned.payload).toEqual({ from: 'ben', to: 'chen', source: 'ai' });
    expect(assigned.actor).toBe('ana');
  });

  it('treats an unchanged patch as a no-op', async () => {
    const before = ((await request(app).get(`/api/tasks/${created.id}`)).body as TaskDetailDto)
      .activity.length;
    const res = await request(app)
      .patch(`/api/tasks/${created.id}`)
      .send({ status: 'in_progress' });
    expect(res.status).toBe(200);
    expect((res.body as TaskDetailDto).activity).toHaveLength(before);
  });

  it('clears the estimate and its source together', async () => {
    const res = await request(app).patch(`/api/tasks/${created.id}`).send({ estimateHours: null });
    expect(res.body).toMatchObject({ estimateHours: null, estimateSource: null });
  });

  it.each([
    ['an empty body', {}],
    ['an estimate off the 0.5 h grid', { estimateHours: 2.2 }],
    ['an estimate over 80 h', { estimateHours: 81 }],
    ['an unknown assignee', { assignee: 'nobody' }],
    ['an unknown tag', { tags: ['nope'] }],
    ['an unknown field', { teamId: 'x' }],
    ['a blank title', { title: '   ' }],
  ])('rejects %s with 400', async (_label, body) => {
    const res = await request(app).patch(`/api/tasks/${created.id}`).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('deletes the task', async () => {
    expect((await request(app).delete(`/api/tasks/${created.id}`)).status).toBe(204);
    expect((await request(app).get(`/api/tasks/${created.id}`)).status).toBe(404);
    expect((await request(app).delete(`/api/tasks/${created.id}`)).status).toBe(404);
  });

  it('returns 404 for malformed and missing IDs', async () => {
    for (const id of ['ENG-1', 'TSK-999999', 'banana']) {
      const res = await request(app).get(`/api/tasks/${id}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
  });

  it('allows tasks with no product or assignee', async () => {
    const res = await request(app).post('/api/tasks').send({ title: 'Loose end' });
    expect(res.status).toBe(201);
    expect(res.body as TaskDto).toMatchObject({
      product: null,
      assignee: null,
      tags: [],
      estimateHours: null,
    });
  });
});
