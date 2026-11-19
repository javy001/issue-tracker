import { createApp } from './app.ts';
import { config } from './config.ts';
import { createDb } from './db/client.ts';

const { db, pool } = createDb(config.DATABASE_URL);
const app = createApp({ db });

const server = app.listen(config.PORT, () => {
  console.log(
    `API listening on http://localhost:${config.PORT} (current user: ${config.CURRENT_USER})`,
  );
});

function shutdown() {
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
