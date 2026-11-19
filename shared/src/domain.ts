import { z } from 'zod';

// §5: fixed status enum, same for every team.
export const TASK_STATUSES = [
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'done',
  'canceled',
] as const;
export const taskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

// §5: five priority levels, sorted by rank (urgent first).
export const TASK_PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const;
export const taskPrioritySchema = z.enum(TASK_PRIORITIES);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export const PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

// §5: who set an estimate.
export const ESTIMATE_SOURCES = ['manual', 'ai'] as const;
export type EstimateSource = (typeof ESTIMATE_SOURCES)[number];

// §5 (v1.2): kinds of entries in a task's activity list.
export const ACTIVITY_KINDS = [
  'created',
  'status_changed',
  'priority_changed',
  'assigned',
  'estimated',
  'tags_changed',
  'edited',
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

// §5: estimates in hours, 0.5 h steps, 0.5–80 h.
export const ESTIMATE_HOURS = { min: 0.5, max: 80, step: 0.5 } as const;
export const estimateHoursSchema = z
  .number()
  .min(ESTIMATE_HOURS.min)
  .max(ESTIMATE_HOURS.max)
  .refine((n) => Number.isInteger(n / ESTIMATE_HOURS.step), {
    message: `Estimate must be a multiple of ${ESTIMATE_HOURS.step} hours`,
  });
