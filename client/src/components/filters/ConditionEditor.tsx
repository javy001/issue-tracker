// Edits one filter condition (§6.1 operators per field, §9.2 v1.8). The result is checked with
// the shared conditionSchema, so the UI can only produce conditions the API accepts.
import {
  conditionSchema,
  TASK_STATUSES,
  type Condition,
  type ConditionField,
} from '@tracker/shared';
import { Check } from 'lucide-react';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { useMe, useProducts, useTags, useTeams, useUsers } from '@/api/reference.ts';
import { PriorityIcon, StatusIcon } from '@/components/icons.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command.tsx';
import { Input } from '@/components/ui/input.tsx';
import { UserAvatar } from '@/components/UserAvatar.tsx';
import { DATE_OPS, fieldMeta } from '@/lib/filters.ts';
import { PRIORITY_LABEL, PRIORITY_ORDER, STATUS_LABEL } from '@/lib/labels.ts';
import { cn } from '@/lib/utils.ts';

interface Option {
  value: string;
  label: string;
  icon?: ReactNode;
}

function useOptions(field: ConditionField): Option[] {
  const users = useUsers().data ?? [];
  const teams = useTeams().data ?? [];
  const products = useProducts().data ?? [];
  const tags = useTags().data ?? [];
  const me = useMe().data;
  switch (field) {
    case 'status':
      return TASK_STATUSES.map((s) => ({
        value: s,
        label: STATUS_LABEL[s],
        icon: <StatusIcon status={s} />,
      }));
    case 'priority':
      return PRIORITY_ORDER.map((p) => ({
        value: p,
        label: PRIORITY_LABEL[p],
        icon: <PriorityIcon priority={p} />,
      }));
    case 'assignee':
      return [
        { value: 'me', label: 'Me', icon: <UserAvatar user={me} size={16} /> },
        ...users
          .filter((u) => u.handle !== me?.handle)
          .map((u) => ({
            value: u.handle,
            label: u.name,
            icon: <UserAvatar user={u} size={16} />,
          })),
      ];
    case 'team':
      return teams.map((t) => ({
        value: t.key,
        label: t.name,
        icon: (
          <span
            aria-hidden="true"
            className="size-2.5 rounded-[3px]"
            style={{ backgroundColor: t.color }}
          />
        ),
      }));
    case 'product':
      return products.map((p) => ({ value: p.name, label: p.name }));
    case 'tag':
      return tags.map((t) => ({
        value: t.name,
        label: t.name,
        icon: (
          <span
            aria-hidden="true"
            className="size-2 rounded-full"
            style={{ backgroundColor: t.color }}
          />
        ),
      }));
    default:
      return [];
  }
}

type SetOp = 'isAnyOf' | 'isNoneOf' | 'isEmpty' | 'isNotEmpty';

/** Editor state from an existing condition; `is`/`isNot` from AI or saved views map to any/none of. */
function initialState(field: ConditionField, initial?: Condition) {
  const op = initial?.op;
  const value = initial && 'value' in initial ? initial.value : undefined;
  const list =
    value === undefined ? [] : ((Array.isArray(value) ? value : [value]) as (string | number)[]);
  const setOp: SetOp =
    op === 'isNot' || op === 'isNoneOf'
      ? 'isNoneOf'
      : op === 'isEmpty'
        ? 'isEmpty'
        : op === 'isNotEmpty'
          ? 'isNotEmpty'
          : 'isAnyOf';
  const kind = fieldMeta(field).kind;
  return {
    setOp,
    values: kind === 'set' ? (list as string[]) : [],
    rangeOp: op ?? (kind === 'date' ? 'gte' : 'gte'),
    a: kind !== 'set' && list[0] !== undefined ? String(list[0]).slice(0, 10) : '',
    b: kind !== 'set' && list[1] !== undefined ? String(list[1]).slice(0, 10) : '',
  };
}

export function ConditionEditor({
  field,
  initial,
  onApply,
  onCancel,
}: {
  field: ConditionField;
  initial?: Condition;
  onApply: (c: Condition) => void;
  onCancel: () => void;
}) {
  const meta = fieldMeta(field);
  const options = useOptions(field);
  const start = useMemo(() => initialState(field, initial), [field, initial]);
  const [setOp, setSetOp] = useState<SetOp>(start.setOp);
  const [values, setValues] = useState<string[]>(start.values);
  const [rangeOp, setRangeOp] = useState<string>(start.rangeOp);
  const [a, setA] = useState(start.a);
  const [b, setB] = useState(start.b);
  const opId = useId();

  // Build the candidate condition and validate it with the shared schema.
  const candidate = useMemo((): unknown => {
    if (meta.kind === 'set') {
      if (setOp === 'isEmpty' || setOp === 'isNotEmpty') return { field, op: setOp };
      return { field, op: setOp, value: values };
    }
    if (rangeOp === 'isEmpty' || rangeOp === 'isNotEmpty') return { field, op: rangeOp };
    const parse = (s: string) => (meta.kind === 'number' ? Number(s) : s);
    if (rangeOp === 'between') return { field, op: 'between', value: [parse(a), parse(b)] };
    return { field, op: rangeOp, value: parse(a) };
  }, [a, b, field, meta.kind, rangeOp, setOp, values]);
  const parsed = conditionSchema.safeParse(candidate);
  const rangeValid =
    !parsed.success ||
    !('value' in parsed.data) ||
    !Array.isArray(parsed.data.value) ||
    meta.kind === 'set' ||
    parsed.data.value[0]! <= parsed.data.value[1]!;
  const hasValue = !(rangeOp === 'isEmpty' || rangeOp === 'isNotEmpty');
  // Empty inputs would otherwise parse as 0 / an invalid date.
  const filled =
    meta.kind === 'set' || !hasValue || (a !== '' && (rangeOp !== 'between' || b !== ''));
  const valid = parsed.success && rangeValid && filled;

  const setOps: { op: SetOp; label: string }[] = [
    { op: 'isAnyOf', label: 'is any of' },
    { op: 'isNoneOf', label: 'is none of' },
    ...(meta.emptyable
      ? [
          { op: 'isEmpty' as const, label: field === 'assignee' ? 'unassigned' : 'is empty' },
          { op: 'isNotEmpty' as const, label: 'is set' },
        ]
      : []),
  ];
  const rangeOps =
    meta.kind === 'number'
      ? [
          ['is', 'equals'],
          ['lt', 'less than'],
          ['lte', 'at most'],
          ['gt', 'more than'],
          ['gte', 'at least'],
          ['between', 'between'],
          ['isEmpty', 'is empty'],
          ['isNotEmpty', 'is set'],
        ]
      : Object.entries(DATE_OPS);
  const inputType = meta.kind === 'number' ? 'number' : 'date';
  const needsValue = !(rangeOp === 'isEmpty' || rangeOp === 'isNotEmpty');

  return (
    <form
      className="flex w-72 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (valid) onApply(parsed.data as Condition);
      }}
    >
      <div className="border-b px-3 py-2 text-xs font-medium">{meta.label}</div>

      {meta.kind === 'set' ? (
        <>
          <div
            role="radiogroup"
            aria-label="Operator"
            className="flex flex-wrap gap-1 border-b p-2"
          >
            {setOps.map((o) => (
              <button
                key={o.op}
                type="button"
                role="radio"
                aria-checked={setOp === o.op}
                onClick={() => setSetOp(o.op)}
                className={cn(
                  'h-6 rounded-md px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  setOp === o.op
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/60',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          {(setOp === 'isAnyOf' || setOp === 'isNoneOf') && (
            <Command className="rounded-none">
              <CommandInput
                placeholder={`Find ${meta.label.toLowerCase()}…`}
                className="h-9 text-[13px]"
              />
              <CommandList className="max-h-56">
                <CommandEmpty>No matches.</CommandEmpty>
                <CommandGroup>
                  {options.map((o) => {
                    const on = values.includes(o.value);
                    return (
                      <CommandItem
                        key={o.value}
                        value={`${o.label} ${o.value}`}
                        onSelect={() =>
                          setValues(on ? values.filter((v) => v !== o.value) : [...values, o.value])
                        }
                        className="gap-2 text-[13px]"
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            'flex size-3.5 items-center justify-center rounded-[3px] border',
                            on && 'border-primary bg-primary text-primary-foreground',
                          )}
                        >
                          {on && <Check className="size-3" />}
                        </span>
                        {o.icon}
                        <span className="flex-1 truncate">{o.label}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-2 p-3">
          <label htmlFor={opId} className="sr-only">
            Operator
          </label>
          <select
            id={opId}
            value={rangeOp}
            onChange={(e) => setRangeOp(e.target.value)}
            className="h-7 rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {rangeOps.map(([op, label]) => (
              <option key={op} value={op}>
                {label}
              </option>
            ))}
          </select>
          {needsValue && (
            <div className="flex items-center gap-1.5">
              <Input
                type={inputType}
                aria-label={rangeOp === 'between' ? 'From' : 'Value'}
                step={meta.kind === 'number' ? 0.5 : undefined}
                min={meta.kind === 'number' ? 0 : undefined}
                value={a}
                onChange={(e) => setA(e.target.value)}
                className="h-7 text-[13px]"
              />
              {rangeOp === 'between' && (
                <>
                  <span className="text-xs text-subtle-foreground">and</span>
                  <Input
                    type={inputType}
                    aria-label="To"
                    step={meta.kind === 'number' ? 0.5 : undefined}
                    min={meta.kind === 'number' ? 0 : undefined}
                    value={b}
                    onChange={(e) => setB(e.target.value)}
                    className="h-7 text-[13px]"
                  />
                </>
              )}
              {meta.kind === 'number' && <span className="text-xs text-subtle-foreground">h</span>}
            </div>
          )}
          {!rangeValid && (
            <p role="alert" className="m-0 text-[11px] text-destructive">
              The first value must not be after the second.
            </p>
          )}
        </div>
      )}

      <div className="flex justify-end gap-1.5 border-t p-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!valid}>
          Apply
        </Button>
      </div>
    </form>
  );
}
