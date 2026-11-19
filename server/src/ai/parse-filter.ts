// §8.1 natural-language filtering: text → FilterQuery + interpretation.
import {
  filterQuerySchema,
  SORT_FIELDS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type FilterQuery,
  type ParseFilterResponse,
} from '@tracker/shared';
import { z } from 'zod';
import type { Db } from '../db/client.ts';
import type { CurrentUser } from '../middleware/current-user.ts';
import { compileFilter } from '../repositories/filter-compiler.ts';
import { listProducts, listTags, listTeams, listUsers } from '../repositories/reference-repo.ts';
import { aiUnavailable, type StructuredLLM } from './llm.ts';

const FIELDS = [
  'status',
  'priority',
  'assignee',
  'team',
  'product',
  'tag',
  'estimate',
  'createdAt',
  'updatedAt',
] as const;
const OPS = [
  'is',
  'isNot',
  'isAnyOf',
  'isNoneOf',
  'isEmpty',
  'isNotEmpty',
  'lt',
  'lte',
  'gt',
  'gte',
  'between',
] as const;

/** Flat shape Claude fills (structured outputs can't express the AST's tuples/limits). */
const modelOutputSchema = z.object({
  conditions: z.array(
    z.object({
      field: z.enum(FIELDS),
      op: z.enum(OPS),
      values: z.array(z.string()),
      numbers: z.array(z.number()),
      dates: z.array(z.string()),
    }),
  ),
  search: z.string().nullable(),
  sort: z.object({ field: z.enum(SORT_FIELDS), dir: z.enum(['asc', 'desc']) }).nullable(),
  interpretation: z.string(),
});
type ModelOutput = z.infer<typeof modelOutputSchema>;

function jsonSchema(identifiers: string[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['conditions', 'search', 'sort', 'interpretation'],
    properties: {
      conditions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['field', 'op', 'values', 'numbers', 'dates'],
          properties: {
            field: { type: 'string', enum: FIELDS },
            op: { type: 'string', enum: OPS },
            values: { type: 'array', items: { type: 'string', enum: identifiers } },
            numbers: { type: 'array', items: { type: 'number' } },
            dates: { type: 'array', items: { type: 'string', format: 'date' } },
          },
        },
      },
      search: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      sort: {
        anyOf: [
          {
            type: 'object',
            additionalProperties: false,
            required: ['field', 'dir'],
            properties: {
              field: { type: 'string', enum: SORT_FIELDS },
              dir: { type: 'string', enum: ['asc', 'desc'] },
            },
          },
          { type: 'null' },
        ],
      },
      interpretation: { type: 'string' },
    },
  };
}

async function buildSystemPrompt(db: Db, user: CurrentUser) {
  const [users, teams, products, tags] = await Promise.all([
    listUsers(db),
    listTeams(db),
    listProducts(db),
    listTags(db),
  ]);
  const identifiers = [
    ...TASK_STATUSES,
    ...TASK_PRIORITIES,
    'me',
    ...users.map((u) => u.handle),
    ...teams.map((t) => t.key),
    ...products.map((p) => p.name),
    ...tags.map((t) => t.name),
  ];

  const system = `You turn a short request from someone using an issue tracker into a structured task filter.

## Fields and operators
- status (values: ${TASK_STATUSES.join(', ')}): is, isNot, isAnyOf, isNoneOf
- priority (values: ${TASK_PRIORITIES.join(', ')}): is, isNot, isAnyOf, isNoneOf
- assignee (user handles, or "me"): is, isNot, isAnyOf, isNoneOf, isEmpty (unassigned), isNotEmpty
- team (team keys; a task's team is its assignee's team): is, isNot, isAnyOf, isNoneOf, isEmpty, isNotEmpty
- product (product names): is, isNot, isAnyOf, isNoneOf, isEmpty, isNotEmpty
- tag (tag names): is (has the tag), isNot (lacks it), isAnyOf, isNoneOf, isEmpty (no tags), isNotEmpty
- estimate (hours, in "numbers"): is, lt, lte, gt, gte, between (two numbers), isEmpty (no estimate), isNotEmpty
- createdAt, updatedAt (ISO dates YYYY-MM-DD, in "dates"): lt, lte, gt, gte, between (two dates, inclusive)

Put identifiers for status/priority/assignee/team/product/tag in "values"; leave "numbers" and "dates" empty for those fields. One value for is/isNot; one or more for isAnyOf/isNoneOf; none for isEmpty/isNotEmpty. Conditions are combined with AND.

## How to read requests
- "my", "mine", "assigned to me" → assignee is me. "unassigned", "no owner" → assignee isEmpty.
- "open" or "not done" → status isNoneOf [done, canceled]. "in progress", "in review", "backlog" map to those statuses.
- A tag name used as a noun ("bugs", "a11y issues") → tag is that tag.
- Resolve relative dates ("this week", "last 7 days", "before Friday") against today's date in the request.
- "biggest" / "largest estimate first" → sort estimate desc; "newest" / "recent" → sort createdAt or updatedAt desc; otherwise sort is null.
- Put remaining topic words that no field covers (e.g. "login", "pagination") in "search"; otherwise search is null. Don't repeat words already expressed as conditions.
- If the request isn't a filter at all, return no conditions, a null sort, the text as "search", and say so in the interpretation.
- interpretation: one short plain-English sentence describing the filter, e.g. "Urgent or high-priority bugs in Web App assigned to Dana".

## Reference data
Current user ("me"): ${user.handle} (${user.name})${user.team ? `, team ${user.team}` : ''}
Users (handle: name, team): ${users.map((u) => `${u.handle}: ${u.name}${u.team ? `, ${u.team}` : ''}`).join('; ')}
Teams (key: name): ${teams.map((t) => `${t.key}: ${t.name}`).join('; ')}
Products: ${products.map((p) => p.name).join(', ')}
Tags: ${tags.map((t) => t.name).join(', ')}`;

  return { system, identifiers: [...new Set(identifiers)] };
}

/** Converts Claude's flat output into the shared FilterQuery shape. */
export function toFilterQuery(out: ModelOutput): FilterQuery {
  const conditions = out.conditions.map((c) => {
    const kind =
      c.field === 'estimate'
        ? 'number'
        : c.field === 'createdAt' || c.field === 'updatedAt'
          ? 'date'
          : 'set';
    if (c.op === 'isEmpty' || c.op === 'isNotEmpty') return { field: c.field, op: c.op };
    const list = kind === 'number' ? c.numbers : kind === 'date' ? c.dates : c.values;
    if (c.op === 'between') return { field: c.field, op: c.op, value: list.slice(0, 2) };
    if (c.op === 'isAnyOf' || c.op === 'isNoneOf') return { field: c.field, op: c.op, value: list };
    return { field: c.field, op: c.op, value: list[0] };
  });
  const parsed = filterQuerySchema.safeParse({
    conditions,
    ...(out.search?.trim() ? { search: out.search.trim() } : {}),
    ...(out.sort ? { sort: out.sort } : {}),
  });
  if (!parsed.success) {
    throw aiUnavailable("Couldn't turn that into a filter. Try rephrasing.", parsed.error.issues);
  }
  return parsed.data;
}

export async function parseFilter(
  db: Db,
  llm: StructuredLLM,
  user: CurrentUser,
  text: string,
  now = new Date(),
): Promise<ParseFilterResponse> {
  const { system, identifiers } = await buildSystemPrompt(db, user);
  const today = now.toISOString().slice(0, 10);
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });

  const raw = await llm.generate({
    feature: 'parse-filter',
    system,
    user: `Today is ${weekday}, ${today}.\nRequest: ${text}`,
    schema: jsonSchema(identifiers),
    maxTokens: 4096,
  });
  const out = modelOutputSchema.safeParse(raw);
  if (!out.success) throw aiUnavailable('Claude returned an unexpected response.');

  const filter = toFilterQuery(out.data);
  // Same identifier checks as any filter (§8.0 grounding): unknown values are rejected.
  try {
    await compileFilter(db, filter, user.id);
  } catch {
    throw aiUnavailable("Couldn't turn that into a filter. Try rephrasing.");
  }
  return { filter, interpretation: out.data.interpretation.trim() };
}
