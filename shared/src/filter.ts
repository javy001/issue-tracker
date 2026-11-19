// Filter AST (design doc §6.1, approved v1.3). Used by the UI, URL state, the API,
// saved views and AI natural-language filtering.
import { z } from 'zod';
import { taskPrioritySchema, taskStatusSchema } from './domain.ts';

const identifier = z.string().trim().min(1).max(100);
const isoDate = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);
const hours = z.number().min(0).max(1000);

/** is / isNot / isAnyOf / isNoneOf on one field. */
function setConditions<F extends string, V extends z.ZodType>(field: F, value: V) {
  return [
    z.strictObject({ field: z.literal(field), op: z.enum(['is', 'isNot']), value }),
    z.strictObject({
      field: z.literal(field),
      op: z.enum(['isAnyOf', 'isNoneOf']),
      value: z.array(value).min(1).max(50),
    }),
  ] as const;
}
function emptyConditions<F extends string>(field: F) {
  return z.strictObject({ field: z.literal(field), op: z.enum(['isEmpty', 'isNotEmpty']) });
}
function rangeConditions<F extends string, V extends z.ZodType>(field: F, value: V) {
  return [
    z.strictObject({ field: z.literal(field), op: z.enum(['lt', 'lte', 'gt', 'gte']), value }),
    z.strictObject({
      field: z.literal(field),
      op: z.literal('between'),
      value: z.tuple([value, value]),
    }),
  ] as const;
}

export const conditionSchema = z.union([
  ...setConditions('status', taskStatusSchema),
  ...setConditions('priority', taskPrioritySchema),
  ...setConditions('assignee', identifier), // handle, or 'me'
  emptyConditions('assignee'),
  ...setConditions('team', identifier), // team key; derived from the assignee
  emptyConditions('team'),
  ...setConditions('product', identifier), // product name
  emptyConditions('product'),
  ...setConditions('tag', identifier), // tag name
  emptyConditions('tag'),
  z.strictObject({ field: z.literal('estimate'), op: z.literal('is'), value: hours }),
  ...rangeConditions('estimate', hours),
  emptyConditions('estimate'),
  ...rangeConditions('createdAt', isoDate),
  ...rangeConditions('updatedAt', isoDate),
]);
export type Condition = z.infer<typeof conditionSchema>;
export type ConditionField = Condition['field'];

export const SORT_FIELDS = ['priority', 'updatedAt', 'createdAt', 'estimate'] as const;
export const GROUP_BY_FIELDS = ['status', 'assignee', 'team', 'product', 'priority'] as const;

export const filterQuerySchema = z.strictObject({
  conditions: z.array(conditionSchema).max(20).default([]), // AND-ed together
  search: z.string().trim().max(200).optional(),
  sort: z.strictObject({ field: z.enum(SORT_FIELDS), dir: z.enum(['asc', 'desc']) }).optional(),
  groupBy: z.enum(GROUP_BY_FIELDS).nullable().optional(), // applied by the client
});
export type FilterQuery = z.infer<typeof filterQuerySchema>;
export type FilterQueryInput = z.input<typeof filterQuerySchema>;
