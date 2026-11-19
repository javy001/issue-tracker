import { createAnthropicLLM } from './ai/llm.ts';
import { createApp } from './app.ts';
import { config } from './config.ts';
import { createDb } from './db/client.ts';
import { loadCurrentUser, UnknownUserError } from './middleware/current-user.ts';

const { db, pool } = createDb(config.DATABASE_URL);

// §7.4: resolve the acting user once at startup; an unknown handle stops the server.
let currentUser;
try {
  currentUser = await loadCurrentUser(db, config.CURRENT_USER);
} catch (err) {
  console.error(
    err instanceof UnknownUserError
      ? err.message
      : `Could not load the current user. Is the database up and migrated? (npm run db:up && npm run db:reset)\n${String(err)}`,
  );
  await pool.end();
  process.exit(1);
}

const app = createApp({
  db,
  currentUser,
  llm: createAnthropicLLM({ model: config.ANTHROPIC_MODEL }),
});

const server = app.listen(config.PORT, () => {
  console.log(
    `API listening on http://localhost:${config.PORT} (current user: ${currentUser.handle})`,
  );
});

function shutdown() {
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
