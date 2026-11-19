// §7.4: no auth. The acting user is chosen at startup (CURRENT_USER / --user) and attached to
// every request. Real auth would replace only this module.
import { eq } from 'drizzle-orm';
import type { RequestHandler } from 'express';
import type { Db } from '../db/client.ts';
import { teamMembers, teams, users } from '../db/schema.ts';

export interface CurrentUser {
  id: string;
  handle: string;
  name: string;
  avatarColor: string;
  team: string | null;
}

export class UnknownUserError extends Error {
  constructor(
    readonly handle: string,
    readonly available: string[],
  ) {
    super(
      `Unknown user "${handle}". Seeded users: ${available.join(', ') || '(none; run npm run db:seed)'}`,
    );
    this.name = 'UnknownUserError';
  }
}

export async function loadCurrentUser(db: Db, handle: string): Promise<CurrentUser> {
  const [row] = await db
    .select({
      id: users.id,
      handle: users.handle,
      name: users.name,
      avatarColor: users.avatarColor,
      team: teams.key,
    })
    .from(users)
    .leftJoin(teamMembers, eq(teamMembers.userId, users.id))
    .leftJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(eq(users.handle, handle));
  if (row) return row;

  const available = (
    await db.select({ handle: users.handle }).from(users).orderBy(users.handle)
  ).map((u) => u.handle);
  throw new UnknownUserError(handle, available);
}

export function currentUserMiddleware(user: CurrentUser): RequestHandler {
  return (req, _res, next) => {
    req.user = user;
    next();
  };
}
