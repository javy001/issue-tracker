// Reference data: users, teams, products, tags (§7.1), plus identifier → id resolution (§6.1).
import type { CreateTagInput, ProductDto, TagDto, TeamDto, UserDto } from '@tracker/shared';
import { asc, eq, inArray } from 'drizzle-orm';
import type { DbOrTx as Db } from '../db/client.ts';
import { products, tags, teamMembers, teams, users } from '../db/schema.ts';
import { AppError } from '../lib/app-error.ts';

export async function listUsers(db: Db): Promise<UserDto[]> {
  return db
    .select({
      handle: users.handle,
      name: users.name,
      avatarColor: users.avatarColor,
      team: teams.key,
    })
    .from(users)
    .leftJoin(teamMembers, eq(teamMembers.userId, users.id))
    .leftJoin(teams, eq(teams.id, teamMembers.teamId))
    .orderBy(asc(users.name));
}

export async function listTeams(db: Db): Promise<TeamDto[]> {
  return db
    .select({ key: teams.key, name: teams.name, color: teams.color })
    .from(teams)
    .orderBy(asc(teams.name));
}

export async function listProducts(db: Db): Promise<ProductDto[]> {
  return db.select({ name: products.name }).from(products).orderBy(asc(products.name));
}

export async function listTags(db: Db): Promise<TagDto[]> {
  return db.select({ name: tags.name, color: tags.color }).from(tags).orderBy(asc(tags.name));
}

export async function insertTag(db: Db, input: CreateTagInput): Promise<TagDto> {
  const [row] = await db
    .insert(tags)
    .values(input)
    .returning({ name: tags.name, color: tags.color });
  return row!;
}

// ---------- identifier resolution ----------
type Kind = 'user' | 'team' | 'product' | 'tag';

const LOOKUP = {
  user: { table: users, key: users.handle, id: users.id, label: 'user' },
  team: { table: teams, key: teams.key, id: teams.id, label: 'team' },
  product: { table: products, key: products.name, id: products.id, label: 'product' },
  tag: { table: tags, key: tags.name, id: tags.id, label: 'tag' },
} as const;

/**
 * Maps identifiers (handles, team keys, product names, tag names) to row ids.
 * Unknown identifiers are a 400 (§6.1).
 */
export async function resolveIds(
  db: Db,
  kind: Kind,
  identifiers: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(identifiers)];
  if (unique.length === 0) return new Map();
  const { table, key, id, label } = LOOKUP[kind];
  const rows = await db.select({ key, id }).from(table).where(inArray(key, unique));
  const map = new Map(rows.map((r) => [r.key, r.id]));
  const missing = unique.filter((k) => !map.has(k));
  if (missing.length > 0) {
    throw new AppError('VALIDATION_ERROR', `Unknown ${label}: ${missing.join(', ')}`, {
      field: kind,
      unknown: missing,
    });
  }
  return map;
}

export async function resolveId(db: Db, kind: Kind, identifier: string): Promise<string> {
  return (await resolveIds(db, kind, [identifier])).get(identifier)!;
}
