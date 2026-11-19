// Postgres error helpers. Drizzle wraps driver errors, so check the cause chain too.
function pgCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (typeof current === 'object' && current !== null && 'code' in current) {
      const code = (current as { code: unknown }).code;
      if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    }
    current =
      typeof current === 'object' && current !== null
        ? (current as { cause?: unknown }).cause
        : undefined;
  }
  return undefined;
}

export const isUniqueViolation = (err: unknown) => pgCode(err) === '23505';
export const isForeignKeyViolation = (err: unknown) => pgCode(err) === '23503';
