// Task business rules (§5, §7). Routes call these; these call repositories.
import {
  type CreateTaskInput,
  type FilterQuery,
  type ListTasksResponse,
  type TaskDetailDto,
  type TaskDto,
  type UpdateTaskInput,
} from '@tracker/shared';
import type { Db, DbOrTx } from '../db/client.ts';
import { AppError } from '../lib/app-error.ts';
import { decodeCursor, encodeCursor } from '../lib/cursor.ts';
import type { CurrentUser } from '../middleware/current-user.ts';
import { compileFilter } from '../repositories/filter-compiler.ts';
import { resolveId, resolveIds } from '../repositories/reference-repo.ts';
import {
  countTasks,
  deleteTaskByNumber,
  findTaskByNumber,
  insertActivity,
  insertTask,
  listActivity,
  listTasks,
  lockTaskByNumber,
  replaceTaskTags,
  updateTask,
  type ActivityWrite,
  type TaskWrite,
} from '../repositories/tasks-repo.ts';

export async function listTaskPage(
  db: Db,
  user: CurrentUser,
  filter: FilterQuery,
  rawCursor: string | undefined,
  limit: number,
): Promise<ListTasksResponse> {
  const compiled = await compileFilter(db, filter, user.id);
  const cursor = rawCursor ? decodeCursor(rawCursor, compiled.sort.kind) : null;
  const [page, total] = await Promise.all([
    listTasks(db, compiled, cursor, limit),
    countTasks(db, compiled.where),
  ]);
  return {
    items: page.items,
    nextCursor:
      page.hasMore && page.last
        ? encodeCursor({ s: compiled.sort.kind, v: page.last.sortKey, id: page.last.uuid })
        : null,
    total,
  };
}

export async function getTaskDetail(db: DbOrTx, number: number): Promise<TaskDetailDto> {
  const task = await findTaskByNumber(db, number);
  if (!task) throw notFound(number);
  const { uuid, ...dto } = task;
  return { ...dto, activity: await listActivity(db, uuid) };
}

export async function createTask(
  db: Db,
  user: CurrentUser,
  input: CreateTaskInput,
): Promise<TaskDetailDto> {
  return db.transaction(async (tx) => {
    const assigneeId = input.assignee ? await resolveId(tx, 'user', input.assignee) : null;
    const productId = input.product ? await resolveId(tx, 'product', input.product) : null;
    const tagIds = await resolveIds(tx, 'tag', input.tags ?? []);
    const estimate = input.estimateHours ?? null;

    const { id, number } = await insertTask(tx, {
      title: input.title,
      description: input.description ?? '',
      status: input.status,
      priority: input.priority,
      assigneeId,
      productId,
      estimateHours: estimate,
      estimateSource: estimate === null ? null : (input.estimateSource ?? 'manual'),
      createdBy: user.id,
    });
    await replaceTaskTags(tx, id, [...tagIds.values()]);
    await insertActivity(tx, id, user.id, [{ kind: 'created' }]);
    return getTaskDetail(tx, number);
  });
}

export async function updateTaskFields(
  db: Db,
  user: CurrentUser,
  number: number,
  input: UpdateTaskInput,
): Promise<TaskDetailDto> {
  return db.transaction(async (tx) => {
    const locked = await lockTaskByNumber(tx, number);
    if (!locked) throw notFound(number);
    const before = (await findTaskByNumber(tx, number))!;

    const set: TaskWrite = {};
    const activity: ActivityWrite[] = [];
    const changed = <K extends keyof TaskDto>(key: K, next: TaskDto[K] | undefined) =>
      next !== undefined && next !== before[key];

    const edited: string[] = [];
    if (changed('title', input.title)) {
      set.title = input.title;
      edited.push('title');
    }
    if (changed('description', input.description)) {
      set.description = input.description;
      edited.push('description');
    }
    if (edited.length > 0) activity.push({ kind: 'edited', payload: { fields: edited } });

    if (changed('status', input.status)) {
      set.status = input.status;
      activity.push({
        kind: 'status_changed',
        payload: { from: before.status, to: input.status, source: 'manual' },
      });
    }
    if (changed('priority', input.priority)) {
      set.priority = input.priority;
      activity.push({
        kind: 'priority_changed',
        payload: { from: before.priority, to: input.priority, source: 'manual' },
      });
    }
    if (changed('assignee', input.assignee)) {
      set.assigneeId = input.assignee ? await resolveId(tx, 'user', input.assignee) : null;
      activity.push({
        kind: 'assigned',
        payload: {
          from: before.assignee,
          to: input.assignee,
          source: input.assigneeSource ?? 'manual',
        },
      });
    }
    if (changed('product', input.product)) {
      set.productId = input.product ? await resolveId(tx, 'product', input.product) : null;
      activity.push({
        kind: 'edited',
        payload: { fields: ['product'], from: before.product, to: input.product },
      });
    }
    if (input.estimateHours !== undefined) {
      const source = input.estimateHours === null ? null : (input.estimateSource ?? 'manual');
      if (input.estimateHours !== before.estimateHours || source !== before.estimateSource) {
        set.estimateHours = input.estimateHours;
        set.estimateSource = source;
        activity.push({
          kind: 'estimated',
          payload: {
            from: before.estimateHours,
            to: input.estimateHours,
            source: source ?? 'manual',
          },
        });
      }
    }
    if (input.tags !== undefined) {
      const next = [...new Set(input.tags)].sort();
      if (next.join('\n') !== before.tags.join('\n')) {
        const tagIds = await resolveIds(tx, 'tag', next);
        await replaceTaskTags(tx, locked.id, [...tagIds.values()]);
        activity.push({ kind: 'tags_changed', payload: { from: before.tags, to: next } });
      }
    }

    if (activity.length === 0) return getTaskDetail(tx, number); // no-op patch

    // Tag-only changes still bump updated_at.
    await updateTask(tx, locked.id, { ...set, updatedAt: new Date() });
    await insertActivity(tx, locked.id, user.id, activity);
    return getTaskDetail(tx, number);
  });
}

export async function deleteTask(db: Db, number: number): Promise<void> {
  if (!(await deleteTaskByNumber(db, number))) throw notFound(number);
}

function notFound(number: number) {
  return new AppError('NOT_FOUND', `Task TSK-${number} not found`);
}
