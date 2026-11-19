# Issue Tracker — System Design

> **Source of truth.** Every feature, dependency and structural change must conform to this document.
> If a change does not conform, or this document does not cover it, stop and ask the project owner whether to
> (a) update this document or (b) choose an approach that conforms. Approved changes are written here (and in the
> change log) _before_ the code that depends on them.

## 0. Status & change log

| Version | Date       | Change                                                                                                                                                                                                                                                                                         |
| ------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | 2026-11-19 | Initial draft: requirements, stack, architecture, approved design language. Open items marked **TBD**.                                                                                                                                                                                         |
| 0.2     | 2026-11-19 | Data model decisions: fixed status enum, 5-level priority enum, estimates in hours, products as a table referenced by FK.                                                                                                                                                                      |
| 0.3     | 2026-11-19 | Estimates: 0.5 h steps, 0.5–80 h. Task IDs: per-team numbers (ENG-142).                                                                                                                                                                                                                        |
| 0.4     | 2026-11-19 | Postgres full-text search, personal saved views, cursor pagination.                                                                                                                                                                                                                            |
| 0.5     | 2026-11-19 | Libraries approved: Zod, react-hotkeys-hook, @dnd-kit, ESLint + Prettier, tsx, lucide-react.                                                                                                                                                                                                   |
| 1.0     | 2026-11-19 | AI: effort `low` for all calls, server-side refusal fallback enabled. Keyboard map approved. All v0.1 open questions resolved.                                                                                                                                                                 |
| 1.1     | 2026-11-19 | Scaffold decisions: `pg` driver; `scripts/dev.mjs` runs client + server together (no runner library); Docker Postgres on ports 5434 (dev) / 5435 (test) so it doesn't clash with a local Postgres on 5432. Approved supporting packages for build/types, Tailwind + shadcn runtime and ESLint. |
| 1.2     | 2026-11-19 | Data model details: UUID primary keys; `teams.next_task_number` counter column; hard deletes with defined FK rules; `task_activity.kind` enum.                                                                                                                                                 |

As of v1.0 there are no open TBDs. New open questions go in §14 and are marked **TBD** where they appear.

---

## 1. Overview

A Linear-style issue tracker built as a full-stack take-home assignment.

- **Production-shaped, local-only.** Code is structured as if it would ship: layered backend, validation, migrations, typed contracts and error handling. It runs only on a developer machine against a local Postgres filled with seeded mock data.
- **No authentication.** Users are seeded records. The "current user" is chosen at startup (see §7.4).
- **Keyboard-first.** Every core action is reachable without a mouse.
- **AI assists, never acts silently.** AI output is always shown as a suggestion that the user accepts or dismisses.

### Goals

- Cover every functional requirement in §2 with a polished, coherent UI.
- Clean architecture that a reviewer can follow quickly.
- One-command local setup with realistic demo data.

### Non-goals

- Real authentication or authorization, deployment, multi-tenant isolation, real-time collaboration, notifications, and a mobile app.

---

## 2. Requirements

### 2.1 Functional (from the assignment)

| #   | Requirement                                                  | Covered in |
| --- | ------------------------------------------------------------ | ---------- |
| F1  | CRUD operations on tasks                                     | §5, §7     |
| F2  | Multiple users and teams                                     | §5, §7.4   |
| F3  | View tasks by person / team / product, plus other dimensions | §6, §9     |
| F4  | Search and filter tasks                                      | §6         |
| F5  | Tagging                                                      | §5         |
| F6  | Keyboard-first UX                                            | §9.4       |
| F7  | Statuses                                                     | §5         |
| F8  | Saved views                                                  | §5, §6     |
| F9  | Query/filter design                                          | §6         |
| F10 | AI: natural-language filtering                               | §8.1       |
| F11 | AI: automated effort estimation                              | §8.2       |
| F12 | AI: suggested assignees for unassigned tasks                 | §8.3       |

### 2.2 Non-functional

- **Validation:** every API input is validated with a shared schema (§4). Invalid input returns 400 with a structured error.
- **Errors:** consistent error format (§7.3). No unhandled promise rejections. The UI shows loading, empty and error states.
- **Performance:** list and filter requests stay under 200 ms locally at seed scale (~500 tasks), with indexes on the filtered columns.
- **Accessibility:** real buttons and inputs, visible focus, 4.5:1 text contrast in both themes, and status readable without color.
- **Type safety:** strict TypeScript everywhere. API request and response types come from the `shared` package.

### 2.3 Out of scope (for now)

Real auth, deployment, file attachments, comments/threads, notifications, real-time sync, and audit history beyond a simple activity list.

---

## 3. Architecture

```
┌──────────────────────────┐      JSON/REST       ┌────────────────────────────┐      SQL       ┌──────────────┐
│ client (React SPA, Vite) │ ───────────────────▶ │ server (Express + TS)      │ ─────────────▶ │ PostgreSQL   │
│ React Router, React Query│ ◀─────────────────── │ routes → services → repos  │ ◀───────────── │ (Docker)     │
└──────────────────────────┘                      │            │               │   Drizzle ORM  └──────────────┘
                                                  │            ▼               │
                                                  │  ai/ (Anthropic SDK) ──────┼──▶ Claude API
                                                  └────────────────────────────┘
```

### 3.1 Repository layout (npm workspaces)

```
/
├─ package.json            # workspaces: client, server, shared; root scripts (dev, db:*, test, lint)
├─ docker-compose.yml      # postgres (dev) + postgres-test
├─ .env.example
├─ docs/SYSTEM_DESIGN.md
├─ CLAUDE.md
├─ shared/                 # @tracker/shared — types, Zod schemas, filter AST, constants
│  └─ src/
├─ server/                 # @tracker/server
│  └─ src/
│     ├─ index.ts          # bootstrap
│     ├─ app.ts            # express app (exported for tests)
│     ├─ config.ts         # env parsing (validated)
│     ├─ db/               # drizzle schema, client, migrations, seed
│     ├─ routes/           # HTTP layer: parse/validate → call service → shape response
│     ├─ services/         # business logic
│     ├─ repositories/     # data access (Drizzle queries, filter compiler)
│     ├─ ai/               # Claude client, prompts, AI services
│     └─ middleware/       # current user, error handler, request logging
└─ client/                 # @tracker/client
   └─ src/
      ├─ main.tsx, App.tsx, routes/
      ├─ components/ui/    # shadcn-generated primitives (owned code)
      ├─ components/       # app components (TaskList, TaskBoard, TaskDetail, FilterBar, CommandPalette…)
      ├─ api/              # typed fetch client + React Query hooks
      ├─ hooks/            # keyboard shortcuts, etc.
      └─ styles/           # Tailwind + theme CSS variables
```

### 3.2 Request lifecycle

`route` (validates with a shared Zod schema) → `service` (business rules) → `repository` (Drizzle) → the response, typed with a `shared` type. Errors go to a single error middleware.

### 3.3 Configuration (`server/src/config.ts`, validated at startup)

| Var                 | Purpose                                                          | Default                                                  |
| ------------------- | ---------------------------------------------------------------- | -------------------------------------------------------- |
| `DATABASE_URL`      | Postgres connection                                              | `postgres://tracker:tracker@localhost:5434/tracker`      |
| `TEST_DATABASE_URL` | Test database (Vitest)                                           | `postgres://tracker:tracker@localhost:5435/tracker_test` |
| `PORT`              | API port                                                         | `3001`                                                   |
| `CURRENT_USER`      | Handle of the acting user (§7.4)                                 | `ana`                                                    |
| `ANTHROPIC_MODEL`   | Model for AI features                                            | `claude-sonnet-5-5`                                      |
| `ANTHROPIC_API_KEY` | Optional. When unset, the SDK uses the local `ant` login profile | —                                                        |

The client reaches the API through the Vite dev proxy (`/api` → `localhost:3001`), so it needs no CORS setup.

---

## 4. Tech stack & approved libraries

Adding a library that isn't listed here counts as a design change (ask first).

| Area                      | Library                                                                                                                     | Status                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Language                  | TypeScript (strict)                                                                                                         | Approved                     |
| Monorepo                  | npm workspaces                                                                                                              | Approved                     |
| Frontend build            | Vite                                                                                                                        | Approved                     |
| UI                        | React                                                                                                                       | Approved                     |
| Routing                   | React Router                                                                                                                | Approved                     |
| Server state              | TanStack React Query                                                                                                        | Approved                     |
| Components                | shadcn/ui (Radix primitives)                                                                                                | Approved                     |
| Styling                   | Tailwind CSS (required by shadcn)                                                                                           | Approved (implied by shadcn) |
| Command palette           | cmdk (shadcn `Command`)                                                                                                     | Approved (part of shadcn)    |
| Backend                   | Express                                                                                                                     | Approved                     |
| ORM / migrations          | Drizzle ORM + drizzle-kit                                                                                                   | Approved                     |
| Database                  | PostgreSQL via Docker Compose                                                                                               | Approved                     |
| Postgres driver           | pg (node-postgres), via `drizzle-orm/node-postgres`                                                                         | Approved (v1.1)              |
| Dev process runner        | none: `scripts/dev.mjs` spawns client + server and passes `--user`                                                          | Approved (v1.1)              |
| Build / types             | typescript, `@types/*` for approved libraries, @vitejs/plugin-react                                                         | Approved (v1.1)              |
| Tailwind + shadcn runtime | @tailwindcss/vite, class-variance-authority, clsx, tailwind-merge, tw-animate-css, Radix packages installed by `shadcn add` | Approved (v1.1)              |
| ESLint plugins            | @eslint/js, typescript-eslint, eslint-plugin-react-hooks, globals, eslint-config-prettier                                   | Approved (v1.1)              |
| AI                        | `@anthropic-ai/sdk` (server only)                                                                                           | Approved                     |
| Tests                     | Vitest + Supertest                                                                                                          | Approved                     |
| Validation                | Zod (shared between client and server; also validates AI output)                                                            | Approved                     |
| Keyboard shortcuts        | react-hotkeys-hook                                                                                                          | Approved                     |
| Board drag & drop         | @dnd-kit (status can also change via keyboard/menu)                                                                         | Approved                     |
| Lint / format             | ESLint + Prettier (shared root config)                                                                                      | Approved                     |
| Server dev runner         | tsx (`tsx watch`)                                                                                                           | Approved                     |
| Icons                     | lucide-react (shadcn default) + custom status/priority SVG components                                                       | Approved                     |

---

## 5. Data model (Drizzle / Postgres)

```
-- every id is uuid, default gen_random_uuid()
users(id, handle unique, name, avatar_color, created_at)
teams(id, key unique  -- e.g. "ENG", name, color, next_task_number int default 1, created_at)
team_members(team_id → teams, user_id → users, PK(team_id, user_id))
products(id, name unique, created_at)
tasks(
  id, team_id → teams, number   -- per-team sequence; display id = teams.key || '-' || number
  title, description, status, priority,
  assignee_id → users NULL,
  product_id → products NULL,
  estimate_hours numeric(5,1) NULL, estimate_source ('manual' | 'ai') NULL,
  created_by → users, created_at, updated_at,
  UNIQUE(team_id, number)
)
tags(id, name unique, color)
task_tags(task_id → tasks, tag_id → tags, PK(task_id, tag_id))
saved_views(id, owner_id → users, name, filter jsonb  -- FilterQuery (§6), display jsonb, created_at)
task_activity(id, task_id → tasks, actor_id → users NULL, kind, payload jsonb, created_at)  -- simple activity list
```

- **Primary keys (v1.2):** UUID (`gen_random_uuid()`). Tasks are addressed by display ID (`ENG-142`) in the API and UI.
- **Task numbers (v1.2):** creating a task runs `UPDATE teams SET next_task_number = next_task_number + 1 WHERE id = $1 RETURNING next_task_number - 1` in the same transaction as the insert. Numbers are never reused.
- **Deletes (v1.2):** hard deletes.

  | FK                                                                | On delete                                      |
  | ----------------------------------------------------------------- | ---------------------------------------------- |
  | `task_tags.task_id`, `task_activity.task_id`                      | cascade                                        |
  | `task_tags.tag_id`                                                | cascade (deleting a tag removes it from tasks) |
  | `team_members.*`                                                  | cascade                                        |
  | `tasks.assignee_id`, `tasks.product_id`, `task_activity.actor_id` | set null                                       |
  | `tasks.team_id`, `tasks.created_by`                               | restrict                                       |
  | `saved_views.owner_id`                                            | cascade                                        |

- **Activity kinds (v1.2):** Postgres enum `created, status_changed, priority_changed, assigned, estimated, tags_changed, edited`. `payload` holds `{ from, to }` values and `source: 'manual' | 'ai'`.

Indexes: `tasks(status)`, `tasks(assignee_id)`, `tasks(team_id)`, `tasks(product_id)`, `tasks(priority)`, `task_tags(tag_id)`, plus a search index (§6.3).

| Topic           | Options                                                                                  | Recommendation                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Statuses**    | **Decided:** fixed Postgres enum `backlog, todo, in_progress, in_review, done, canceled` | Same set for every team                                                                                          |
| **Priority**    | **Decided:** Postgres enum `none, low, medium, high, urgent`                             | Sorted by rank (urgent first)                                                                                    |
| **Estimates**   | **Decided:** hours, 0.5 h steps, 0.5–80 h                                                | `estimate_hours numeric(5,1)` with a CHECK constraint; validated in the shared schema. Displayed as `4h`, `1.5h` |
| **Products**    | **Decided:** own table; `tasks.product_id` FK → `products.id`                            | Enables view/filter by product                                                                                   |
| **Task number** | **Decided:** per-team counter                                                            | Display ID = team key + number (`ENG-142`); assigned in a transaction; internal `id` stays the primary key       |

Migrations are generated with drizzle-kit and committed. They are never edited after being applied.

---

## 6. Query / filter design

One **filter AST**, defined in `shared/`, is used everywhere: the UI filter chips, URL state, the API, saved views and AI natural-language filtering (Claude outputs this same structure). The server compiles it into Drizzle SQL.

### 6.1 Shape (draft)

```ts
type Field =
  | 'status'
  | 'priority'
  | 'assignee'
  | 'team'
  | 'product'
  | 'tag'
  | 'estimate'
  | 'createdAt'
  | 'updatedAt';
type Op =
  | 'is'
  | 'isNot'
  | 'isAnyOf'
  | 'isNoneOf'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'between';

interface Condition {
  field: Field;
  op: Op;
  value?: string | number | string[] | [string, string];
}
interface FilterQuery {
  conditions: Condition[]; // AND-ed together (v1: no nested OR groups)
  search?: string; // free-text over title + description
  sort?: { field: 'priority' | 'updatedAt' | 'createdAt' | 'estimate'; dir: 'asc' | 'desc' };
  groupBy?: 'status' | 'assignee' | 'team' | 'product' | 'priority' | null;
}
```

- Special values: `assignee: 'me'` resolves to the current user, and `isEmpty` on `assignee` means unassigned.
- Values reference stable identifiers (handles, team keys, product names, tag names). The server resolves them to IDs and rejects unknown ones with 400.
- **Views by dimension (F3)** are presets of this AST: "My issues" = `assignee is me`, a team page = `team is ENG`, and so on.
- The filter is mirrored into the URL (encoded query string), so views can be linked to and survive a page reload.

### 6.2 Saved views

A saved view stores the `FilterQuery` plus display options (`list`/`board`, density). Saved views are personal (owned by the current user).
**Decided:** personal only for v1 (no team-shared views).

### 6.3 Text search

**Decided:** Postgres full-text search: a generated `tsvector` column on title (weight A) + description (weight B) with a GIN index, queried with `websearch_to_tsquery` and ranked by `ts_rank` when a search term is present. A query that looks like a display ID (`ENG-142`) also matches that task exactly.

---

## 7. API design

REST + JSON under `/api`. Request and response types come from `shared/`.

### 7.1 Endpoints (draft)

| Method       | Path                                                     | Purpose                                        |
| ------------ | -------------------------------------------------------- | ---------------------------------------------- |
| GET          | `/api/me`                                                | Current user                                   |
| GET          | `/api/users`, `/api/teams`, `/api/products`, `/api/tags` | Reference data                                 |
| POST         | `/api/tags`                                              | Create tag                                     |
| GET          | `/api/tasks?filter=<FilterQuery JSON>&cursor=&limit=`    | List / filter / search tasks                   |
| GET          | `/api/tasks/:id`                                         | Task detail (+ activity)                       |
| POST         | `/api/tasks`                                             | Create task                                    |
| PATCH        | `/api/tasks/:id`                                         | Update fields (partial)                        |
| DELETE       | `/api/tasks/:id`                                         | Delete task                                    |
| GET/POST     | `/api/views`                                             | List / create saved views                      |
| PATCH/DELETE | `/api/views/:id`                                         | Update / delete saved view                     |
| POST         | `/api/ai/parse-filter`                                   | Natural language → `FilterQuery` (§8.1)        |
| POST         | `/api/ai/estimate`                                       | Suggest an estimate for a task or draft (§8.2) |
| POST         | `/api/ai/suggest-assignee`                               | Ranked assignee suggestions (§8.3)             |

`:id` accepts the display ID (`ENG-142`).

### 7.2 Pagination & sorting

**Decided:** cursor pagination. The cursor is opaque (base64 of the last row's `(sortKey, id)`); default `limit` 50, max 200. Responses are `{ items, nextCursor | null }`. The client uses React Query `useInfiniteQuery`. The board view loads per status column with the same endpoint.

### 7.3 Error format

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Human readable", "details": [ ... ] } }
```

Codes: `VALIDATION_ERROR` (400), `NOT_FOUND` (404), `CONFLICT` (409), `AI_UNAVAILABLE` (503), `INTERNAL` (500).

### 7.4 Current user (no auth)

- `npm run dev -- --user=<handle>` sets `CURRENT_USER` for the server. The default is `ana`.
- Middleware loads that user once at startup and attaches it to `req.user`. An unknown handle makes startup fail with a clear message.
- The client reads `/api/me`. It never sends a user ID for "who am I".
- Because the user is resolved in one place, real auth could later replace only this middleware.

---

## 8. AI features

All AI calls live in `server/src/ai/` and use `@anthropic-ai/sdk`. The browser never talks to Claude, and credentials never leave the server.

### 8.0 Shared rules

- **Model:** `ANTHROPIC_MODEL`, default `claude-sonnet-5-5`, changeable in config only.
- **Structured output:** every feature requests JSON through structured outputs (`output_config.format` with a JSON schema) and validates it again with the shared Zod schema. Forced `tool_choice` is not used, because current models reject it.
- **Grounding:** prompts include only the reference data that's needed (allowed statuses, team keys, product names, tag names, user handles). Output that references unknown values is rejected.
- **User confirms:** results are returned as suggestions. The UI shows them with the AI marker (§9.1) and applies them only when the user clicks.
- **Failure:** timeouts, refusals (`stop_reason: "refusal"`) and invalid output return `AI_UNAVAILABLE`. The UI degrades gracefully: the manual filter still works and suggestion cards stay hidden.
- **Testing:** the Claude client sits behind an interface and is mocked in tests (§11).
- **Effort:** `output_config.effort = "low"` for all three features (fast and cheap). Revisit only if quality falls short in testing.
- **Refusal fallback:** requests send the server-side fallback beta (`server-side-fallback-2026-07-01`) with `fallbacks: "default"`. A refusal that persists after the fallback still maps to `AI_UNAVAILABLE`.
- **Model constraints:** on `claude-sonnet-5-5`, thinking can't be disabled with `{type: "disabled"}` and sampling parameters (`temperature` etc.) are not sent. Effort is the only tuning knob.

### 8.1 Natural-language filtering

Input: free text, plus reference data and today's date. Output: `FilterQuery` (§6.1) and a short `interpretation` string. The UI shows the parsed conditions as editable chips ("Understood as …"), so the user can see and correct what the AI understood. The result can be saved as a view.

### 8.2 Effort estimation

Input: the task's title, description, tags and product, plus a sample of similar completed tasks with their estimates (picked by the same product and tags and a text-search match). Output: `{ estimateHours: number, rationale, similarTaskIds[] }` (validated against the allowed range and step). Accepting it sets `estimate_source = 'ai'`. Triggered on demand (a button) and shown automatically for unestimated tasks in the detail panel.

### 8.3 Suggested assignees

Input: the task, plus the members of the task's team, each with their recent completed tasks (titles and tags) and current open workload. Output: up to 3 `{ handle, score, reason }` ranked. Shown for unassigned tasks: one-click assign or dismiss.

---

## 9. Frontend design

### 9.1 Design language (approved 2026-11-19)

Reference mockup: <https://claude.ai/artifact/H2LzoXZcBd3hrE29NoKe79>

- **Character:** dark-first (light theme supported), dense, keyboard-first, neutral grays with one accent. Color is reserved for meaning: status, urgent priority and AI.
- **Type:** Inter for UI text and JetBrains Mono for IDs, key hints and code-like values.

  | Token   | Size / weight | Use                             |
  | ------- | ------------- | ------------------------------- |
  | title   | 17 / 600      | Task title in detail panel      |
  | section | 14 / 600      | Page / section headings         |
  | body    | 13 / 400      | Default UI text, list rows      |
  | meta    | 12 / 400      | Counts, secondary info, buttons |
  | label   | 11 / 500      | Sidebar group labels, tags, kbd |
  | mono    | 12 / 400      | Task IDs, kbd                   |

- **Color tokens** (implemented as shadcn CSS variables):

  | Token         | Dark                                      | Light     |
  | ------------- | ----------------------------------------- | --------- |
  | background    | `#0E0F11`                                 | `#FFFFFF` |
  | sidebar       | `#131417`                                 | `#F7F7F8` |
  | surface/panel | `#17181B`                                 | `#FFFFFF` |
  | raised        | `#1F2025`                                 | `#F1F2F4` |
  | selected      | `#23252C`                                 | `#ECEEF3` |
  | border        | `#26282E`                                 | `#E4E5E9` |
  | border-strong | `#363940`                                 | `#D3D5DB` |
  | text          | `#E7E8EA`                                 | `#17181B` |
  | text-muted    | `#A0A3AB`                                 | `#575B64` |
  | text-subtle   | `#8B8F98`                                 | `#646872` |
  | accent        | `#4A6EE0`                                 | `#4A6EE0` |
  | accent-text   | `#9DB2FF` (accent mixed 45% toward white) | `#4A6EE0` |

  Status colors (dark / light): in progress `#F2B441` / `#B26A00`, in review `#6FA3FF` / `#2F64C8`, done `#57C08A` / `#24804F`, backlog/todo/canceled gray. Urgent: `#E8743A` / `#C2410C`.

- **Spacing:** 4 px base (4, 8, 12, 16, 24, 32). **Radii:** 4 (kbd), 6 (buttons, inputs), 8 (cards), 12 (dialogs).
- **Iconography:** each status has its own shape (dashed ring = backlog, empty = todo, half = in progress, ¾ = in review, solid + check = done, solid + × = canceled). Priority uses bars (low, medium, high), an orange square with "!" for urgent, and dashes for none.
- **AI marker:** a sparkle icon + accent tint (`accent` at 14% / 7% alpha) on every AI-produced value or suggestion.
- **Density:** list rows are 36 px (compact, the default) or 44 px (comfortable).
- **Estimates** are displayed in hours (`4h`). The mockup still shows points; that is superseded by §5.

### 9.2 Layout

- **Three panes:** sidebar (~220 px) | main (list or board) | task detail panel (~340 px, closable). Panes stack on narrow screens.
- **Sidebar:** workspace, search, new task, Inbox, My issues, All views, Teams (each with Active / Backlog / Triage), Saved views, and a current-user footer showing `--user=<handle>`.
- **Main header:** breadcrumb, List/Board toggle, Display options, ⌘K trigger, and New task (`C`).
- **Below the header:** the natural-language filter bar with parsed condition chips, Clear, and Save as view. Then a count row.
- **List view:** priority, ID, status, title, tags, AI hint, estimate, assignee.
- **Board view:** columns by status, cards with ID, title, priority, tags, estimate and assignee.

### 9.3 Routes (draft)

`/` → redirect to `/my-issues` · `/my-issues` · `/team/:teamKey/:tab(active|backlog|triage)` · `/views/:viewId` · `/task/:taskId` (detail opens over the current list) · filter state in `?q=`.

### 9.4 Keyboard map (approved)

| Key                      | Action                                                                           |
| ------------------------ | -------------------------------------------------------------------------------- |
| `⌘K` / `Ctrl+K`          | Command palette                                                                  |
| `/`                      | Focus the natural-language filter                                                |
| `C`                      | New task                                                                         |
| `J` / `K` or `↑` / `↓`   | Move selection                                                                   |
| `Enter`                  | Open task                                                                        |
| `Esc`                    | Close panel / dialog, return focus to the list                                   |
| `S`, `P`, `A`, `E`, `L`  | Set status / priority / assignee / estimate / labels (tags) on the selected task |
| `G` then `I` / `M` / `E` | Go to Inbox / My issues / Engineering                                            |
| `⌘B`                     | Toggle list / board                                                              |

Implemented with react-hotkeys-hook. Shortcuts are disabled while typing in inputs and are listed in the command palette.

### 9.5 Data fetching

React Query hooks in `client/src/api/`, with query keys like `['tasks', filterQuery]` and `['task', id]`. Mutations update optimistically and roll back on error. Tasks from filtered lists are invalidated after mutations.

---

## 10. Local development & mock data

```bash
docker compose up -d          # Postgres (dev :5434, test :5435)
npm install
npm run db:migrate            # drizzle-kit migrations
npm run db:seed               # deterministic demo data
npm run dev                   # scripts/dev.mjs: client (Vite) + server (tsx watch); default user "ana"
npm run dev -- --user=dana    # act as another seeded user
```

- **Seed (deterministic):** 5–8 users, 3 teams (Engineering, Design, Platform), 3 products (Web App, API, Mobile), ~10 tags, ~500 tasks spread realistically across statuses, priorities and assignees. Some tasks are unassigned and some unestimated, so the AI features have material to show. Also a few saved views per user.
- `npm run db:reset` drops, migrates and re-seeds.

---

## 11. Testing strategy (minimal by decision)

- **Tools:** Vitest + Supertest, against the separate `postgres-test` database.
- **Required:**
  - Unit tests for the filter compiler (AST → SQL) and for AI output validation.
  - API integration tests for task CRUD, filtering and search, and saved views.
- **AI calls** are always mocked. Tests never hit the Claude API.
- **Frontend:** no automated tests required for v1.

---

## 12. Coding conventions

- Strict TS. No `any` without a comment saying why.
- Files use `kebab-case.ts`. React components use `PascalCase.tsx`.
- Contracts live only in `shared/`. Neither the client nor the server redefines API types.
- Layering is respected: routes never call Drizzle directly, and services never touch `req`/`res`.
- Errors are thrown as typed `AppError(code, message, details)` and mapped by the error middleware.
- shadcn components are generated into `client/src/components/ui/` and themed only through CSS variables (§9.1).
- Lint and format with the root ESLint + Prettier config. Code is formatted before commit.

---

## 13. Feature log

| Feature                     | Status              | Spec / sections |
| --------------------------- | ------------------- | --------------- |
| Design language mockup      | Approved 2026-11-19 | §9.1, §9.2      |
| Workspace scaffold          | Done 2026-11-19     | §3, §4, §10     |
| Data model, migration, seed | Done 2026-11-19     | §5, §6.3, §10   |

---

## 14. Open questions

1. ~~Data model (§5)~~ decided in v0.2–v0.3
2. ~~Search, saved views, pagination (§6, §7)~~ decided in v0.4
3. ~~Extra libraries (§4)~~ decided in v0.5
4. ~~AI settings (§8.0), keyboard map (§9.4)~~ decided in v1.0

_No open questions._
