# Issue Tracker

Linear-style issue tracker, built as a full-stack take-home assignment. It is production-shaped but runs locally only, on seeded mock data, with no auth.

## Source of truth: `docs/SYSTEM_DESIGN.md`

**Before planning or implementing any feature, change or new dependency:**

1. Read the relevant sections of `docs/SYSTEM_DESIGN.md`: architecture, approved libraries (§4), data model (§5), filter design (§6), API conventions (§7), AI rules (§8), design language and layout (§9) and coding conventions (§12).
2. Check that the work conforms.
3. If it does **not** conform, or the doc doesn't cover it, **stop and ask the user** whether to:
   - (a) update the design doc, or
   - (b) choose a different approach that conforms.

Never change the design silently. Every approved change is written into the doc first, with a version bump and a change log entry (§0), and only then implemented. New features are added to the feature log (§13).

Work one aspect at a time, and get the user's approval before moving on to the next.

## Stack (summary; details in the design doc)

- npm workspaces: `client/` (Vite + React + TS, React Router, React Query, shadcn/ui, Tailwind), `server/` (Express + TS, Drizzle ORM), `shared/` (types and Zod schemas)
- PostgreSQL via Docker Compose
- AI: `@anthropic-ai/sdk`, server-side only. Model from `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`)
- Tests: Vitest + Supertest (minimal: filter compiler, AI output validation, API integration)

## Commands

```bash
npm run db:up                  # start Docker Postgres (dev :5434, test :5435) and wait until healthy
npm run dev                    # API (:3001) + Vite client (:5173) as user "ana"
npm run dev -- --user=dana     # act as another seeded user
npm test                       # server tests (Vitest + Supertest, needs the test DB up)
npm run typecheck              # tsc across all workspaces
npm run lint                   # ESLint
npm run format                 # Prettier (format:check to verify only)
npm run db:generate            # drizzle-kit: generate a migration from server/src/db/schema.ts
npm run db:migrate             # apply migrations
npm run db:seed                # replace all data with the deterministic demo data (~500 tasks)
npm run db:reset               # drop everything, migrate, seed (local databases only)
```

Tests recreate the test database from the committed migrations before each run (`server/src/test/global-setup.ts`).

TypeScript is pinned to 6.0.x because typescript-eslint does not support TypeScript 7 yet.

AI features (§8) call Claude from the server with whatever credentials the Anthropic SDK finds: `ANTHROPIC_API_KEY`, or an `ant auth login` profile. Without credentials the app still works and AI requests return `AI_UNAVAILABLE`. Tests never call Claude (fake client); real calls during development need the user's OK first.
