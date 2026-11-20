# Issue Tracker — System Design

> **Source of truth.** Every feature, dependency and structural change must conform to this document.
> If a change does not conform, or this document does not cover it, stop and ask the project owner whether to
> (a) update this document or (b) choose an approach that conforms. Approved changes are written here (and in the
> change log) _before_ the code that depends on them.

## 0. Status & change log

| Version | Date       | Change                                                                                                                                                                                                                                                                                                                                           |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.1     | 2026-11-19 | Initial draft: requirements, stack, architecture, approved design language. Open items marked **TBD**.                                                                                                                                                                                                                                           |
| 0.2     | 2026-11-19 | Data model decisions: fixed status enum, 5-level priority enum, estimates in hours, products as a table referenced by FK.                                                                                                                                                                                                                        |
| 0.3     | 2026-11-19 | Estimates: 0.5 h steps, 0.5–80 h. Task IDs: per-team numbers (ENG-142).                                                                                                                                                                                                                                                                          |
| 0.4     | 2026-11-19 | Postgres full-text search, personal saved views, cursor pagination.                                                                                                                                                                                                                                                                              |
| 0.5     | 2026-11-19 | Libraries approved: Zod, react-hotkeys-hook, @dnd-kit, ESLint + Prettier, tsx, lucide-react.                                                                                                                                                                                                                                                     |
| 1.0     | 2026-11-19 | AI: effort `low` for all calls, server-side refusal fallback enabled. Keyboard map approved. All v0.1 open questions resolved.                                                                                                                                                                                                                   |
| 1.1     | 2026-11-19 | Scaffold decisions: `pg` driver; `scripts/dev.mjs` runs client + server together (no runner library); Docker Postgres on ports 5434 (dev) / 5435 (test) so it doesn't clash with a local Postgres on 5432. Approved supporting packages for build/types, Tailwind + shadcn runtime and ESLint.                                                   |
| 1.2     | 2026-11-19 | Data model details: UUID primary keys; `teams.next_task_number` counter column; hard deletes with defined FK rules; `task_activity.kind` enum.                                                                                                                                                                                                   |
| 1.3     | 2026-11-19 | Tasks no longer belong to a team: team is derived from the assignee; one team per user. Global task IDs `TSK-<n>` (replaces per-team numbers and `teams.next_task_number`). Filter AST approved with per-field operators. API responses use stable identifiers; list responses add `total`. AI assignee candidates come from the task's product. |
| 1.4     | 2026-11-19 | Task screen: open task in `?task=` on the current list (no `/task/:id` route); Inbox removed; Triage is a top-level, workspace-wide page; team pages have Active / Backlog with defined filters; routes approved.                                                                                                                                |
| 1.5     | 2026-11-19 | Approved the `cn` package (shadcn-ui) used by generated shadcn components; it replaces clsx + tailwind-merge.                                                                                                                                                                                                                                    |
| 1.6     | 2026-11-19 | Task create/edit/delete UI: New task dialog prefilled from the current page, inline title/description editing, delete behind a confirmation dialog.                                                                                                                                                                                              |
| 1.7     | 2026-11-19 | Board view: columns are the statuses the page allows, drag changes status only (no manual order), List/Board stored as `?layout=board`.                                                                                                                                                                                                          |
| 1.8     | 2026-11-19 | Filter bar: manual chips always available (also after AI), text box searches until the AI step, page base filters hidden, state in `?q=`. Saved views: save/edit/rename/delete, sort saved with views, `SavedViewDto` API. "All views" removed from the sidebar.                                                                                 |
| 1.9     | 2026-11-19 | Keyboard: J/K move a focus highlight; S/P/A/E/L act on the highlighted row, else the open task; their choices appear in the ⌘K palette. Palette: actions, navigation, task search.                                                                                                                                                               |
| 1.10    | 2026-11-19 | Search: a bare number, `#n` or `TSK-n` matches that task exactly and is shown first when sorted by relevance.                                                                                                                                                                                                                                    |
| 1.11    | 2026-11-19 | AI natural-language filter: Enter or ✨ in the search box, result replaces chips/search/sort, flat structured-output schema converted and validated server-side, prompt caching. AI features built one per step: filter, estimate, assignee.                                                                                                     |
| 1.12    | 2026-11-20 | AI effort estimate: on demand only (✨ Suggest in the detail panel, any task), response returns similar tasks with titles and hours, similar-task ranking and validation defined.                                                                                                                                                                |
| 1.13    | 2026-11-20 | AI suggested assignees: on demand only (✨ Suggest in the detail panel, unassigned tasks), candidate data and validation defined, score 0–100, `409` for assigned tasks.                                                                                                                                                                         |

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

| Area                      | Library                                                                                                                                                                                             | Status                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Language                  | TypeScript (strict)                                                                                                                                                                                 | Approved                     |
| Monorepo                  | npm workspaces                                                                                                                                                                                      | Approved                     |
| Frontend build            | Vite                                                                                                                                                                                                | Approved                     |
| UI                        | React                                                                                                                                                                                               | Approved                     |
| Routing                   | React Router                                                                                                                                                                                        | Approved                     |
| Server state              | TanStack React Query                                                                                                                                                                                | Approved                     |
| Components                | shadcn/ui (Radix primitives)                                                                                                                                                                        | Approved                     |
| Styling                   | Tailwind CSS (required by shadcn)                                                                                                                                                                   | Approved (implied by shadcn) |
| Command palette           | cmdk (shadcn `Command`)                                                                                                                                                                             | Approved (part of shadcn)    |
| Backend                   | Express                                                                                                                                                                                             | Approved                     |
| ORM / migrations          | Drizzle ORM + drizzle-kit                                                                                                                                                                           | Approved                     |
| Database                  | PostgreSQL via Docker Compose                                                                                                                                                                       | Approved                     |
| Postgres driver           | pg (node-postgres), via `drizzle-orm/node-postgres`                                                                                                                                                 | Approved (v1.1)              |
| Dev process runner        | none: `scripts/dev.mjs` spawns client + server and passes `--user`                                                                                                                                  | Approved (v1.1)              |
| Build / types             | typescript, `@types/*` for approved libraries, @vitejs/plugin-react                                                                                                                                 | Approved (v1.1)              |
| Tailwind + shadcn runtime | @tailwindcss/vite, class-variance-authority, `cn` (shadcn-ui class-name merging; replaces clsx + tailwind-merge, v1.5), tw-animate-css, cmdk, `radix-ui` / Radix packages installed by `shadcn add` | Approved (v1.1, v1.5)        |
| ESLint plugins            | @eslint/js, typescript-eslint, eslint-plugin-react-hooks, globals, eslint-config-prettier                                                                                                           | Approved (v1.1)              |
| AI                        | `@anthropic-ai/sdk` (server only)                                                                                                                                                                   | Approved                     |
| Tests                     | Vitest + Supertest                                                                                                                                                                                  | Approved                     |
| Validation                | Zod (shared between client and server; also validates AI output)                                                                                                                                    | Approved                     |
| Keyboard shortcuts        | react-hotkeys-hook                                                                                                                                                                                  | Approved                     |
| Board drag & drop         | @dnd-kit (status can also change via keyboard/menu)                                                                                                                                                 | Approved                     |
| Lint / format             | ESLint + Prettier (shared root config)                                                                                                                                                              | Approved                     |
| Server dev runner         | tsx (`tsx watch`)                                                                                                                                                                                   | Approved                     |
| Icons                     | lucide-react (shadcn default) + custom status/priority SVG components                                                                                                                               | Approved                     |

---

## 5. Data model (Drizzle / Postgres)

```
-- every id is uuid, default gen_random_uuid()
users(id, handle unique, name, avatar_color, created_at)
teams(id, key unique  -- e.g. "ENG", name, color, created_at)
team_members(team_id → teams, user_id → users UNIQUE, PK(team_id, user_id))  -- one team per user (v1.3)
products(id, name unique, created_at)
tasks(
  id, number UNIQUE generated always as identity   -- global sequence; display id = 'TSK-' || number (v1.3)
  title, description, status, priority,
  assignee_id → users NULL,      -- a task's team is derived from its assignee (v1.3)
  product_id → products NULL,
  estimate_hours numeric(5,1) NULL, estimate_source ('manual' | 'ai') NULL,
  created_by → users, created_at, updated_at
)
tags(id, name unique, color)
task_tags(task_id → tasks, tag_id → tags, PK(task_id, tag_id))
saved_views(id, owner_id → users, name, filter jsonb  -- FilterQuery (§6), display jsonb, created_at)
task_activity(id, task_id → tasks, actor_id → users NULL, kind, payload jsonb, created_at)  -- simple activity list
```

- **Primary keys (v1.2):** UUID (`gen_random_uuid()`). Tasks are addressed by display ID (`TSK-142`) in the API and UI.
- **Tasks have no team (v1.3):** a task belongs to an optional product and an optional assignee. Its team is the assignee's team; unassigned tasks have no team.
- **One team per user (v1.3):** `team_members.user_id` is unique, so each user is in at most one team.
- **Task numbers (v1.3):** one workspace-wide Postgres identity sequence; display ID `TSK-<number>`. IDs never change (not when the product or assignee changes) and are never reused. Gaps from rolled-back inserts are acceptable.
- **Deletes (v1.2):** hard deletes.

  | FK                                                                | On delete                                      |
  | ----------------------------------------------------------------- | ---------------------------------------------- |
  | `task_tags.task_id`, `task_activity.task_id`                      | cascade                                        |
  | `task_tags.tag_id`                                                | cascade (deleting a tag removes it from tasks) |
  | `team_members.*`                                                  | cascade                                        |
  | `tasks.assignee_id`, `tasks.product_id`, `task_activity.actor_id` | set null                                       |
  | `tasks.created_by`                                                | restrict                                       |
  | `saved_views.owner_id`                                            | cascade                                        |

- **Activity kinds (v1.2):** Postgres enum `created, status_changed, priority_changed, assigned, estimated, tags_changed, edited`. `payload` holds `{ from, to }` values and `source: 'manual' | 'ai'`.

Indexes: `tasks(status)`, `tasks(assignee_id)`, `tasks(product_id)`, `tasks(priority)`, `task_tags(tag_id)`, plus a search index (§6.3).

| Topic           | Options                                                                                  | Recommendation                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Statuses**    | **Decided:** fixed Postgres enum `backlog, todo, in_progress, in_review, done, canceled` | Same set for every team                                                                                          |
| **Priority**    | **Decided:** Postgres enum `none, low, medium, high, urgent`                             | Sorted by rank (urgent first)                                                                                    |
| **Estimates**   | **Decided:** hours, 0.5 h steps, 0.5–80 h                                                | `estimate_hours numeric(5,1)` with a CHECK constraint; validated in the shared schema. Displayed as `4h`, `1.5h` |
| **Products**    | **Decided:** own table; `tasks.product_id` FK → `products.id`                            | Enables view/filter by product                                                                                   |
| **Task number** | **Decided (v1.3):** global sequence                                                      | Display ID `TSK-<n>`; internal `id` stays the primary key                                                        |

Migrations are generated with drizzle-kit and committed. They are never edited after being applied.

---

## 6. Query / filter design

One **filter AST**, defined in `shared/`, is used everywhere: the UI filter chips, URL state, the API, saved views and AI natural-language filtering (Claude outputs this same structure). The server compiles it into Drizzle SQL.

### 6.1 Shape (approved v1.3)

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
- **`team` is derived (v1.3):** `team is ENG` matches tasks whose assignee is a member of ENG. Unassigned tasks match no team (`team isEmpty` matches them).
- **Dates** are ISO 8601 strings (`2026-11-19` or a full timestamp). `between` takes `[from, to]`, both inclusive.
- **`groupBy`** is applied by the client. The server ignores it.
- **Operators per field (v1.3):**

  | Field                    | Operators                                                                 | Value                   |
  | ------------------------ | ------------------------------------------------------------------------- | ----------------------- |
  | `status`, `priority`     | is, isNot, isAnyOf, isNoneOf                                              | enum value(s)           |
  | `assignee`               | is, isNot, isAnyOf, isNoneOf, isEmpty, isNotEmpty                         | handle(s); `me` allowed |
  | `team`                   | is, isNot, isAnyOf, isNoneOf, isEmpty, isNotEmpty                         | team key(s)             |
  | `product`                | is, isNot, isAnyOf, isNoneOf, isEmpty, isNotEmpty                         | product name(s)         |
  | `tag`                    | is (has), isNot (lacks), isAnyOf, isNoneOf, isEmpty (no tags), isNotEmpty | tag name(s)             |
  | `estimate`               | is, lt, lte, gt, gte, between, isEmpty, isNotEmpty                        | hours                   |
  | `createdAt`, `updatedAt` | lt, lte, gt, gte, between                                                 | ISO date(s)             |

- **Default sort:** priority, most urgent first. When `search` is set and no sort is given, results are ordered by search rank.
- **Views by dimension (F3)** are presets of this AST: "My issues" = `assignee is me`, a team page = `team is ENG`, and so on.
- The filter is mirrored into the URL (encoded query string), so views can be linked to and survive a page reload.

### 6.2 Saved views

A saved view stores the `FilterQuery` plus display options (`list`/`board`, density). Saved views are personal (owned by the current user).
**Decided:** personal only for v1 (no team-shared views).

**Behavior (v1.8):**

- **Save as view** works from any page and asks for a name. The saved `FilterQuery` is the page's base conditions plus your chips, search text and sort, so the view reproduces exactly what you saw; `display` stores the layout (`{ layout: 'list' | 'board' }`).
- Views are listed in the sidebar's Saved views section. Opening one (`/views/:viewId`) shows all its conditions as editable chips (a view has no hidden base). Changes are kept in the URL until you choose **Save changes**; **Rename** and **Delete** (with confirmation) are in a ⋯ menu.
- A **Sort** menu (priority, updated, created, estimate; ascending or descending) is part of the filter state and is saved with views.
- The API validates stored filters with the shared `filterQuerySchema`; another user's view returns 404.

```ts
interface SavedViewDto {
  id: string;
  name: string;
  filter: FilterQuery;
  display: { layout: 'list' | 'board' };
  createdAt: string;
}
// POST /api/views { name, filter, display } · PATCH /api/views/:id { name?, filter?, display? } · DELETE → 204
```

### 6.3 Text search

**Decided:** Postgres full-text search: a generated `tsvector` column on title (weight A) + description (weight B) with a GIN index, queried with `websearch_to_tsquery` and ranked by `ts_rank` when a search term is present. A query that is a task reference also matches that task exactly (v1.10): `142`, `#142` or `TSK-142` (case-insensitive). When results are ordered by relevance (search with no explicit sort), the exact match comes first; text that merely contains the number still matches as usual. This applies wherever search runs (filter bar, ⌘K palette).

---

## 7. API design

REST + JSON under `/api`. Request and response types come from `shared/`.

### 7.1 Endpoints (draft)

| Method       | Path                                                     | Purpose                                               |
| ------------ | -------------------------------------------------------- | ----------------------------------------------------- |
| GET          | `/api/me`                                                | Current user                                          |
| GET          | `/api/users`, `/api/teams`, `/api/products`, `/api/tags` | Reference data                                        |
| POST         | `/api/tags`                                              | Create tag                                            |
| GET          | `/api/tasks?filter=<FilterQuery JSON>&cursor=&limit=`    | List / filter / search tasks                          |
| GET          | `/api/tasks/:id`                                         | Task detail (+ activity)                              |
| POST         | `/api/tasks`                                             | Create task                                           |
| PATCH        | `/api/tasks/:id`                                         | Update fields (partial)                               |
| DELETE       | `/api/tasks/:id`                                         | Delete task                                           |
| GET/POST     | `/api/views`                                             | List / create saved views                             |
| PATCH/DELETE | `/api/views/:id`                                         | Update / delete saved view                            |
| POST         | `/api/ai/parse-filter`                                   | Natural language → `FilterQuery` (§8.1)               |
| POST         | `/api/ai/estimate`                                       | Suggest an estimate for a task or draft (§8.2, v1.12) |
| POST         | `/api/ai/suggest-assignee`                               | Ranked assignee suggestions (§8.3)                    |

`:id` accepts the display ID (`TSK-142`).

**Response shapes (v1.3):** related records are referenced by stable identifiers, the same ones the filter AST uses. The client joins names and colors from cached reference data.

```ts
interface TaskDto {
  id: string; // display ID, e.g. "TSK-142"
  number: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: string | null; // user handle
  product: string | null; // product name
  tags: string[]; // tag names, sorted
  estimateHours: number | null;
  estimateSource: 'manual' | 'ai' | null;
  createdBy: string; // user handle
  createdAt: string;
  updatedAt: string; // ISO timestamps
}
// GET /api/tasks/:id adds: activity: { id, kind, actor: handle | null, payload, createdAt }[]
// GET /api/users items include `team` (team key or null)
```

### 7.2 Pagination & sorting

**Decided:** cursor pagination. The cursor is opaque (base64 of the last row's `(sortKey, id)`); default `limit` 50, max 200. Responses are `{ items, nextCursor | null, total }`, where `total` is the number of tasks matching the filter (v1.3; powers the count row and board column counts). The client uses React Query `useInfiniteQuery`. The board view loads per status column with the same endpoint.

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

**Details (v1.11):**

- **Trigger:** in the filter bar's text box, typing still searches live (§6.3). `Enter` or the ✨ button sends the text to `POST /api/ai/parse-filter` `{ text }` → `{ filter: FilterQuery, interpretation: string }`.
- **Result replaces** your chips, search and sort (the page's hidden base filter still applies). The chips stay fully editable; an "✨ Understood as …" line shows the interpretation until you change the filter or dismiss it.
- **No filter found:** if Claude returns no conditions and no sort, the text stays a plain search and the line says so.
- **Model output shape:** structured outputs can't express the AST's tuples or numeric limits, so Claude fills a flat schema (`field`, `op`, `values[]`, `numbers[]`, `dates[]` per condition; `values` limited to the known identifiers). The server converts it to `FilterQuery`, validates it with `filterQuerySchema`, and checks identifiers like any filter; anything invalid → `AI_UNAVAILABLE`.
- **Prompt:** a stable system prompt (field semantics, operators, reference data, `me` = current user) with automatic prompt caching; today's date goes in the user message so the cached prefix stays stable.

### 8.2 Effort estimation

Input: the task's title, description, tags and product, plus a sample of similar completed tasks with their estimates (picked by the same product and tags and a text-search match). Output: an estimate in hours, a short rationale and the similar tasks it was based on (validated against the allowed range and step). Accepting it sets `estimate_source = 'ai'`.

**Details (v1.12):**

- **Trigger:** on demand only. A ✨ **Suggest** button next to Estimate in the detail panel, available for every task (estimated or not). Nothing runs automatically when a task is opened. The New task dialog has no button yet.
- **Endpoint:** `POST /api/ai/estimate` with `{ taskId: "TSK-142" }` or `{ draft: { title, description?, tags?, product? } }` → `{ estimateHours, rationale, similarTasks: { id, title, estimateHours }[] }`.
- **Similar tasks:** up to 12 tasks with status `done` and an estimate, excluding the task itself, ranked by a text match on title and description (any of the words), +1 for the same product and +0.5 per shared tag.
- **Validation:** Claude's hours are rounded to the nearest 0.5 h and checked with `estimateHoursSchema` (0.5–80 h); out of range → `AI_UNAVAILABLE`. Similar-task IDs are limited (schema enum) to the tasks that were sent.
- **UI:** while waiting, the button reads "Estimating…". The result is a suggestion card with the AI marker: "Suggested estimate: 4h", the rationale, "Based on TSK-12 (3h) · TSK-40 (4h)" (links open those tasks), and **Accept** / **Dismiss**. Accept saves `estimateHours` with `estimateSource: 'ai'`. On failure a short muted message replaces the card. The card is discarded when another task is opened.
- **Prompt:** a stable system prompt (estimation rules, allowed range and step) with prompt caching; the task and its similar tasks go in the user message.

### 8.3 Suggested assignees

Input: the task, plus candidate users, each with their recent completed tasks (titles and tags) and current open workload. Candidates (v1.3) are users who have worked on tasks of the same product; if there are none, or the task has no product, all users. Output: up to 3 `{ handle, score, reason }` ranked. Shown for unassigned tasks: one-click assign or dismiss.

**Details (v1.13):**

- **Trigger:** on demand only. A ✨ **Suggest** button next to Assignee in the detail panel, shown only while the task is unassigned. Nothing runs automatically.
- **Endpoint:** `POST /api/ai/suggest-assignee` with `{ taskId: "TSK-142" }` → `{ suggestions: { handle, score, reason }[] }`, 1–3 items, best first. A task that already has an assignee → `409 CONFLICT`.
- **Candidates:** users who were ever assigned a task of the same product; if there are none, or the task has no product, all users. Each candidate is sent with name, team, their last 5 `done` tasks (ID, title, product, tags) and open workload (number of tasks not done or canceled, and the sum of their estimates in hours).
- **Validation:** handles are limited (schema enum) to the candidates; duplicates are dropped and at most 3 are kept; `score` is rounded and clamped to 0–100. No valid suggestion → `AI_UNAVAILABLE`.
- **UI:** while waiting, the button reads "Suggesting…". The result is one card with the AI marker and a row per suggestion (avatar, name · team, reason, **Assign**), plus **Dismiss**. Assign saves `assignee` with `assigneeSource: 'ai'`. On failure a short muted message replaces the card. The card is discarded when another task is opened.
- **Prompt:** a stable system prompt (ranking rules) with prompt caching; the task and the candidates go in the user message.

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
- **Sidebar (v1.4, v1.8):** workspace, search, new task, My issues, Triage, Teams (each with Active / Backlog), Saved views, and a current-user footer showing `--user=<handle>`. Inbox is removed (notifications are out of scope, §2.3). "All views" is removed (v1.8): the Saved views section lists every view.
- **List presets (v1.4):**

  | Page                    | Filter                                                         |
  | ----------------------- | -------------------------------------------------------------- |
  | My issues               | assignee is me, status not done/canceled                       |
  | Triage (workspace-wide) | assignee isEmpty, status not done/canceled                     |
  | Team › Active           | team is `<key>`, status is any of todo, in_progress, in_review |
  | Team › Backlog          | team is `<key>`, status is backlog                             |

- **Main header:** breadcrumb, List/Board toggle, Display options, ⌘K trigger, and New task (`C`).
- **Below the header:** the natural-language filter bar with parsed condition chips, Clear, and Save as view. Then a count row.
- **Filter bar (v1.8):**
  - **Manual filters are always available**, including after the AI filter ships. A **Filter** button opens a field menu (Status, Priority, Assignee, Team, Product, Tag, Estimate, Created, Updated) and then a value picker, and adds a chip such as "Tag is any of bug, perf". Click a chip to change its operator or values; × removes it.
  - **Text box:** full-text search (§6.3) until the AI step. After it, Enter interprets the text as a plain-English filter and turns it into chips; text that isn't a filter still searches.
  - **Page filters:** a page's own conditions (e.g. Engineering › Active) stay fixed and are not shown; your chips narrow them further (AND).
  - **URL state:** your chips, search and sort are stored in `?q=` (URL-encoded JSON of the `FilterQuery` parts), next to `?task=` and `?layout=`.
  - **Clear** removes your chips and search; **Save as view** is described in §6.2.
- **List view:** priority, ID, status, title, tags, AI hint, estimate, assignee.
- **Board view:** columns by status, cards with ID, title, priority, tags, estimate and assignee.
  - **Columns (v1.7):** the statuses the page's filter allows, in workflow order (e.g. team Active: Todo, In Progress, In Review; My issues: Backlog → In Review). Each column loads its own pages from `GET /api/tasks` (§7.2) and shows its total.
  - **Drag and drop (v1.7):** @dnd-kit, pointer and keyboard (Space to pick up and drop, arrows to move, Esc to cancel). Dropping a card in another column changes its status; there is no manual ordering, so cards stay sorted by priority. A short drag threshold keeps a plain click opening the card.
  - **List/Board toggle (v1.7):** in the page header; stored as `?layout=board` (list is the default).
- **Creating, editing and deleting tasks (v1.6):**
  - **New task** opens a shadcn Dialog with title, description and the same property pickers as the detail panel. Fields are prefilled from the current page: My issues → assigned to me, status Todo; Triage → unassigned; team Active → status Todo, assigned to me if I'm in that team; team Backlog → status Backlog, assigned to me if I'm in that team. After creating, the new task opens in the detail panel.
  - **Title and description** are edited inline in the detail panel: click to edit; the title saves on Enter or blur, the description on ⌘/Ctrl+Enter or blur; Esc cancels.
  - **Delete** is in a ⋯ menu in the detail panel and asks for confirmation in a dialog ("Delete TSK-142? This can't be undone."), since deletes are permanent (§5).

### 9.3 Routes (approved v1.4)

`/` → redirect to `/my-issues` · `/my-issues` · `/triage` · `/team/:teamKey/:tab(active|backlog)` · `/views/:viewId` · filter state in `?q=`.

The open task is a search parameter on the current list (`?task=TSK-142`), so the list stays in place, the panel opens beside it, and reloads and shared links keep both. There is no separate `/task/:taskId` route. The layout is `?layout=board` the same way (v1.7).

### 9.4 Keyboard map (approved)

| Key                     | Action                                                                           |
| ----------------------- | -------------------------------------------------------------------------------- |
| `⌘K` / `Ctrl+K`         | Command palette                                                                  |
| `/`                     | Focus the natural-language filter                                                |
| `C`                     | New task                                                                         |
| `J` / `K` or `↑` / `↓`  | Move selection                                                                   |
| `Enter`                 | Open task                                                                        |
| `Esc`                   | Close panel / dialog, return focus to the list                                   |
| `S`, `P`, `A`, `E`, `L` | Set status / priority / assignee / estimate / labels (tags) on the selected task |
| `G` then `M` / `E`      | Go to My issues / Engineering (v1.4: `G I` removed with Inbox)                   |
| `⌘B`                    | Toggle list / board                                                              |

Implemented with react-hotkeys-hook. Shortcuts are disabled while typing in inputs and are listed in the command palette.

**Behavior (v1.9):**

- **Target task:** `J`/`K` (or `↑`/`↓`) move the highlight through the list by moving keyboard focus between rows, and `Enter` opens the highlighted row. `S`, `P`, `A`, `E` and `L` act on the highlighted row (or the focused board card); if nothing is highlighted, they act on the task open in the detail panel; otherwise they do nothing.
- **Choices appear in the ⌘K palette:** `S`/`P`/`A`/`E`/`L` open the palette in a sub-mode such as "Set status — TSK-142", listing the options; type to filter, `Enter` applies. Tags (`L`) toggle and the palette stays open. Backspace on an empty input returns to the main palette.
- **⌘K palette contents:** actions (new task, toggle List/Board, focus search, and the field setters for the target task), navigation (My issues, Triage, team pages, saved views), and task search by title or `TSK-` ID through `GET /api/tasks` (top 8 results); choosing a task opens it on the current page.
- **`Esc`** closes the detail panel and returns focus to that task's row; Radix dialogs and popovers handle their own `Esc` first.
- **`/`** focuses the filter bar's search box (the plain-English filter after the AI step).

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

| Feature                                                                                                  | Status              | Spec / sections         |
| -------------------------------------------------------------------------------------------------------- | ------------------- | ----------------------- |
| Design language mockup                                                                                   | Approved 2026-11-19 | §9.1, §9.2              |
| Workspace scaffold                                                                                       | Done 2026-11-19     | §3, §4, §10             |
| Data model, migration, seed                                                                              | Done 2026-11-19     | §5, §6.3, §10           |
| Tasks without team (migration 0001)                                                                      | Done 2026-11-19     | §5 (v1.3)               |
| Task API: reference data, CRUD, filter compiler, search, cursor pagination                               | Done 2026-11-19     | §6, §7                  |
| Task screen: sidebar, My issues / Triage / team pages, infinite list, detail panel with property editing | Done 2026-11-19     | §9.2, §9.3, §9.5        |
| Task create / inline edit / delete UI                                                                    | Done 2026-11-19     | §9.2 (v1.6)             |
| Board view with drag and drop, List/Board toggle                                                         | Done 2026-11-19     | §9.2, §9.3 (v1.7)       |
| Filter bar (chips, search, sort) and saved views (API + UI)                                              | Done 2026-11-19     | §6.2, §7.1, §9.2 (v1.8) |
| ⌘K command palette and keyboard shortcuts                                                                | Done 2026-11-19     | §9.4 (v1.9)             |
| AI: natural-language filtering (shared Claude client, `/api/ai/parse-filter`, filter bar ✨)             | Done 2026-11-19     | §8.0, §8.1 (v1.11)      |
| AI: effort estimation (`/api/ai/estimate`, ✨ Suggest in the detail panel)                               | Done 2026-11-20     | §8.2 (v1.12)            |
| AI: suggested assignees (`/api/ai/suggest-assignee`, ✨ Suggest in the detail panel)                     | Done 2026-11-20     | §8.3 (v1.13)            |

---

## 14. Open questions

1. ~~Data model (§5)~~ decided in v0.2–v0.3
2. ~~Search, saved views, pagination (§6, §7)~~ decided in v0.4
3. ~~Extra libraries (§4)~~ decided in v0.5
4. ~~AI settings (§8.0), keyboard map (§9.4)~~ decided in v1.0
5. **Deferred (2026-11-19): list virtualization.** Render only visible list rows to keep the DOM small when hundreds of rows are loaded. Decided "not now" at seed scale (~500 tasks, 50 per page). If revisited: list only (board columns keep "Load more"); needs a library decision (`@tanstack/react-virtual` was the candidate) and changes to `J`/`K` navigation (index-based, scroll-then-focus) and `aria-setsize` / `aria-posinset` on rows.
