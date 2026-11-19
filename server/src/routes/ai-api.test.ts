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
