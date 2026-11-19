// Drizzle schema: design doc §5 (data model) and §6.3 (search column).
import {
  ACTIVITY_KINDS,
  ESTIMATE_HOURS,
  ESTIMATE_SOURCES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@tracker/shared';
import { sql, type SQL } from 'drizzle-orm';
import {
  check,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

// ---------- enums ----------
export const taskStatusEnum = pgEnum('task_status', TASK_STATUSES);
export const taskPriorityEnum = pgEnum('task_priority', TASK_PRIORITIES);
export const estimateSourceEnum = pgEnum('estimate_source', ESTIMATE_SOURCES);
export const activityKindEnum = pgEnum('activity_kind', ACTIVITY_KINDS);

// ---------- helpers ----------
const tsvector = customType<{ data: string }>({
  dataType: () => 'tsvector',
});
const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

// ---------- tables ----------
export const users = pgTable('users', {
  id: id(),
  handle: text('handle').notNull().unique(),
  name: text('name').notNull(),
  avatarColor: text('avatar_color').notNull(),
  createdAt: createdAt(),
});

export const teams = pgTable(
  'teams',
  {
    id: id(),
    key: text('key').notNull().unique(),
    name: text('name').notNull(),
    color: text('color').notNull(),
    // §5 (v1.2): per-team task number counter, incremented in the task-create transaction.
    nextTaskNumber: integer('next_task_number').notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [
    check('teams_key_format', sql`${t.key} ~ '^[A-Z][A-Z0-9]{1,9}$'`),
    check('teams_next_task_number_positive', sql`${t.nextTaskNumber} > 0`),
  ],
);

export const teamMembers = pgTable(
  'team_members',
  {
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.teamId, t.userId] }),
    index('team_members_user_idx').on(t.userId),
  ],
);

export const products = pgTable('products', {
  id: id(),
  name: text('name').notNull().unique(),
  createdAt: createdAt(),
});

export const tasks = pgTable(
  'tasks',
  {
    id: id(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    status: taskStatusEnum('status').notNull().default('backlog'),
    priority: taskPriorityEnum('priority').notNull().default('none'),
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    estimateHours: numeric('estimate_hours', { precision: 5, scale: 1, mode: 'number' }),
    estimateSource: estimateSourceEnum('estimate_source'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    // §6.3: weighted full-text search vector (title A, description B).
    searchVector: tsvector('search_vector')
      .notNull()
      .generatedAlwaysAs(
        (): SQL =>
          sql`setweight(to_tsvector('english', ${tasks.title}), 'A') || setweight(to_tsvector('english', ${tasks.description}), 'B')`,
      ),
  },
  (t) => [
    // Also serves lookups by team_id (leading column).
    unique('tasks_team_number_unique').on(t.teamId, t.number),
    index('tasks_status_idx').on(t.status),
    index('tasks_priority_idx').on(t.priority),
    index('tasks_assignee_idx').on(t.assigneeId),
    index('tasks_product_idx').on(t.productId),
    index('tasks_updated_at_idx').on(t.updatedAt),
    index('tasks_search_idx').using('gin', t.searchVector),
    check('tasks_number_positive', sql`${t.number} > 0`),
    check('tasks_title_not_blank', sql`length(trim(${t.title})) > 0`),
    check(
      'tasks_estimate_range',
      sql`${t.estimateHours} is null or (${t.estimateHours} between ${sql.raw(String(ESTIMATE_HOURS.min))} and ${sql.raw(String(ESTIMATE_HOURS.max))} and mod(${t.estimateHours} * 2, 1) = 0)`,
    ),
    check(
      'tasks_estimate_source_matches',
      sql`(${t.estimateHours} is null) = (${t.estimateSource} is null)`,
    ),
  ],
);

export const tags = pgTable('tags', {
  id: id(),
  name: text('name').notNull().unique(),
  color: text('color').notNull(),
});

export const taskTags = pgTable(
  'task_tags',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.tagId] }), index('task_tags_tag_idx').on(t.tagId)],
);

export const savedViews = pgTable(
  'saved_views',
  {
    id: id(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // FilterQuery (§6.1). Validated by the shared Zod schema when the filter feature lands.
    filter: jsonb('filter').notNull(),
    display: jsonb('display').notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('saved_views_owner_idx').on(t.ownerId)],
);

export const taskActivity = pgTable(
  'task_activity',
  {
    id: id(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    kind: activityKindEnum('kind').notNull(),
    // { from?, to?, source?: 'manual' | 'ai' }
    payload: jsonb('payload').notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('task_activity_task_created_idx').on(t.taskId, t.createdAt)],
);
