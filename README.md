# Issue Tracker

A Linear-style issue tracker, built as a full-stack take-home assignment. It's built like production software (layered API, validated contracts, migrations, tests) but runs only on your machine, against a local Postgres filled with realistic demo data.

📐 **System design:** [`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md) is the source of truth for architecture, data model, API, UI and AI behavior, including a change log of every design decision.

## What it does

- **Tasks:** create, edit and delete tasks with status, priority, assignee, product, tags and an estimate in hours. Every change is recorded in the task's activity history.
- **Views by person, team and product:** My issues, Triage (open tasks with no owner), and each team's Active and Backlog pages. A task's team is its assignee's team.
- **List and board:** a dense list that loads more as you scroll, or a kanban board where you drag cards between status columns (also works from the keyboard).
- **Search and filters:** full-text search, plus a task number (`42`, `#42` or `TSK-42`). Filter chips cover any field (status, priority, assignee, team, product, tag, estimate, dates) and can be sorted. Filters live in the URL, so any view can be linked.
- **Saved views:** save any filter, sort and layout as a personal view in the sidebar, then edit, rename or delete it.
- **Keyboard-first:** a `⌘K` command palette (commands, pages, task search) and shortcuts for nearly everything (see below).
- **AI (Claude):** type a request in plain English ("high priority mobile bugs nobody owns") and press `Enter`. Claude turns it into editable filter chips. AI effort estimation and assignee suggestions are next on the roadmap (design doc §8).

There's no sign-in. The app acts as one of the seeded users, chosen when you start it.

## Tech stack

| Layer    | Stack                                                                            |
| -------- | -------------------------------------------------------------------------------- |
| Frontend | React + TypeScript, Vite, React Router, TanStack Query, shadcn/ui + Tailwind CSS |
| Backend  | Express + TypeScript, Drizzle ORM, PostgreSQL (Docker)                           |
| Shared   | Zod schemas and types used by both sides (`shared/`)                             |
| AI       | Anthropic TypeScript SDK (`claude-sonnet-5-5`), called from the server only      |
| Tooling  | npm workspaces, Vitest + Supertest, ESLint, Prettier                             |

## Running it locally

### Prerequisites

- **Node.js 22+** and npm
- **Docker** (Docker Desktop, OrbStack or similar) for Postgres
- **Optional, for the AI features:** Claude API access, either through `ant auth login` (the [Anthropic CLI](https://github.com/anthropics/anthropic-cli)) or an `ANTHROPIC_API_KEY`. Without it, everything else works and AI requests show a friendly "unavailable" message.

### Setup

```bash
git clone https://github.com/javy001/issue-tracker.git
cd issue-tracker
npm install

npm run db:up      # start Postgres in Docker (dev on :5434, tests on :5435)
npm run db:reset   # create the schema and load demo data (~500 tasks)
npm run dev        # start the API (:3001) and the web app (:5173)
```

Then open **http://localhost:5173**.

- **Act as a different user:** `npm run dev -- --user=dana`. Seeded users are `ana`, `ben`, `chen`, `dana`, `eli`, `fatima` and `gus`; the default is `ana`.
- **Configuration is optional:** the defaults work out of the box. To change ports, the database URL, the default user or the Claude model, copy `.env.example` to `.env` and edit it.
- **Ports:** Postgres uses 5434/5435 so it doesn't clash with a Postgres already running on 5432.

### Keyboard shortcuts

| Key                    | Action                                             |
| ---------------------- | -------------------------------------------------- |
| `⌘K` / `Ctrl+K`        | Command palette                                    |
| `/`                    | Focus search (type a request + `Enter` for AI)     |
| `C`                    | New task                                           |
| `J` / `K` or `↓` / `↑` | Move through the list; `Enter` opens a task        |
| `S` `P` `A` `E` `L`    | Set status / priority / assignee / estimate / tags |
| `G` then `M` / `E`     | Go to My issues / Engineering                      |
| `⌘B` / `Ctrl+B`        | Toggle list / board                                |
| `Esc`                  | Close the task panel                               |

## Useful scripts

| Command               | What it does                                                        |
| --------------------- | ------------------------------------------------------------------- |
| `npm run dev`         | API + web app with hot reload (`-- --user=<handle>` to switch user) |
| `npm run db:up`       | Start the dev and test databases (`db:down` stops them)             |
| `npm run db:reset`    | Drop everything, run migrations, reload demo data (local DBs only)  |
| `npm run db:seed`     | Replace all data with the deterministic demo data                   |
| `npm run db:migrate`  | Apply database migrations                                           |
| `npm run db:generate` | Generate a migration after changing `server/src/db/schema.ts`       |
| `npm test`            | Server tests: API, filter compiler, schema, AI with a mocked client |
| `npm run typecheck`   | TypeScript across all workspaces                                    |
| `npm run lint`        | ESLint (`npm run format` runs Prettier)                             |

Tests run against the separate test database, which is rebuilt from the migrations on each run, so `npm run db:up` must be running. They never call the real Claude API.

## Project structure

```
client/   React app: pages, components (list, board, detail panel, filter bar, ⌘K palette), API hooks
server/   Express API: routes → services → repositories, Drizzle schema + migrations, seed, AI client
shared/   Zod schemas and types shared by client and server (filter AST, API contracts, enums)
docs/     SYSTEM_DESIGN.md: the design source of truth
scripts/  dev.mjs: runs the API and web app together
```
