// Compiles the filter AST (§6.1) into SQL. Identifiers are resolved to ids first, so unknown
// handles/keys/names fail with 400 before any query runs.
import { parseTaskReference, type Condition, type FilterQuery } from '@tracker/shared';
import {
  and,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
  type SQL,
  type SQLWrapper,
} from 'drizzle-orm';
import type { DbOrTx as Db } from '../db/client.ts';
import { tasks } from '../db/schema.ts';
import { resolveIds } from './reference-repo.ts';

export type SortKind = 'priority' | 'updatedAt' | 'createdAt' | 'estimate' | 'rank';

export interface SortSpec {
  kind: SortKind;
  expr: SQL;
  dir: 'asc' | 'desc';
  /** Postgres type used to cast the cursor's text value back (keyset pagination). */
  cast: string;
}

export interface CompiledFilter {
  where: SQL | undefined;
  sort: SortSpec;
}

// Qualified references for correlated subqueries (always `tasks` as the outer table).
const TASK_ID = sql.raw('"tasks"."id"');
const TASK_ASSIGNEE = sql.raw('"tasks"."assignee_id"');
/** A task's team is its assignee's team (§5 v1.3). */
const TASK_TEAM = sql`(select tm.team_id from team_members tm where tm.user_id = ${TASK_ASSIGNEE})`;

type SetOp = 'is' | 'isNot' | 'isAnyOf' | 'isNoneOf';

function setCondition(
  expr: SQLWrapper,
  op: SetOp,
  values: string | string[],
  nullable: boolean,
): SQL | undefined {
  const list = Array.isArray(values) ? values : [values];
  switch (op) {
    case 'is':
      return eq(expr as SQL, list[0]);
    case 'isNot':
      return nullable ? sql`${expr} is distinct from ${list[0]}` : ne(expr as SQL, list[0]);
    case 'isAnyOf':
      return inArray(expr as SQL, list);
    case 'isNoneOf':
      return nullable
        ? or(isNull(expr as SQL), notInArray(expr as SQL, list))
        : notInArray(expr as SQL, list);
  }
}

function hasTags(tagIds: string[] | null) {
  const filter = tagIds
    ? sql` and tt.tag_id in (${sql.join(
        tagIds.map((id) => sql`${id}`),
        sql`, `,
      )})`
    : sql``;
  return sql`exists (select 1 from task_tags tt where tt.task_id = ${TASK_ID}${filter})`;
}

function tagCondition(op: Condition['op'], tagIds: string[]): SQL {
  switch (op) {
    case 'is':
    case 'isAnyOf':
      return hasTags(tagIds);
    case 'isNot':
    case 'isNoneOf':
      return sql`not ${hasTags(tagIds)}`;
    case 'isEmpty':
      return sql`not ${hasTags(null)}`;
    default:
      return hasTags(null); // isNotEmpty
  }
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Date-only upper bounds include the whole day (e.g. `lte 2026-11-19` ⇒ `< 2026-11-20`). */
function dateCondition(
  column: SQLWrapper,
  op: string,
  value: string | [string, string],
): SQL | undefined {
  const col = column as SQL;
  const start = (s: string) => new Date(s);
  const endExclusive = (s: string) =>
    new Date(new Date(s).getTime() + (DATE_ONLY.test(s) ? DAY_MS : 0));
  switch (op) {
    case 'lt':
      return lt(col, start(value as string));
    case 'lte':
      return DATE_ONLY.test(value as string)
        ? lt(col, endExclusive(value as string))
        : lte(col, start(value as string));
    case 'gt':
      return DATE_ONLY.test(value as string)
        ? gte(col, endExclusive(value as string))
        : gt(col, start(value as string));
    case 'gte':
      return gte(col, start(value as string));
    case 'between': {
      const [from, to] = value as [string, string];
      return and(
        gte(col, start(from)),
        DATE_ONLY.test(to) ? lt(col, endExclusive(to)) : lte(col, start(to)),
      );
    }
  }
  return undefined;
}

function numberCondition(
  column: SQLWrapper,
  op: string,
  value: number | [number, number],
): SQL | undefined {
  const col = column as SQL;
  switch (op) {
    case 'is':
      return eq(col, value);
    case 'lt':
      return lt(col, value);
    case 'lte':
      return lte(col, value);
    case 'gt':
      return gt(col, value);
    case 'gte':
      return gte(col, value);
    case 'between': {
      const [from, to] = value as [number, number];
      return and(gte(col, from), lte(col, to));
    }
  }
  return undefined;
}

export async function compileFilter(
  db: Db,
  filter: FilterQuery,
  currentUserId: string,
): Promise<CompiledFilter> {
  // 1. Resolve every identifier in one query per kind.
  const wanted = {
    user: [] as string[],
    team: [] as string[],
    product: [] as string[],
    tag: [] as string[],
  };
  const kindOf = { assignee: 'user', team: 'team', product: 'product', tag: 'tag' } as const;
  for (const c of filter.conditions) {
    if (!(c.field in kindOf) || !('value' in c)) continue;
    const values = (Array.isArray(c.value) ? c.value : [c.value]) as string[];
    const kind = kindOf[c.field as keyof typeof kindOf];
    wanted[kind].push(...values.filter((v) => !(kind === 'user' && v === 'me')));
  }
  const [userIds, teamIds, productIds, tagIds] = await Promise.all([
    resolveIds(db, 'user', wanted.user),
    resolveIds(db, 'team', wanted.team),
    resolveIds(db, 'product', wanted.product),
    resolveIds(db, 'tag', wanted.tag),
  ]);
  const ids = (map: Map<string, string>, value: string | string[]) =>
    (Array.isArray(value) ? value : [value]).map((v) =>
      map === userIds && v === 'me' ? currentUserId : map.get(v)!,
    );

  // 2. Compile each condition (AND-ed).
  const parts: (SQL | undefined)[] = filter.conditions.map((c) => {
    switch (c.field) {
      case 'status':
        return setCondition(tasks.status, c.op, c.value, false);
      case 'priority':
        return setCondition(tasks.priority, c.op, c.value, false);
      case 'assignee':
        if (!('value' in c))
          return c.op === 'isEmpty' ? isNull(tasks.assigneeId) : isNotNull(tasks.assigneeId);
        return setCondition(tasks.assigneeId, c.op, ids(userIds, c.value), true);
      case 'team':
        if (!('value' in c))
          return sql`${TASK_TEAM} ${c.op === 'isEmpty' ? sql`is null` : sql`is not null`}`;
        return setCondition(TASK_TEAM, c.op, ids(teamIds, c.value), true);
      case 'product':
        if (!('value' in c))
          return c.op === 'isEmpty' ? isNull(tasks.productId) : isNotNull(tasks.productId);
        return setCondition(tasks.productId, c.op, ids(productIds, c.value), true);
      case 'tag':
        return tagCondition(c.op, 'value' in c ? ids(tagIds, c.value) : []);
      case 'estimate':
        if (!('value' in c))
          return c.op === 'isEmpty' ? isNull(tasks.estimateHours) : isNotNull(tasks.estimateHours);
        return numberCondition(tasks.estimateHours, c.op, c.value);
      case 'createdAt':
        return dateCondition(tasks.createdAt, c.op, c.value);
      case 'updatedAt':
        return dateCondition(tasks.updatedAt, c.op, c.value);
    }
  });

  // 3. Free-text search (§6.3): full-text match, or an exact task reference (142, #142, TSK-142).
  const search = filter.search?.trim();
  let tsquery: SQL | undefined;
  let referenced: number | null = null;
  if (search) {
    tsquery = sql`websearch_to_tsquery('english', ${search})`;
    const byText = sql`${tasks.searchVector} @@ ${tsquery}`;
    referenced = parseTaskReference(search);
    parts.push(referenced === null ? byText : or(byText, eq(tasks.number, referenced)));
  }

  // 4. Sort (§6.1): explicit sort, else search rank when searching, else priority (urgent first).
  let sort: SortSpec;
  const field = filter.sort?.field;
  if (field === 'updatedAt' || field === 'createdAt') {
    sort = {
      kind: field,
      expr: sql`${field === 'updatedAt' ? tasks.updatedAt : tasks.createdAt}`,
      dir: filter.sort!.dir,
      cast: 'timestamptz',
    };
  } else if (field === 'estimate') {
    sort = {
      kind: 'estimate',
      expr: sql`coalesce(${tasks.estimateHours}, -1)`,
      dir: filter.sort!.dir,
      cast: 'numeric',
    };
  } else if (field === 'priority' || !tsquery) {
    sort = {
      kind: 'priority',
      expr: sql`${tasks.priority}`,
      dir: filter.sort?.dir ?? 'desc',
      cast: 'task_priority',
    };
  } else {
    // ts_rank is below 1, so an exact task-reference match (rank 2) always comes first (v1.10).
    const textRank = sql`ts_rank(${tasks.searchVector}, ${tsquery})`;
    sort = {
      kind: 'rank',
      expr:
        referenced === null
          ? textRank
          : sql`(case when ${tasks.number} = ${referenced} then 2::real else ${textRank} end)`,
      dir: 'desc',
      cast: 'real',
    };
  }

  return { where: and(...parts.filter((p): p is SQL => p !== undefined)), sort };
}
