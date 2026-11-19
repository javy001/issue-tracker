// Task queries (§7). Rows are mapped to TaskDto with stable identifiers (§7.1 v1.3).
import { formatTaskId, type ActivityDto, type ActivityKind, type TaskDto } from '@tracker/shared';
import { and, asc, count, desc, eq, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbOrTx } from '../db/client.ts';
import { products, taskActivity, tasks, taskTags, users } from '../db/schema.ts';
import type { Cursor } from '../lib/cursor.ts';
import type { CompiledFilter } from './filter-compiler.ts';

const assignee = alias(users, 'assignee_user');
const creator = alias(users, 'creator_user');

const TAG_NAMES = sql<string[]>`coalesce((
  select array_agg(tg.name order by tg.name)
  from task_tags tt join tags tg on tg.id = tt.tag_id
  where tt.task_id = "tasks"."id"
), '{}'::text[])`;

const taskFields = {
  uuid: tasks.id,
  number: tasks.number,
  title: tasks.title,
  description: tasks.description,
  status: tasks.status,
  priority: tasks.priority,
  assignee: assignee.handle,
  product: products.name,
  tags: TAG_NAMES,
  estimateHours: tasks.estimateHours,
  estimateSource: tasks.estimateSource,
  createdBy: creator.handle,
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
};

type TaskRow = {
  uuid: string;
  number: number;
  title: string;
  description: string;
  status: TaskDto['status'];
  priority: TaskDto['priority'];
  assignee: string | null;
  product: string | null;
  tags: string[];
  estimateHours: number | null;
  estimateSource: TaskDto['estimateSource'];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

function toDto(row: TaskRow): TaskDto {
  return {
    id: formatTaskId(row.number),
    number: row.number,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assignee: row.assignee,
    product: row.product,
    tags: row.tags,
    estimateHours: row.estimateHours,
    estimateSource: row.estimateSource,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Task rows with joins; `sortKey` is the sort expression as text (for keyset cursors). */
function selectTasks(db: DbOrTx, sortExpr: SQL = sql`null`) {
  return db
    .select({ ...taskFields, sortKey: sql<string>`(${sortExpr})::text` })
    .from(tasks)
    .leftJoin(assignee, eq(assignee.id, tasks.assigneeId))
    .leftJoin(products, eq(products.id, tasks.productId))
    .innerJoin(creator, eq(creator.id, tasks.createdBy))
    .$dynamic();
}

export async function listTasks(
  db: DbOrTx,
  { where, sort }: CompiledFilter,
  cursor: Cursor | null,
  limit: number,
): Promise<{ items: TaskDto[]; last: { sortKey: string; uuid: string } | null; hasMore: boolean }> {
  const order = sort.dir === 'desc' ? desc : asc;
  const keyset = cursor
    ? sql`(${sort.expr}, ${tasks.id}) ${sort.dir === 'desc' ? sql`<` : sql`>`} (${cursor.v}::${sql.raw(sort.cast)}, ${cursor.id}::uuid)`
    : undefined;

  const rows = await selectTasks(db, sort.expr)
    .where(and(where, keyset))
    .orderBy(order(sort.expr), order(tasks.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const lastRow = page[page.length - 1];
  return {
    items: page.map(toDto),
    last: lastRow ? { sortKey: lastRow.sortKey, uuid: lastRow.uuid } : null,
    hasMore,
  };
}

export async function countTasks(db: DbOrTx, where: SQL | undefined): Promise<number> {
  const [row] = await db.select({ n: count() }).from(tasks).where(where);
  return row?.n ?? 0;
}

export async function findTaskByNumber(
  db: DbOrTx,
  number: number,
): Promise<(TaskDto & { uuid: string }) | null> {
  const [row] = await selectTasks(db).where(eq(tasks.number, number));
  return row ? { ...toDto(row), uuid: row.uuid } : null;
}

export async function listActivity(db: DbOrTx, taskUuid: string): Promise<ActivityDto[]> {
  const rows = await db
    .select({
      id: taskActivity.id,
      kind: taskActivity.kind,
      actor: users.handle,
      payload: taskActivity.payload,
      createdAt: taskActivity.createdAt,
    })
    .from(taskActivity)
    .leftJoin(users, eq(users.id, taskActivity.actorId))
    .where(eq(taskActivity.taskId, taskUuid))
    .orderBy(asc(taskActivity.createdAt), asc(taskActivity.id));
  return rows.map((r) => ({
    ...r,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    createdAt: r.createdAt.toISOString(),
  }));
}

// ---------- writes ----------
export type TaskWrite = Partial<typeof tasks.$inferInsert>;

export async function insertTask(db: DbOrTx, values: typeof tasks.$inferInsert) {
  const [row] = await db
    .insert(tasks)
    .values(values)
    .returning({ id: tasks.id, number: tasks.number });
  return row!;
}

export async function updateTask(db: DbOrTx, uuid: string, values: TaskWrite) {
  await db.update(tasks).set(values).where(eq(tasks.id, uuid));
}

export async function replaceTaskTags(db: DbOrTx, taskUuid: string, tagIds: string[]) {
  await db.delete(taskTags).where(eq(taskTags.taskId, taskUuid));
  if (tagIds.length > 0) {
    await db.insert(taskTags).values(tagIds.map((tagId) => ({ taskId: taskUuid, tagId })));
  }
}

export async function lockTaskByNumber(db: DbOrTx, number: number) {
  const [row] = await db
    .select({
      id: tasks.id,
      assigneeId: tasks.assigneeId,
      productId: tasks.productId,
    })
    .from(tasks)
    .where(eq(tasks.number, number))
    .for('update');
  return row ?? null;
}

export async function deleteTaskByNumber(db: DbOrTx, number: number): Promise<boolean> {
  const rows = await db.delete(tasks).where(eq(tasks.number, number)).returning({ id: tasks.id });
  return rows.length > 0;
}

export interface ActivityWrite {
  kind: ActivityKind;
  payload?: Record<string, unknown>;
}

export async function insertActivity(
  db: DbOrTx,
  taskUuid: string,
  actorId: string,
  entries: ActivityWrite[],
) {
  if (entries.length === 0) return;
  await db
    .insert(taskActivity)
    .values(
      entries.map((e) => ({ taskId: taskUuid, actorId, kind: e.kind, payload: e.payload ?? {} })),
    );
}
