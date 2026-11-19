// Filter bar (§9.2 v1.8): search box, condition chips, Filter button, Sort menu, Clear and
// Save as view. Manual filters stay available alongside the AI filter (§8.1 v1.11): Enter or ✨
// turns the search text into chips.
import type { Condition, ConditionField, FilterQueryInput } from '@tracker/shared';
import { ArrowDownUp, Bookmark, ListFilter, Loader2, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useParseFilter } from '@/api/ai.ts';
import { useLookups, useMe } from '@/api/reference.ts';
import { useCreateView } from '@/api/views.ts';
import { SparkleIcon } from '@/components/icons.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.tsx';
import {
  conditionValueText,
  FIELDS,
  fieldMeta,
  opLabel,
  SORT_LABEL,
  toUserFilter,
  type UserFilter,
} from '@/lib/filters.ts';
import { cn } from '@/lib/utils.ts';
import { ConditionEditor } from './ConditionEditor.tsx';

export function FilterBar({
  value,
  onChange,
  effectiveFilter,
  layout,
  canSaveView = true,
}: {
  value: UserFilter;
  onChange: (next: UserFilter) => void;
  /** Base + user filter, stored when saving a view (§6.2 v1.8). */
  effectiveFilter: FilterQueryInput;
  layout: 'list' | 'board';
  canSaveView?: boolean;
}) {
  const hasAnything = value.conditions.length > 0 || !!value.search || !!value.sort;
  const ai = useParseFilter();
  const [note, setNote] = useState<{ kind: 'ok' | 'none' | 'error'; text: string } | null>(null);

  // Any manual change ends the "Understood as …" note (§8.1 v1.11).
  const edit = (next: UserFilter) => {
    setNote(null);
    onChange(next);
  };

  const askAi = (text: string) => {
    if (!text || ai.isPending) return;
    setNote(null);
    ai.mutate(
      { text },
      {
        onSuccess: ({ filter, interpretation }) => {
          if (filter.conditions.length > 0 || filter.sort) {
            onChange(toUserFilter(filter)); // replaces chips, search and sort
            setNote({ kind: 'ok', text: interpretation });
          } else {
            onChange({ ...value, search: text }); // no filter found: keep it a text search
            setNote({ kind: 'none', text: interpretation });
          }
        },
        onError: (err) => {
          onChange({ ...value, search: text });
          setNote({ kind: 'error', text: `${err.message} Showing a text search instead.` });
        },
      },
    );
  };

  return (
    <div className="flex flex-col border-b">
      <div
        className="flex flex-wrap items-center gap-1.5 px-4 py-2"
        role="search"
        aria-label="Filter tasks"
      >
        <SearchBox
          value={value.search ?? ''}
          onChange={(search) => edit({ ...value, search: search || undefined })}
          onAsk={askAi}
          asking={ai.isPending}
        />
        {value.conditions.map((c, i) => (
          <ConditionChip
            key={`${c.field}-${i}`}
            condition={c}
            onChange={(next) =>
              edit({ ...value, conditions: value.conditions.map((x, j) => (j === i ? next : x)) })
            }
            onRemove={() =>
              edit({ ...value, conditions: value.conditions.filter((_, j) => j !== i) })
            }
          />
        ))}
        <AddFilterButton onAdd={(c) => edit({ ...value, conditions: [...value.conditions, c] })} />
        <SortMenu value={value} onChange={edit} />
        <span className="flex-1" />
        {hasAnything && (
          <Button variant="ghost" onClick={() => edit({ conditions: [] })}>
            Clear
          </Button>
        )}
        {canSaveView && <SaveViewButton filter={effectiveFilter} layout={layout} />}
      </div>
      <AiNote asking={ai.isPending} note={note} onDismiss={() => setNote(null)} />
    </div>
  );
}

/** "✨ Understood as …" line (§8.1, AI marker §9.1). */
function AiNote({
  asking,
  note,
  onDismiss,
}: {
  asking: boolean;
  note: { kind: 'ok' | 'none' | 'error'; text: string } | null;
  onDismiss: () => void;
}) {
  if (!asking && !note) return <div aria-live="polite" className="sr-only" />;
  return (
    <div
      aria-live="polite"
      role={note?.kind === 'error' ? 'alert' : undefined}
      className={cn(
        'mx-4 mb-2 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs',
        note?.kind === 'error'
          ? 'border border-destructive/40 text-destructive'
          : 'bg-ai-soft text-ai',
      )}
    >
      {asking ? (
        <>
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Asking Claude to turn this into a filter…
        </>
      ) : (
        <>
          <SparkleIcon className="size-3.5" />
          <span className="flex-1">
            {note?.kind === 'ok' && <span className="font-medium">Understood as: </span>}
            {note?.text}
          </span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={onDismiss}
            className="rounded-sm p-0.5 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3" />
          </button>
        </>
      )}
    </div>
  );
}

/** Full-text search (§6.3), debounced into the URL; Enter or ✨ asks Claude (§8.1 v1.11). */
function SearchBox({
  value,
  onChange,
  onAsk,
  asking,
}: {
  value: string;
  onChange: (v: string) => void;
  onAsk: (text: string) => void;
  asking: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  // Follow outside changes (Clear, a saved view, back/forward) without an effect. Our own
  // debounced update equals draft.trim(), so it doesn't clobber what is being typed.
  if (value !== synced) {
    setSynced(value);
    if (value !== draft.trim()) setDraft(value);
  }
  useEffect(() => {
    if (draft.trim() === value) return;
    const t = setTimeout(() => onChange(draft.trim()), 300);
    return () => clearTimeout(t);
  }, [draft, onChange, value]);

  return (
    <div className="flex h-7 min-w-[220px] flex-[0_1_380px] items-center gap-1.5 rounded-md border bg-card px-2 focus-within:ring-2 focus-within:ring-ring">
      <Search className="size-3.5 shrink-0 text-subtle-foreground" aria-hidden="true" />
      <input
        id="task-search"
        type="search"
        aria-label="Search tasks, or describe a filter and press Enter"
        placeholder="Search, or describe a filter and press Enter"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onAsk(draft.trim());
          if (e.key === 'Escape' && draft) {
            e.stopPropagation();
            setDraft('');
            onChange('');
          }
        }}
        className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-subtle-foreground"
      />
      <button
        type="button"
        aria-label="Turn this text into a filter with AI"
        title="Turn this text into a filter (Enter)"
        disabled={!draft.trim() || asking}
        onClick={() => onAsk(draft.trim())}
        className="-mr-1 inline-flex size-5 items-center justify-center rounded-sm text-ai outline-none hover:bg-ai-soft focus-visible:ring-2 focus-visible:ring-ring disabled:text-subtle-foreground disabled:opacity-60"
      >
        {asking ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <SparkleIcon className="size-3.5" />
        )}
      </button>
    </div>
  );
}

function ConditionChip({
  condition,
  onChange,
  onRemove,
}: {
  condition: Condition;
  onChange: (c: Condition) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const lookups = useLookups();
  const me = useMe().data?.handle;
  const field = fieldMeta(condition.field).label;
  const op = opLabel(condition);
  const value = conditionValueText(condition, lookups, me);
  const summary = `${field} ${op}${value ? ` ${value}` : ''}`;

  return (
    <span className="inline-flex h-7 items-stretch overflow-hidden rounded-md border border-border-strong bg-muted text-xs">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Filter: ${summary}. Edit`}
            className="flex items-center outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <span className="px-2 text-muted-foreground">{field}</span>
            <span className="border-l px-2 text-subtle-foreground">{op}</span>
            {value && (
              <span className="max-w-[220px] truncate border-l px-2 font-medium">{value}</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <ConditionEditor
            field={condition.field}
            initial={condition}
            onApply={(c) => {
              onChange(c);
              setOpen(false);
            }}
            onCancel={() => setOpen(false)}
          />
        </PopoverContent>
      </Popover>
      <button
        type="button"
        aria-label={`Remove filter: ${summary}`}
        onClick={onRemove}
        className="flex w-7 items-center justify-center border-l text-subtle-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

function AddFilterButton({ onAdd }: { onAdd: (c: Condition) => void }) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<ConditionField | null>(null);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setField(null);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" className="text-muted-foreground">
          <ListFilter />
          Filter
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        {field === null ? (
          <Command className="w-56">
            <CommandInput placeholder="Filter by…" className="h-9 text-[13px]" />
            <CommandList>
              <CommandGroup>
                {FIELDS.map((f) => (
                  <CommandItem
                    key={f.field}
                    value={f.label}
                    onSelect={() => setField(f.field)}
                    className="text-[13px]"
                  >
                    {f.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        ) : (
          <ConditionEditor
            field={field}
            onApply={(c) => {
              onAdd(c);
              setOpen(false);
              setField(null);
            }}
            onCancel={() => setField(null)}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

function SortMenu({
  value,
  onChange,
}: {
  value: UserFilter;
  onChange: (next: UserFilter) => void;
}) {
  const current = value.sort?.field ?? (value.search ? 'relevance' : 'priority');
  const dir = value.sort?.dir ?? 'desc';
  const set = (field: string, d: 'asc' | 'desc') =>
    onChange({
      ...value,
      // Priority descending is the default (§6.1), so it is stored as "no sort".
      sort:
        field === 'relevance' || (field === 'priority' && d === 'desc' && !value.search)
          ? undefined
          : { field: field as keyof typeof SORT_LABEL, dir: d },
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="text-muted-foreground">
          <ArrowDownUp />
          Sort
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuLabel className="text-xs">Sort by</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={current}
          onValueChange={(f) => set(f, f === current ? dir : 'desc')}
        >
          {value.search && (
            <DropdownMenuRadioItem value="relevance" className="text-[13px]">
              Relevance
            </DropdownMenuRadioItem>
          )}
          {Object.entries(SORT_LABEL).map(([f, label]) => (
            <DropdownMenuRadioItem key={f} value={f} className="text-[13px]">
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {current !== 'relevance' && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs">Direction</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={dir}
              onValueChange={(d) => set(current, d as 'asc' | 'desc')}
            >
              <DropdownMenuRadioItem value="desc" className="text-[13px]">
                {current === 'priority'
                  ? 'Most urgent first'
                  : current === 'estimate'
                    ? 'Largest first'
                    : 'Newest first'}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="asc" className="text-[13px]">
                {current === 'priority'
                  ? 'Least urgent first'
                  : current === 'estimate'
                    ? 'Smallest first'
                    : 'Oldest first'}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SaveViewButton({
  filter,
  layout,
}: {
  filter: FilterQueryInput;
  layout: 'list' | 'board';
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const create = useCreateView();
  const navigate = useNavigate();

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Bookmark />
        Save as view
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setName('');
            create.reset();
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              create.mutate(
                { name: name.trim(), filter, display: { layout } },
                {
                  onSuccess: (view) => {
                    setOpen(false);
                    setName('');
                    void navigate(`/views/${view.id}`); // the view opens in its saved layout
                  },
                },
              );
            }}
          >
            <DialogHeader>
              <DialogTitle>Save as view</DialogTitle>
              <DialogDescription>
                Saves this page's filters, search, sort and layout. Views are only visible to you.
              </DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              aria-label="View name"
              placeholder="e.g. Urgent Web App bugs"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-[13px]"
            />
            {create.isError && (
              <p role="alert" className="m-0 text-xs text-destructive">
                Couldn't save the view: {create.error.message}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim() || create.isPending}>
                {create.isPending ? 'Saving…' : 'Save view'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
