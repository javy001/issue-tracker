// Deterministic demo data (design doc §10). Run with `npm run db:seed`; replaces all existing data.
import type { ActivityKind, EstimateSource, TaskPriority, TaskStatus } from '@tracker/shared';
import { sql } from 'drizzle-orm';
import { pathToFileURL } from 'node:url';
import { config } from '../config.ts';
import { createDb, type Db } from './client.ts';
import {
  products,
  savedViews,
  tags,
  taskActivity,
  tasks,
  taskTags,
  teamMembers,
  teams,
  users,
} from './schema.ts';
import {
  AREAS,
  DESCRIPTION_TEMPLATES,
  ESTIMATE_CHOICES,
  HANDCRAFTED_TASKS,
  PRIORITY_WEIGHTS,
  PRODUCTS,
  STATUS_WEIGHTS,
  TAGS,
  TEAMS,
  surfaceOf,
  TITLE_TEMPLATES,
  USERS,
  type Handle,
  type ProductName,
  type TagName,
} from './seed-data.ts';

const SEED = 20261119;
const DAY_MS = 24 * 60 * 60 * 1000;

// mulberry32: tiny deterministic PRNG so every seed run produces the same data.
function createRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
  const weighted = <T>(items: readonly [T, number][]): T => {
    const total = items.reduce((sum, [, w]) => sum + w, 0);
    let r = next() * total;
    for (const [item, w] of items) {
      r -= w;
      if (r < 0) return item;
    }
    return items[items.length - 1]![0];
  };
  const chance = (p: number) => next() < p;
  return { next, pick, weighted, chance };
}

interface DraftTask {
  team: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: Handle | null;
  product: ProductName;
  tags: TagName[];
  estimateHours: number | null;
  estimateSource: EstimateSource | null;
  createdBy: Handle;
  createdAt: Date;
  updatedAt: Date;
}

function tagsFor(kind: string, area: string, title: string, product: ProductName): TagName[] {
  const out = new Set<TagName>();
  if (kind === 'bug') out.add('bug');
  if (kind === 'feature') out.add('feature');
  if (kind === 'design') out.add('design');
  if (kind === 'platform') out.add('devx');
  if (/Filter|Saved views|Search/.test(area)) out.add('filters');
  if (/Login|Auth/.test(area)) out.add('auth');
  if (/keyboard|focus|contrast|Keyboard/.test(title)) out.add('a11y');
  if (/slow|latency|Load test|1,000\+/.test(title)) out.add('perf');
  if (product === 'API') out.add('api');
  return [...out].slice(0, 3);
}

export function buildDraftTasks(now: Date): DraftTask[] {
  const rng = createRng(SEED);
  const drafts: DraftTask[] = [];

  for (const team of TEAMS) {
    const usedTitles = new Set<string>();
    for (let i = 0; i < team.generatedCount; i++) {
      const product = rng.weighted(team.products);
      const kind = rng.weighted(team.kinds);
      const templates = TITLE_TEMPLATES[kind][surfaceOf(product)];
      let area = '';
      let title = '';
      for (let attempt = 0; attempt < 12; attempt++) {
        area = rng.pick(AREAS[product]);
        title = rng.pick(templates).replace('{area}', area);
        if (!usedTitles.has(title)) break;
      }
      usedTitles.add(title);

      const status = rng.weighted(STATUS_WEIGHTS);
      const priority = rng.weighted(PRIORITY_WEIGHTS);
      const active = status === 'in_progress' || status === 'in_review' || status === 'done';
      const unassignedChance = status === 'backlog' ? 0.35 : status === 'todo' ? 0.15 : 0;
      const assignee = active || !rng.chance(unassignedChance) ? rng.pick(team.members) : null;
      const estimateChance = status === 'backlog' ? 0.45 : 0.8;
      const estimateHours = rng.chance(estimateChance) ? rng.weighted(ESTIMATE_CHOICES) : null;

      const createdAt = new Date(now.getTime() - Math.floor(rng.next() * 120 * DAY_MS));
      const updatedAt = new Date(
        createdAt.getTime() + Math.floor(rng.next() * (now.getTime() - createdAt.getTime())),
      );

      drafts.push({
        team: team.key,
        title,
        description: rng.pick(DESCRIPTION_TEMPLATES[kind]).replaceAll('{area}', area.toLowerCase()),
        status,
        priority,
        assignee,
        product,
        tags: tagsFor(kind, area, title, product),
        estimateHours,
        estimateSource: estimateHours === null ? null : rng.chance(0.1) ? 'ai' : 'manual',
        createdBy: rng.pick(team.members),
        createdAt,
        updatedAt,
      });
    }
  }

  for (const h of HANDCRAFTED_TASKS) {
    const team = TEAMS.find((t) => t.key === h.team)!;
    const createdAt = new Date(now.getTime() - h.daysAgo * DAY_MS);
    drafts.push({
      ...h,
      estimateSource: h.estimateHours === null ? null : 'manual',
      createdBy: team.members[0]!,
      createdAt,
      updatedAt: new Date(createdAt.getTime() + DAY_MS / 2),
    });
  }

  // Per-team numbers follow creation order, like a real tracker.
  return drafts.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function seed(db: Db, now = new Date()) {
  const drafts = buildDraftTasks(now);

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`truncate table task_activity, task_tags, saved_views, tasks, team_members, tags, products, teams, users cascade`,
    );

    const userRows = await tx
      .insert(users)
      .values([...USERS])
      .returning();
    const userId = new Map(userRows.map((u) => [u.handle, u.id]));
    const productRows = await tx
      .insert(products)
      .values(PRODUCTS.map((name) => ({ name })))
      .returning();
    const productId = new Map(productRows.map((p) => [p.name, p.id]));
    const tagRows = await tx
      .insert(tags)
      .values([...TAGS])
      .returning();
    const tagId = new Map(tagRows.map((t) => [t.name, t.id]));

    // Counters start past the seeded tasks so new tasks continue the sequence (§5).
    const countByTeam = new Map<string, number>();
    for (const d of drafts) countByTeam.set(d.team, (countByTeam.get(d.team) ?? 0) + 1);
    const teamRows = await tx
      .insert(teams)
      .values(
        TEAMS.map((t) => ({
          key: t.key,
          name: t.name,
          color: t.color,
          nextTaskNumber: (countByTeam.get(t.key) ?? 0) + 1,
        })),
      )
      .returning();
    const teamId = new Map(teamRows.map((t) => [t.key, t.id]));
    await tx
      .insert(teamMembers)
      .values(
        TEAMS.flatMap((t) =>
          t.members.map((h) => ({ teamId: teamId.get(t.key)!, userId: userId.get(h)! })),
        ),
      );

    const nextNumber = new Map<string, number>();
    const taskValues = drafts.map((d) => {
      const number = (nextNumber.get(d.team) ?? 0) + 1;
      nextNumber.set(d.team, number);
      return {
        teamId: teamId.get(d.team)!,
        number,
        title: d.title,
        description: d.description,
        status: d.status,
        priority: d.priority,
        assigneeId: d.assignee ? userId.get(d.assignee)! : null,
        productId: productId.get(d.product)!,
        estimateHours: d.estimateHours,
        estimateSource: d.estimateSource,
        createdBy: userId.get(d.createdBy)!,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      };
    });
    const taskRows: { id: string }[] = [];
    for (const batch of chunk(taskValues, 250)) {
      taskRows.push(...(await tx.insert(tasks).values(batch).returning({ id: tasks.id })));
    }

    const tagLinks: { taskId: string; tagId: string }[] = [];
    const activity: {
      taskId: string;
      actorId: string | null;
      kind: ActivityKind;
      payload: Record<string, unknown>;
      createdAt: Date;
    }[] = [];
    drafts.forEach((d, i) => {
      const id = taskRows[i]!.id;
      const actor = userId.get(d.createdBy)!;
      for (const t of d.tags) tagLinks.push({ taskId: id, tagId: tagId.get(t)! });
      activity.push({
        taskId: id,
        actorId: actor,
        kind: 'created',
        payload: {},
        createdAt: d.createdAt,
      });
      if (d.assignee) {
        activity.push({
          taskId: id,
          actorId: actor,
          kind: 'assigned',
          payload: { from: null, to: d.assignee, source: 'manual' },
          createdAt: d.createdAt,
        });
      }
      if (d.estimateHours !== null) {
        activity.push({
          taskId: id,
          actorId: actor,
          kind: 'estimated',
          payload: { from: null, to: d.estimateHours, source: d.estimateSource },
          createdAt: d.createdAt,
        });
      }
      if (d.status !== 'backlog') {
        activity.push({
          taskId: id,
          actorId: d.assignee ? userId.get(d.assignee)! : actor,
          kind: 'status_changed',
          payload: { from: 'backlog', to: d.status, source: 'manual' },
          createdAt: d.updatedAt,
        });
      }
    });
    for (const batch of chunk(tagLinks, 1000)) await tx.insert(taskTags).values(batch);
    for (const batch of chunk(activity, 1000)) await tx.insert(taskActivity).values(batch);

    // Saved views use the draft FilterQuery shape from design doc §6.1.
    const openStatuses = { field: 'status', op: 'isNoneOf', value: ['done', 'canceled'] };
    const views = USERS.flatMap((u) => [
      {
        ownerId: userId.get(u.handle)!,
        name: 'My open tasks',
        filter: { conditions: [{ field: 'assignee', op: 'is', value: 'me' }, openStatuses] },
        display: { layout: 'list' },
      },
      {
        ownerId: userId.get(u.handle)!,
        name: 'Unassigned · needs owner',
        filter: { conditions: [{ field: 'assignee', op: 'isEmpty' }, openStatuses] },
        display: { layout: 'list' },
      },
    ]);
    views.push({
      ownerId: userId.get('ana')!,
      name: 'Urgent bugs · Web App',
      filter: {
        conditions: [
          { field: 'priority', op: 'isAnyOf', value: ['urgent', 'high'] },
          { field: 'tag', op: 'is', value: 'bug' },
          { field: 'product', op: 'is', value: 'Web App' },
        ],
      },
      display: { layout: 'list' },
    });
    await tx.insert(savedViews).values(views);
  });

  return { tasks: drafts.length };
}

// CLI entry point: `tsx src/db/seed.ts`
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { db, pool } = createDb(config.DATABASE_URL);
  try {
    const result = await seed(db);
    console.log(`Seeded ${USERS.length} users, ${TEAMS.length} teams and ${result.tasks} tasks.`);
  } finally {
    await pool.end();
  }
}
