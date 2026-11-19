// Opaque keyset cursor (§7.2): base64url of the last row's sort key and id.
import { AppError } from './app-error.ts';

export interface Cursor {
  s: string; // sort kind the cursor was created for
  v: string; // sort key, as Postgres text
  id: string; // task uuid
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url');
}

export function decodeCursor(raw: string, sortKind: string): Cursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Invalid cursor');
  }
  const c = parsed as Partial<Cursor>;
  if (
    typeof c?.v !== 'string' ||
    typeof c.id !== 'string' ||
    !UUID_RE.test(c.id) ||
    typeof c.s !== 'string'
  ) {
    throw new AppError('VALIDATION_ERROR', 'Invalid cursor');
  }
  if (c.s !== sortKind) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Cursor does not match the current sort; start from the first page',
    );
  }
  return c as Cursor;
}
