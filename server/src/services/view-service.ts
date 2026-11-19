// Saved views (§6.2 v1.8). Filters are validated with the shared schema on write and normalized
// on read; identifiers in them are checked against the database so a view can't save a filter
// that would fail to run.
import {
  createViewSchema,
  filterQuerySchema,
  updateViewSchema,
  viewDisplaySchema,
  type CreateViewInput,
  type FilterQuery,
  type SavedViewDto,
  type UpdateViewInput,
} from '@tracker/shared';
import type { Db } from '../db/client.ts';
import { AppError } from '../lib/app-error.ts';
import type { CurrentUser } from '../middleware/current-user.ts';
import { compileFilter } from '../repositories/filter-compiler.ts';
import * as repo from '../repositories/views-repo.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toDto(row: repo.ViewRow): SavedViewDto {
  return {
    id: row.id,
    name: row.name,
    filter: filterQuerySchema.parse(row.filter),
    display: viewDisplaySchema.parse(row.display ?? {}),
    createdAt: row.createdAt.toISOString(),
  };
}

function notFound(): AppError {
  return new AppError('NOT_FOUND', 'Saved view not found');
}

/** Rejects unknown handles/team keys/products/tags (400) before the view is stored. */
async function checkFilter(db: Db, user: CurrentUser, filter: FilterQuery) {
  await compileFilter(db, filter, user.id);
}

export async function listViews(db: Db, user: CurrentUser): Promise<SavedViewDto[]> {
  return (await repo.listViews(db, user.id)).map(toDto);
}

export async function getView(db: Db, user: CurrentUser, id: string): Promise<SavedViewDto> {
  if (!UUID_RE.test(id)) throw notFound();
  const row = await repo.findView(db, user.id, id);
  if (!row) throw notFound();
  return toDto(row);
}

export async function createView(
  db: Db,
  user: CurrentUser,
  raw: CreateViewInput,
): Promise<SavedViewDto> {
  const input = createViewSchema.parse(raw);
  await checkFilter(db, user, input.filter);
  return toDto(await repo.insertView(db, { ownerId: user.id, ...input }));
}

export async function updateView(
  db: Db,
  user: CurrentUser,
  id: string,
  raw: UpdateViewInput,
): Promise<SavedViewDto> {
  if (!UUID_RE.test(id)) throw notFound();
  const input = updateViewSchema.parse(raw);
  if (input.filter) await checkFilter(db, user, input.filter);
  const row = await repo.updateView(db, user.id, id, input);
  if (!row) throw notFound();
  return toDto(row);
}

export async function deleteView(db: Db, user: CurrentUser, id: string): Promise<void> {
  if (!UUID_RE.test(id) || !(await repo.deleteView(db, user.id, id))) throw notFound();
}
