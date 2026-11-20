// AI endpoints with a fake Claude client (§8.0, §11: AI calls are always mocked).
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { aiUnavailable, type StructuredLLM, type StructuredRequest } from '../ai/llm.ts';
import { createApp } from '../app.ts';
import { config } from '../config.ts';
import { createDb } from '../db/client.ts';
import { seed } from '../db/seed.ts';
import { loadCurrentUser, type CurrentUser } from '../middleware/current-user.ts';

const { db, pool } = createDb(config.TEST_DATABASE_URL);
let ana: CurrentUser;

/** A fake that records requests and returns a canned answer. */
function fakeLLM(answer: unknown | (() => unknown)) {
  const calls: StructuredRequest[] = [];
  const llm: StructuredLLM = {
    generate: async (req) => {
      calls.push(req);
      return typeof answer === 'function' ? (answer as () => unknown)() : answer;
    },
  };
  return { llm, calls };
}

const cond = (
  field: string,
  op: string,
  extra: Partial<{ values: string[]; numbers: number[]; dates: string[] }> = {},
) => ({
  field,
  op,
  values: [],
  numbers: [],
  dates: [],
  ...extra,
});

beforeAll(async () => {
  await seed(db, new Date('2026-11-19T12:00:00Z'));
  ana = await loadCurrentUser(db, 'ana');
});
afterAll(async () => {
  await pool.end();
});

describe('POST /api/ai/parse-filter', () => {
  it('turns Claude output into a validated FilterQuery and grounds the prompt', async () => {
    const { llm, calls } = fakeLLM({
      conditions: [
        cond('priority', 'isAnyOf', { values: ['urgent', 'high'] }),
        cond('tag', 'is', { values: ['bug'] }),
        cond('product', 'is', { values: ['Web App'] }),
        cond('assignee', 'is', { values: ['dana'] }),
        cond('estimate', 'between', { numbers: [1, 4] }),
        cond('createdAt', 'gte', { dates: ['2026-11-12'] }),
        cond('team', 'isEmpty'),
      ],
      search: '  login  ',
      sort: { field: 'updatedAt', dir: 'desc' },
      interpretation: 'Urgent or high bugs in Web App for Dana.',
    });
    const app = createApp({ db, currentUser: ana, llm });

    const res = await request(app)
      .post('/api/ai/parse-filter')
      .send({ text: 'urgent bugs in web app for dana' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      interpretation: 'Urgent or high bugs in Web App for Dana.',
      filter: {
        conditions: [
          { field: 'priority', op: 'isAnyOf', value: ['urgent', 'high'] },
          { field: 'tag', op: 'is', value: 'bug' },
          { field: 'product', op: 'is', value: 'Web App' },
          { field: 'assignee', op: 'is', value: 'dana' },
          { field: 'estimate', op: 'between', value: [1, 4] },
          { field: 'createdAt', op: 'gte', value: '2026-11-12' },
          { field: 'team', op: 'isEmpty' },
        ],
        search: 'login',
        sort: { field: 'updatedAt', dir: 'desc' },
      },
    });

    const call = calls[0]!;
    expect(call.feature).toBe('parse-filter');
    expect(call.system).toContain('Current user ("me"): ana (Ana Ruiz), team ENG');
    expect(call.system).toContain('dana: Dana Park, DES');
    expect(call.system).toContain('Web App');
    expect(call.user).toMatch(
      /^Today is \w+, \d{4}-\d{2}-\d{2}\.\nRequest: urgent bugs in web app for dana$/,
    );
    // Values are limited to known identifiers in the structured-output schema.
    const schema = JSON.stringify(call.schema);
    expect(schema).toContain('"me"');
    expect(schema).toContain('"Web App"');
    expect(schema).toContain('"in_review"');
  });

  it('keeps a request with no filter as a plain search', async () => {
    const { llm } = fakeLLM({
      conditions: [],
      search: 'pagination cursor',
      sort: null,
      interpretation: 'No filter found; searching for "pagination cursor".',
    });
    const res = await request(createApp({ db, currentUser: ana, llm }))
      .post('/api/ai/parse-filter')
      .send({ text: 'pagination cursor' });
    expect(res.status).toBe(200);
    expect(res.body.filter).toEqual({ conditions: [], search: 'pagination cursor' });
  });

  it.each([
    [
      'an unknown identifier',
      {
        conditions: [cond('assignee', 'is', { values: ['nobody'] })],
        search: null,
        sort: null,
        interpretation: 'x',
      },
    ],
    [
      'a between with one number',
      {
        conditions: [cond('estimate', 'between', { numbers: [3] })],
        search: null,
        sort: null,
        interpretation: 'x',
      },
    ],
    [
      'an operator the field lacks',
      {
        conditions: [cond('status', 'gt', { values: ['todo'] })],
        search: null,
        sort: null,
        interpretation: 'x',
      },
    ],
    ['a malformed response', { nope: true }],
  ])('returns 503 AI_UNAVAILABLE for %s', async (_label, answer) => {
    const { llm } = fakeLLM(answer);
    const res = await request(createApp({ db, currentUser: ana, llm }))
      .post('/api/ai/parse-filter')
      .send({ text: 'something' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_UNAVAILABLE');
  });

  it('passes through client failures (refusal, timeout) as 503', async () => {
    const { llm } = fakeLLM(() => {
      throw aiUnavailable('Claude declined this request.');
    });
    const res = await request(createApp({ db, currentUser: ana, llm }))
      .post('/api/ai/parse-filter')
      .send({ text: 'something' });
    expect(res.status).toBe(503);
    expect(res.body.error.message).toBe('Claude declined this request.');
  });

  it('returns 503 when no Claude client is configured', async () => {
    const res = await request(createApp({ db, currentUser: ana }))
      .post('/api/ai/parse-filter')
      .send({ text: 'my open bugs' });
    expect(res.status).toBe(503);
  });

  it.each([[''], ['   '], ['x'.repeat(301)]])('rejects text %# with 400', async (text) => {
    const { llm, calls } = fakeLLM({});
    const res = await request(createApp({ db, currentUser: ana, llm }))
      .post('/api/ai/parse-filter')
      .send({ text });
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

describe('POST /api/ai/estimate', () => {
  /** Fake that answers with the first `n` reference tasks it was offered. */
  function estimatingLLM(hours: number, n = 2) {
    const calls: StructuredRequest[] = [];
    const llm: StructuredLLM = {
      generate: async (req) => {
        calls.push(req);
        const items = (
          req.schema as { properties: { similarTaskIds: { items: { enum?: string[] } } } }
        ).properties.similarTaskIds.items;
        return {
          estimateHours: hours,
          rationale: '  Like the earlier login fixes.  ',
          similarTaskIds: (items.enum ?? []).slice(0, n),
        };
      },
    };
    return { llm, calls };
  }

  async function createTask(app: ReturnType<typeof createApp>) {
    const res = await request(app)
      .post('/api/tasks')
      .send({
        title: 'Fix login redirect loop',
        description: 'Users bounce between /login and /home after the session expires.',
        product: 'Web App',
        tags: ['bug'],
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  it('estimates a saved task from similar completed tasks', async () => {
    const { llm, calls } = estimatingLLM(3.2);
    const app = createApp({ db, currentUser: ana, llm });
    const id = await createTask(app);

    const res = await request(app).post('/api/ai/estimate').send({ taskId: id });
    expect(res.status).toBe(200);
    expect(res.body.estimateHours).toBe(3); // rounded to the 0.5 h step
    expect(res.body.rationale).toBe('Like the earlier login fixes.');
    expect(res.body.similarTasks).toHaveLength(2);
    for (const s of res.body.similarTasks) {
      expect(s).toEqual({
        id: expect.stringMatching(/^TSK-\d+$/),
        title: expect.any(String),
        estimateHours: expect.any(Number),
      });
    }

    const call = calls[0]!;
    expect(call.feature).toBe('estimate');
    expect(call.system).not.toContain('Fix login'); // task data stays out of the cached prompt
    expect(call.user).toContain('Title: Fix login redirect loop');
    expect(call.user).toContain('Product: Web App');
    expect(call.user).toContain('Tags: bug');
    // References: up to 12 done tasks with estimates, never the task itself.
    const offered = (
      call.schema as { properties: { similarTaskIds: { items: { enum: string[] } } } }
    ).properties.similarTaskIds.items.enum;
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.length).toBeLessThanOrEqual(12);
    expect(offered).not.toContain(id);
    const ref = await request(app).get(`/api/tasks/${offered[0]}`);
    expect(ref.body.status).toBe('done');
    expect(ref.body.estimateHours).not.toBeNull();
  });

  it('ranks tasks with the same product and tags first', async () => {
    const { llm, calls } = estimatingLLM(2);
    const app = createApp({ db, currentUser: ana, llm });
    await request(app)
      .post('/api/ai/estimate')
      .send({ draft: { title: 'zzqx', product: 'Web App', tags: ['bug'] } });
    const offered = (
      calls[0]!.schema as { properties: { similarTaskIds: { items: { enum: string[] } } } }
    ).properties.similarTaskIds.items.enum;
    const top = await request(app).get(`/api/tasks/${offered[0]}`);
    expect(top.body.product).toBe('Web App');
    expect(top.body.tags).toContain('bug');
  });

  it('accepts a draft and rejects unknown names in it', async () => {
    const { llm, calls } = estimatingLLM(8, 0);
    const app = createApp({ db, currentUser: ana, llm });
    const ok = await request(app)
      .post('/api/ai/estimate')
      .send({ draft: { title: 'Add CSV export to reports' } });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({
      estimateHours: 8,
      rationale: 'Like the earlier login fixes.',
      similarTasks: [],
    });

    const bad = await request(app)
      .post('/api/ai/estimate')
      .send({ draft: { title: 'x', tags: ['no-such-tag'] } });
    expect(bad.status).toBe(400);
    expect(calls).toHaveLength(1);
  });

  it('returns 404 for an unknown task and 400 for a bad body', async () => {
    const { llm, calls } = estimatingLLM(1);
    const app = createApp({ db, currentUser: ana, llm });
    expect(
      (await request(app).post('/api/ai/estimate').send({ taskId: 'TSK-999999' })).status,
    ).toBe(404);
    expect((await request(app).post('/api/ai/estimate').send({})).status).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/ai/estimate')
          .send({ taskId: 'TSK-1', draft: { title: 'x' } })
      ).status,
    ).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it.each([
    ['too small after rounding', { estimateHours: 0.2, rationale: 'x', similarTaskIds: [] }],
    ['too large', { estimateHours: 120, rationale: 'x', similarTaskIds: [] }],
    ['an unknown reference', { estimateHours: 4, rationale: 'x', similarTaskIds: ['TSK-999999'] }],
    ['a malformed response', { hours: 4 }],
  ])('returns 503 AI_UNAVAILABLE for %s', async (_label, answer) => {
    const { llm } = fakeLLM(answer);
    const res = await request(createApp({ db, currentUser: ana, llm }))
      .post('/api/ai/estimate')
      .send({ draft: { title: 'Something' } });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_UNAVAILABLE');
  });
});

describe('POST /api/ai/suggest-assignee', () => {
  type Schema = {
    properties: { suggestions: { items: { properties: { handle: { enum: string[] } } } } };
  };
  const offeredHandles = (req: StructuredRequest) =>
    (req.schema as Schema).properties.suggestions.items.properties.handle.enum;

  async function newTask(app: ReturnType<typeof createApp>, body: Record<string, unknown>) {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Speed up the reports API', ...body });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  it('ranks candidates from the task product and validates the answer', async () => {
    const { llm, calls } = fakeLLM(() => {
      const [a, b] = offeredHandles(calls[0]!);
      return {
        suggestions: [
          { handle: a, score: 91.6, reason: '  Did the last API perf work.  ' },
          { handle: a, score: 80, reason: 'duplicate' },
          { handle: b, score: 140, reason: 'Light load.' },
        ],
      };
    });
    const app = createApp({ db, currentUser: ana, llm });
    const id = await newTask(app, { product: 'API', tags: ['perf'] });

    const res = await request(app).post('/api/ai/suggest-assignee').send({ taskId: id });
    expect(res.status).toBe(200);
    const [a, b] = offeredHandles(calls[0]!);
    expect(res.body).toEqual({
      suggestions: [
        { handle: a, score: 92, reason: 'Did the last API perf work.' },
        { handle: b, score: 100, reason: 'Light load.' },
      ],
    });

    // Candidates: only people who worked on API tasks, sent with history and workload.
    const { rows } = await pool.query<{ handle: string }>(
      `select distinct u.handle from tasks t join users u on u.id = t.assignee_id
       join products p on p.id = t.product_id where p.name = 'API' order by 1`,
    );
    expect(offeredHandles(calls[0]!)).toEqual(rows.map((r) => r.handle));
    const call = calls[0]!;
    expect(call.feature).toBe('suggest-assignee');
    expect(call.system).not.toContain('reports API');
    expect(call.user).toContain('Title: Speed up the reports API');
    expect(call.user).toMatch(/Open workload: \d+ tasks, [\d.]+h estimated/);
    expect(call.user).toMatch(/- TSK-\d+: /);
  });

  it('falls back to all users when the task has no product', async () => {
    const { llm, calls } = fakeLLM(() => ({
      suggestions: [{ handle: offeredHandles(calls[0]!)[0], score: 50, reason: 'x' }],
    }));
    const app = createApp({ db, currentUser: ana, llm });
    const id = await newTask(app, {});
    expect((await request(app).post('/api/ai/suggest-assignee').send({ taskId: id })).status).toBe(
      200,
    );
    const { rows } = await pool.query<{ n: number }>('select count(*)::int as n from users');
    expect(offeredHandles(calls[0]!)).toHaveLength(rows[0]!.n);
  });

  it('refuses assigned tasks (409), unknown tasks (404) and bad bodies (400)', async () => {
    const { llm, calls } = fakeLLM({});
    const app = createApp({ db, currentUser: ana, llm });
    const assigned = await newTask(app, { assignee: 'dana' });
    const res = await request(app).post('/api/ai/suggest-assignee').send({ taskId: assigned });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(
      (await request(app).post('/api/ai/suggest-assignee').send({ taskId: 'TSK-999999' })).status,
    ).toBe(404);
    expect((await request(app).post('/api/ai/suggest-assignee').send({})).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it.each([
    ['only unknown handles', { suggestions: [{ handle: 'nobody', score: 90, reason: 'x' }] }],
    ['no suggestions', { suggestions: [] }],
    ['a malformed response', { people: ['dana'] }],
  ])('returns 503 AI_UNAVAILABLE for %s', async (_label, answer) => {
    const { llm } = fakeLLM(answer);
    const app = createApp({ db, currentUser: ana, llm });
    const id = await newTask(app, {});
    const res = await request(app).post('/api/ai/suggest-assignee').send({ taskId: id });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_UNAVAILABLE');
  });
});
