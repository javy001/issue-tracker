// Filter bar state and labels (§6.1, §9.2 v1.8). The user's part of the filter (chips, search,
// sort) lives in `?q=`; a page's base conditions are added on top and never shown.
import {
  filterQuerySchema,
  type Condition,
  type ConditionField,
  type FilterQuery,
  type FilterQueryInput,
  type TeamDto,
  type UserDto,
} from '@tracker/shared';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { formatHours, PRIORITY_LABEL, STATUS_LABEL } from './labels.ts';

export interface UserFilter {
  conditions: Condition[];
  search?: string;
  sort?: FilterQuery['sort'];
}

export const EMPTY_FILTER: UserFilter = { conditions: [] };

export function toUserFilter(f: FilterQueryInput | FilterQuery): UserFilter {
  const parsed = filterQuerySchema.parse(f);
  return {
    conditions: parsed.conditions,
    ...(parsed.search ? { search: parsed.search } : {}),
    ...(parsed.sort ? { sort: parsed.sort } : {}),
  };
}

function parseQ(raw: string | null): UserFilter | null {
  if (!raw) return null;
  try {
    return toUserFilter(JSON.parse(raw) as FilterQueryInput);
  } catch {
    return null; // a hand-edited or stale URL falls back to the default
  }
}

/** `?q=` state. `defaultFilter` is used when the URL has none (e.g. a saved view's filter). */
export function useUserFilter(defaultFilter: UserFilter = EMPTY_FILTER) {
  const [params, setParams] = useSearchParams();
  const raw = params.get('q');
  const parsed = useMemo(() => parseQ(raw), [raw]);
  const value = parsed ?? defaultFilter;

  const set = useCallback(
    (next: UserFilter | null) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === null) p.delete('q');
          else p.set('q', JSON.stringify(toUserFilter(next)));
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return { value, set, overridden: parsed !== null };
}

/** Base conditions AND the user's chips; search and sort come from the user's part. */
export function mergeFilters(base: FilterQueryInput, user: UserFilter): FilterQueryInput {
  return {
    conditions: [...(base.conditions ?? []), ...user.conditions],
    ...(user.search ? { search: user.search } : {}),
    ...(user.sort ? { sort: user.sort } : {}),
  };
}

export const sameFilter = (a: UserFilter, b: UserFilter) =>
  JSON.stringify(toUserFilter(a)) === JSON.stringify(toUserFilter(b));

// ---------- field metadata and labels ----------
export type FieldKind = 'set' | 'number' | 'date';

export const FIELDS: {
  field: ConditionField;
  label: string;
  kind: FieldKind;
  emptyable: boolean;
}[] = [
  { field: 'status', label: 'Status', kind: 'set', emptyable: false },
  { field: 'priority', label: 'Priority', kind: 'set', emptyable: false },
  { field: 'assignee', label: 'Assignee', kind: 'set', emptyable: true },
  { field: 'team', label: 'Team', kind: 'set', emptyable: true },
  { field: 'product', label: 'Product', kind: 'set', emptyable: true },
  { field: 'tag', label: 'Tag', kind: 'set', emptyable: true },
  { field: 'estimate', label: 'Estimate', kind: 'number', emptyable: true },
  { field: 'createdAt', label: 'Created', kind: 'date', emptyable: false },
  { field: 'updatedAt', label: 'Updated', kind: 'date', emptyable: false },
];
export const fieldMeta = (f: ConditionField) => FIELDS.find((x) => x.field === f)!;

const SET_OPS: Record<string, string> = {
  is: 'is',
  isNot: 'is not',
  isAnyOf: 'is any of',
  isNoneOf: 'is none of',
  isEmpty: 'is empty',
  isNotEmpty: 'is set',
};
const NUMBER_OPS: Record<string, string> = {
  is: '=',
  lt: '<',
  lte: '≤',
  gt: '>',
  gte: '≥',
  between: 'between',
  isEmpty: 'is empty',
  isNotEmpty: 'is set',
};
export const DATE_OPS: Record<string, string> = {
  lt: 'before',
  lte: 'on or before',
  gt: 'after',
  gte: 'on or after',
  between: 'between',
};

export function opLabel(c: Pick<Condition, 'field' | 'op'>): string {
  const kind = fieldMeta(c.field).kind;
  if (c.field === 'assignee' && c.op === 'isEmpty') return 'is unassigned';
  if (c.field === 'tag' && c.op === 'isEmpty') return 'has none';
  const table = kind === 'number' ? NUMBER_OPS : kind === 'date' ? DATE_OPS : SET_OPS;
  return table[c.op] ?? c.op;
}

export interface Lookups {
  user: Map<string, UserDto>;
  team: Map<string, TeamDto>;
}

export function valueLabel(
  field: ConditionField,
  value: string,
  lookups: Lookups,
  me?: string,
): string {
  switch (field) {
    case 'status':
      return STATUS_LABEL[value as keyof typeof STATUS_LABEL] ?? value;
    case 'priority':
      return PRIORITY_LABEL[value as keyof typeof PRIORITY_LABEL] ?? value;
    case 'assignee':
      return value === 'me' || value === me ? 'Me' : (lookups.user.get(value)?.name ?? value);
    case 'team':
      return lookups.team.get(value)?.name ?? value;
    default:
      return value;
  }
}

/** Human-readable value part of a chip, e.g. "Urgent, High" or "4h – 8h". */
export function conditionValueText(c: Condition, lookups: Lookups, me?: string): string | null {
  if (!('value' in c)) return null;
  const kind = fieldMeta(c.field).kind;
  if (kind === 'number') {
    return Array.isArray(c.value)
      ? `${formatHours(c.value[0] as number)} – ${formatHours(c.value[1] as number)}`
      : formatHours(c.value as number);
  }
  if (kind === 'date') {
    const fmt = (s: string) =>
      new Date(s).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    return Array.isArray(c.value)
      ? `${fmt(c.value[0] as string)} – ${fmt(c.value[1] as string)}`
      : fmt(c.value as string);
  }
  const values = (Array.isArray(c.value) ? c.value : [c.value]) as string[];
  return values.map((v) => valueLabel(c.field, v, lookups, me)).join(', ');
}

export const SORT_LABEL: Record<NonNullable<FilterQuery['sort']>['field'], string> = {
  priority: 'Priority',
  updatedAt: 'Updated',
  createdAt: 'Created',
  estimate: 'Estimate',
};

export function sortText(user: UserFilter): string {
  if (!user.sort) return user.search ? 'Sorted by relevance' : 'Sorted by priority';
  const dir =
    user.sort.field === 'priority'
      ? user.sort.dir === 'desc'
        ? 'most urgent first'
        : 'least urgent first'
      : user.sort.field === 'estimate'
        ? user.sort.dir === 'desc'
          ? 'largest first'
          : 'smallest first'
        : user.sort.dir === 'desc'
          ? 'newest first'
          : 'oldest first';
  return `Sorted by ${SORT_LABEL[user.sort.field].toLowerCase()}, ${dir}`;
}
