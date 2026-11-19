import type { CurrentUser } from '../middleware/current-user.ts';

declare global {
  namespace Express {
    interface Request {
      /** Set by currentUserMiddleware (§7.4). */
      user: CurrentUser;
    }
  }
}

export {};
