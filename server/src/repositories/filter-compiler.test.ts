// Filter compiler (§6.1, required by §11): for every field/operator, the SQL result must equal a
// plain TypeScript reference implementation evaluated over all seeded tasks.
import type { Condition, FilterQueryInput, TaskDto } from '@tracker/shared';
import { filterQuerySchema } from '@tracker/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../config.ts';
import { createDb } from '../db/client.ts';
import { seed } from '../db/seed.ts';
import { loadCurrentUser, type CurrentUser } from '../middleware/current-user.ts';
import { listTaskPage } from '../services/task-service.ts';
import { listUsers } from './reference-repo.ts';

const NOW = new Date('2026-11-19T12:00:00Z');
const { db, pool } = createDb(config.TEST_DATABASE_URL);
let me: CurrentUser;
let all: TaskDto[];
let teamOf: Map<string, string | null>;

async function fetchAll(input: FilterQueryInput): Promise<TaskDto[]> {
  const filter = filterQuerySchema.parse(input);
  const items: TaskDto[] = [];
  let cursor: string | undefined;
  for (let guard = 0; guard < 20; guard++) {
    const page = await listTaskPage(db, me, filter, cursor, 200);
    items.push(...page.items);
    if (!page.nextCursor) return items;
    cursor = page.nextCursor;
  }
  throw new Error('pagination did not terminate');
}

const DAY = 24 * 60 * 60 * 1000;
function dayEnd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s).getTime() + DAY : new Date(s).getTime();
}

/** Reference semantics, written independently of the SQL compiler. */
function matches(t: TaskDto, c: Condition): boolean {
  const list = (v: unknown) => (Array.isArray(v) ? v : [v]) as string[];
  const setOp = (actual: string | null, op: string, value: unknown) => {
    const vals = list(value);
    if (op === 'is') return actual === vals[0];
    if (op === 'isNot') return actual !== vals[0];
    if (op === 'isAnyOf') return actual !== null && vals.includes(actual);
    return actual === null || !vals.includes(actual); // isNoneOf
  };
  const resolveMe = (v: unknown) => list(v).map((h) => (h === 'me' ? me.handle : h));

  switch (c.field) {
    case 'status':
      return setOp(t.status, c.op, c.value);
    case 'priority':
      return setOp(t.priority, c.op, c.value);
    case 'assignee':
      if (!('value' in c)) return c.op === 'isEmpty' ? t.assignee === null : t.assignee !== null;
      return setOp(
        t.assignee,
        c.op,
        Array.isArray(c.value) ? resolveMe(c.value) : resolveMe(c.value)[0],
      );
    case 'team': {
      const team = t.assignee ? (teamOf.get(t.assignee) ?? null) : null;
      if (!('value' in c)) return c.op === 'isEmpty' ? team === null : team !== null;
      return setOp(team, c.op, c.value);
    }
    case 'product':
      if (!('value' in c)) return c.op === 'isEmpty' ? t.product === null : t.product !== null;
      return setOp(t.product, c.op, c.value);
    case 'tag': {
      if (!('value' in c)) return c.op === 'isEmpty' ? t.tags.length === 0 : t.tags.length > 0;
      const vals = list(c.value);
      const has = t.tags.some((g) => vals.includes(g));
      return c.op === 'is' || c.op === 'isAnyOf' ? has : !has;
    }
    case 'estimate': {
      const e = t.estimateHours;
      if (!('value' in c)) return c.op === 'isEmpty' ? e === null : e !== null;
      if (e === null) return false;
      if (c.op === 'between') return e >= c.value[0] && e <= c.value[1];
      return {
        is: e === c.value,
        lt: e < c.value,
        lte: e <= c.value,
        gt: e > c.value,
        gte: e >= c.value,
      }[c.op];
    }
    case 'createdAt':
    case 'updatedAt': {
      const at = new Date(c.field === 'createdAt' ? t.createdAt : t.updatedAt).getTime();
      if (c.op === 'between')
        return at >= new Date(c.value[0]).getTime() && at < dayEnd(c.value[1]);
      const v = c.value;
      return {
        lt: at < new Date(v).getTime(),
        lte: at < dayEnd(v),
        gt: at >= dayEnd(v),
        gte: at >= new Date(v).getTime(),
      }[c.op];
    }
  }
}

beforeAll(async () => {
  await seed(db, NOW);
  me = await loadCurrentUser(db, 'ana');
  all = await fetchAll({});
  teamOf = new Map((await listUsers(db)).map((u) => [u.handle, u.team]));
});
afterAll(async () => {
  await pool.end();
});

const CASES: Condition[] = [
  { field: 'status', op: 'is', value: 'todo' },
  { field: 'status', op: 'isNot', value: 'done' },
  { field: 'status', op: 'isAnyOf', value: ['in_progress', 'in_review'] },
  { field: 'status', op: 'isNoneOf', value: ['done', 'canceled'] },
  { field: 'priority', op: 'isAnyOf', value: ['urgent', 'high'] },
  { field: 'assignee', op: 'is', value: 'me' },
  { field: 'assignee', op: 'isNot', value: 'ben' },
  { field: 'assignee', op: 'isAnyOf', value: ['ben', 'me'] },
  { field: 'assignee', op: 'isNoneOf', value: ['ana', 'gus'] },
  { field: 'assignee', op: 'isEmpty' },
  { field: 'assignee', op: 'isNotEmpty' },
  { field: 'team', op: 'is', value: 'ENG' },
  { field: 'team', op: 'isNot', value: 'ENG' },
  { field: 'team', op: 'isAnyOf', value: ['DES', 'PLT'] },
  { field: 'team', op: 'isEmpty' },
  { field: 'product', op: 'is', value: 'Web App' },
  { field: 'product', op: 'isNoneOf', value: ['API'] },
  { field: 'product', op: 'isEmpty' },
  { field: 'tag', op: 'is', value: 'bug' },
  { field: 'tag', op: 'isNot', value: 'bug' },
  { field: 'tag', op: 'isAnyOf', value: ['a11y', 'perf'] },
  { field: 'tag', op: 'isNoneOf', value: ['bug', 'feature'] },
  { field: 'tag', op: 'isEmpty' },
  { field: 'estimate', op: 'is', value: 2 },
  { field: 'estimate', op: 'gte', value: 8 },
  { field: 'estimate', op: 'between', value: [1, 3] },
  { field: 'estimate', op: 'isEmpty' },
  { field: 'createdAt', op: 'gte', value: '2026-10-01' },
  { field: 'createdAt', op: 'lte', value: '2026-09-15' },
  { field: 'createdAt', op: 'between', value: ['2026-09-01', '2026-09-30'] },
  { field: 'updatedAt', op: 'gt', value: '2026-11-01' },
  { field: 'updatedAt', op: 'lt', value: '2026-08-15T00:00:00Z' },
];

describe('filter compiler', () => {
  it('starts from the full seed', () => {
    expect(all.length).toBeGreaterThan(450);
    expect(new Set(all.map((t) => t.id)).size).toBe(all.length); // pagination: no duplicates
  });

  it.each(
    CASES.map(
      (c) => [`${c.field} ${c.op} ${JSON.stringify('value' in c ? c.value : '')}`, c] as const,
    ),
  )('%s matches the reference semantics', async (_label, condition) => {
    const expected = all
      .filter((t) => matches(t, condition))
      .map((t) => t.id)
      .sort();
    const actual = (await fetchAll({ conditions: [condition] })).map((t) => t.id).sort();
    expect(expected.length).toBeGreaterThan(0); // every case must exercise real data
    expect(actual).toEqual(expected);
  });

  it('AND-s several conditions together', async () => {
    const conditions: Condition[] = [
      { field: 'priority', op: 'isAnyOf', value: ['urgent', 'high'] },
      { field: 'tag', op: 'is', value: 'bug' },
      { field: 'product', op: 'is', value: 'Web App' },
    ];
    const expected = all
      .filter((t) => conditions.every((c) => matches(t, c)))
      .map((t) => t.id)
      .sort();
    const actual = (await fetchAll({ conditions })).map((t) => t.id).sort();
    expect(actual).toEqual(expected);
    expect(actual).toContain(
      all.find((t) => t.title === 'Login redirect loops after session expires')!.id,
    );
  });

  it.each([
    ['priority desc (default)', undefined],
    ['priority asc', { field: 'priority', dir: 'asc' }],
    ['updatedAt desc', { field: 'updatedAt', dir: 'desc' }],
    ['createdAt asc', { field: 'createdAt', dir: 'asc' }],
    ['estimate desc', { field: 'estimate', dir: 'desc' }],
  ] as const)('paginates %s without gaps or duplicates', async (_label, sort) => {
    const items = await fetchAll(sort ? { sort } : {});
    expect(items).toHaveLength(all.length);
    expect(new Set(items.map((t) => t.id)).size).toBe(all.length);
    const rank = { none: 0, low: 1, medium: 2, high: 3, urgent: 4 };
    const key = (t: TaskDto): number =>
      !sort || sort.field === 'priority'
        ? rank[t.priority]
        : sort.field === 'estimate'
          ? (t.estimateHours ?? -1)
          : new Date(sort.field === 'updatedAt' ? t.updatedAt : t.createdAt).getTime();
    const dir = sort?.dir ?? 'desc';
    for (let i = 1; i < items.length; i++) {
      const [a, b] = [key(items[i - 1]!), key(items[i]!)];
      expect(dir === 'desc' ? a >= b : a <= b).toBe(true);
    }
  });

  it('searches title and description, and matches display IDs exactly', async () => {
    const byText = await fetchAll({ search: 'saved view tag reload' });
    expect(byText[0]?.title).toBe('Saved view filters drop tag conditions on reload');

    const byId = await fetchAll({ search: 'TSK-42' });
    expect(byId.map((t) => t.id)).toContain('TSK-42');
  });

  it('rejects unknown identifiers with a 400', async () => {
    const filter = filterQuerySchema.parse({
      conditions: [{ field: 'assignee', op: 'is', value: 'nobody' }],
    });
    await expect(listTaskPage(db, me, filter, undefined, 50)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects operators a field does not support', () => {
    expect(() =>
      filterQuerySchema.parse({ conditions: [{ field: 'status', op: 'gt', value: 'todo' }] }),
    ).toThrow();
    expect(() =>
      filterQuerySchema.parse({ conditions: [{ field: 'tag', op: 'isEmpty', value: 'bug' }] }),
    ).toThrow();
  });
});
