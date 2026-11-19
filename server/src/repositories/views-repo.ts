// Saved views (§6.2): personal, so every query is scoped to the owner.
import { and, asc, eq } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.ts';
import { savedViews } from '../db/schema.ts';

export type ViewRow = typeof savedViews.$inferSelect;

export function listViews(db: DbOrTx, ownerId: string) {
  return db
    .select()
    .from(savedViews)
    .where(eq(savedViews.ownerId, ownerId))
    .orderBy(asc(savedViews.createdAt), asc(savedViews.name), asc(savedViews.id));
}

export async function findView(db: DbOrTx, ownerId: string, id: string): Promise<ViewRow | null> {
  const [row] = await db
    .select()
    .from(savedViews)
    .where(and(eq(savedViews.id, id), eq(savedViews.ownerId, ownerId)));
  return row ?? null;
}

export async function insertView(
  db: DbOrTx,
  values: { ownerId: string; name: string; filter: unknown; display: unknown },
): Promise<ViewRow> {
  const [row] = await db.insert(savedViews).values(values).returning();
  return row!;
}

export async function updateView(
  db: DbOrTx,
  ownerId: string,
  id: string,
  values: { name?: string; filter?: unknown; display?: unknown },
): Promise<ViewRow | null> {
  const [row] = await db
    .update(savedViews)
    .set(values)
    .where(and(eq(savedViews.id, id), eq(savedViews.ownerId, ownerId)))
    .returning();
  return row ?? null;
}

export async function deleteView(db: DbOrTx, ownerId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(savedViews)
    .where(and(eq(savedViews.id, id), eq(savedViews.ownerId, ownerId)))
    .returning({ id: savedViews.id });
  return rows.length > 0;
}
