// Board columns (§9.2 v1.7): the statuses a page's filter allows, in workflow order.
import {
  TASK_STATUSES,
  type Condition,
  type FilterQueryInput,
  type TaskStatus,
} from '@tracker/shared';

type StatusCondition = Extract<Condition, { field: 'status' }>;

const isStatus = (c: Condition): c is StatusCondition => c.field === 'status';

export function allowedStatuses(filter: FilterQueryInput): TaskStatus[] {
  let allowed: TaskStatus[] = [...TASK_STATUSES];
  for (const c of (filter.conditions ?? []).filter(isStatus)) {
    const values = (Array.isArray(c.value) ? c.value : [c.value]) as TaskStatus[];
    allowed =
      c.op === 'is' || c.op === 'isAnyOf'
        ? allowed.filter((s) => values.includes(s))
        : allowed.filter((s) => !values.includes(s)); // isNot / isNoneOf
  }
  return allowed;
}

/** The page filter narrowed to one column: its status conditions replaced by `status is <s>`. */
export function columnFilter(filter: FilterQueryInput, status: TaskStatus): FilterQueryInput {
  return {
    ...filter,
    conditions: [
      ...(filter.conditions ?? []).filter((c) => !isStatus(c)),
      { field: 'status', op: 'is', value: status },
    ],
  };
}
