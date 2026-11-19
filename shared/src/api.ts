// API contracts (design doc §7). Related records are referenced by stable identifiers (v1.3).
import { z } from 'zod';
import { filterQuerySchema, type FilterQuery } from './filter.ts';
import {
  ESTIMATE_SOURCES,
  estimateHoursSchema,
  taskPrioritySchema,
  taskStatusSchema,
  type ActivityKind,
  type EstimateSource,
  type TaskPriority,
  type TaskStatus,
} from './domain.ts';

// ---------- display IDs (§5 v1.3) ----------
export const TASK_ID_PREFIX = 'TSK';
export const formatTaskId = (n: number) => `${TASK_ID_PREFIX}-${n}`;
const TASK_ID_RE = new RegExp(`^${TASK_ID_PREFIX}-(\\d{1,9})$`, 'i');
export function parseTaskId(id: string): number | null {
  const m = TASK_ID_RE.exec(id.trim());
  return m ? Number(m[1]) : null;
}

const TASK_REF_RE = new RegExp(`^(?:${TASK_ID_PREFIX}-|#)?(\\d{1,9})$`, 'i');
/** Search queries that name a task (§6.3 v1.10): `142`, `#142` or `TSK-142`. */
export function parseTaskReference(query: string): number | null {
  const m = TASK_REF_RE.exec(query.trim());
  return m ? Number(m[1]) : null;
}

// ---------- reference data ----------
export interface UserDto {
  handle: string;
  name: string;
  avatarColor: string;
  team: string | null; // team key
}
export interface TeamDto {
  key: string;
  name: string;
  color: string;
}
export interface ProductDto {
  name: string;
}
export interface TagDto {
  name: string;
  color: string;
}

export const createTagSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{0,29}$/, 'Use 1–30 lowercase letters, digits or dashes'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex color like #2FA6D9'),
});
export type CreateTagInput = z.infer<typeof createTagSchema>;

// ---------- tasks ----------
export interface TaskDto {
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
  estimateSource: EstimateSource | null;
  createdBy: string; // user handle
  createdAt: string;
  updatedAt: string;
}

export interface ActivityDto {
  id: string;
  kind: ActivityKind;
  actor: string | null; // user handle
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface TaskDetailDto extends TaskDto {
  activity: ActivityDto[];
}

export interface ListTasksResponse {
  items: TaskDto[];
  nextCursor: string | null;
  total: number;
}

const title = z.string().trim().min(1, 'Title is required').max(200);
const description = z.string().max(10_000);
const handleOrNull = z.string().trim().min(1).nullable();
const tagNames = z.array(z.string().trim().min(1)).max(10);
const source = z.enum(ESTIMATE_SOURCES);

export const createTaskSchema = z.strictObject({
  title,
  description: description.optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assignee: handleOrNull.optional(),
  product: handleOrNull.optional(),
  tags: tagNames.optional(),
  estimateHours: estimateHoursSchema.nullable().optional(),
  estimateSource: source.optional(), // defaults to 'manual' when an estimate is given
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z
  .strictObject({
    title: title.optional(),
    description: description.optional(),
    status: taskStatusSchema.optional(),
    priority: taskPrioritySchema.optional(),
    assignee: handleOrNull.optional(),
    assigneeSource: source.optional(), // 'ai' when the user accepted an AI suggestion (§8.3)
    product: handleOrNull.optional(),
    tags: tagNames.optional(),
    estimateHours: estimateHoursSchema.nullable().optional(),
    estimateSource: source.optional(),
  })
  .refine((v) => Object.keys(v).some((k) => k !== 'assigneeSource' && k !== 'estimateSource'), {
    message: 'Provide at least one field to update',
  });
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

// ---------- saved views (§6.2 v1.8) ----------
export const viewDisplaySchema = z.strictObject({
  layout: z.enum(['list', 'board']).default('list'),
});
export type ViewDisplay = z.infer<typeof viewDisplaySchema>;

export interface SavedViewDto {
  id: string;
  name: string;
  filter: FilterQuery;
  display: ViewDisplay;
  createdAt: string;
}

const viewName = z.string().trim().min(1, 'Name is required').max(80);

export const createViewSchema = z.strictObject({
  name: viewName,
  filter: filterQuerySchema,
  display: viewDisplaySchema.default({ layout: 'list' }),
});
export type CreateViewInput = z.input<typeof createViewSchema>;

export const updateViewSchema = z
  .strictObject({
    name: viewName.optional(),
    filter: filterQuerySchema.optional(),
    display: viewDisplaySchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });
export type UpdateViewInput = z.input<typeof updateViewSchema>;
