import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Load the repo-root .env if present. Variables already set in the environment
// (e.g. CURRENT_USER from `npm run dev -- --user=dana`) are not overridden.
const rootEnvFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);

// §3.3: configuration is validated once at startup.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1).default('postgres://tracker:tracker@localhost:5434/tracker'),
  TEST_DATABASE_URL: z
    .string()
    .min(1)
    .default('postgres://tracker:tracker@localhost:5435/tracker_test'),
  PORT: z.coerce.number().int().positive().default(3001),
  CURRENT_USER: z.string().min(1).default('ana'),
  ANTHROPIC_MODEL: z.string().min(1).default('claude-sonnet-5-5'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', z.treeifyError(parsed.error));
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
