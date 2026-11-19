import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../config.ts';
import { createDb } from './client.ts';
import { tasks, taskActivity, taskTags, teamMembers, teams, users } from './schema.ts';
import { seed } from './seed.ts';

const { db, pool } = createDb(config.TEST_DATABASE_URL);

beforeAll(async () => {
  await seed(db, new Date('2026-11-19T12:00:00Z'));
});
afterAll(async () => {
  await pool.end();
});

async function firstTask() {
  const [task] = await db.select().from(tasks).limit(1);
  if (!task) throw new Error('seed produced no tasks');
  return task;
}

describe('seed', () => {
  it('numbers tasks 1..n globally, in creation order', async () => {
    const rows = await db
      .select({ number: tasks.number, createdAt: tasks.createdAt })
      .from(tasks)
      .orderBy(tasks.number);
    expect(rows.length).toBeGreaterThan(450);
    rows.forEach((r, i) => expect(r.number).toBe(i + 1));
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.createdAt.getTime()).toBeGreaterThanOrEqual(rows[i - 1]!.createdAt.getTime());
    }
  });

  it('puts every user in exactly one team', async () => {
    const teamRows = await db.select({ key: teams.key }).from(teams);
    expect(teamRows.map((t) => t.key).sort()).toEqual(['DES', 'ENG', 'PLT']);
    const memberships = await db
      .select({ userId: teamMembers.userId, n: sql<number>`count(*)::int` })
      .from(teamMembers)
      .groupBy(teamMembers.userId);
    const userCount = (await db.select({ id: users.id }).from(users)).length;
    expect(memberships).toHaveLength(userCount);
    expect(memberships.every((m) => m.n === 1)).toBe(true);
  });

  it('rejects a second team for the same user', async () => {
    const [ana] = await db.select().from(users).where(eq(users.handle, 'ana'));
    const [des] = await db.select().from(teams).where(eq(teams.key, 'DES'));
    await expect(
      db.insert(teamMembers).values({ userId: ana!.id, teamId: des!.id }),
    ).rejects.toThrow();
  });

  it('is deterministic', async () => {
    const before = await db.select({ title: tasks.title }).from(tasks).orderBy(tasks.title);
    await seed(db, new Date('2026-11-19T12:00:00Z'));
    const after = await db.select({ title: tasks.title }).from(tasks).orderBy(tasks.title);
    expect(after).toEqual(before);
  });

  it('leaves some tasks unassigned and unestimated for the AI features', async () => {
    const [row] = (await db
      .select({
        unassigned: sql<number>`count(*) filter (where ${tasks.assigneeId} is null)::int`,
        unestimated: sql<number>`count(*) filter (where ${tasks.estimateHours} is null)::int`,
      })
      .from(tasks)) as [{ unassigned: number; unestimated: number }];
    expect(row.unassigned).toBeGreaterThan(20);
    expect(row.unestimated).toBeGreaterThan(20);
  });
});

describe('schema constraints', () => {
  it('rejects estimates outside 0.5–80 h or not in 0.5 h steps', async () => {
    const task = await firstTask();
    for (const bad of [0.3, 0, 80.5, 2.2]) {
      await expect(
        db
          .update(tasks)
          .set({ estimateHours: bad, estimateSource: 'manual' })
          .where(eq(tasks.id, task.id)),
      ).rejects.toThrow();
    }
    await db
      .update(tasks)
      .set({ estimateHours: 1.5, estimateSource: 'manual' })
      .where(eq(tasks.id, task.id));
  });

  it('requires estimate_source exactly when an estimate is set', async () => {
    const task = await firstTask();
    await expect(
      db.update(tasks).set({ estimateHours: 2, estimateSource: null }).where(eq(tasks.id, task.id)),
    ).rejects.toThrow();
  });

  it('keeps search_vector in sync with title and description', async () => {
    const task = await firstTask();
    await db.update(tasks).set({ title: 'Zeppelin hangar overflow' }).where(eq(tasks.id, task.id));
    const hits = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(sql`${tasks.searchVector} @@ websearch_to_tsquery('english', 'zeppelin')`);
    expect(hits.map((h) => h.id)).toEqual([task.id]);
  });

  it('sets the assignee to NULL when the assigned user is deleted', async () => {
    const [temp] = await db
      .insert(users)
      .values({ handle: 'temp', name: 'Temp User', avatarColor: '#000000' })
      .returning();
    const task = await firstTask();
    await db.update(tasks).set({ assigneeId: temp!.id }).where(eq(tasks.id, task.id));

    await db.delete(users).where(eq(users.id, temp!.id));
    const [after] = await db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(after?.assigneeId).toBeNull();
  });

  it('cascades task deletes to tag links and activity', async () => {
    const task = await firstTask();
    await db.delete(tasks).where(eq(tasks.id, task.id));
    const links = await db.select().from(taskTags).where(eq(taskTags.taskId, task.id));
    const activity = await db.select().from(taskActivity).where(eq(taskActivity.taskId, task.id));
    expect(links).toHaveLength(0);
    expect(activity).toHaveLength(0);
  });
});
