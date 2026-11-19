// ⌘K palette and global shortcuts (§9.4 v1.9).
import {
  ESTIMATE_HOURS,
  estimateHoursSchema,
  TASK_STATUSES,
  type ListTasksResponse,
  type TaskDto,
  type UpdateTaskInput,
} from '@tracker/shared';
import { useQuery } from '@tanstack/react-query';
import { Check, Columns3, CircleUser, Inbox, ListFilter, Plus, Search, Users } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useNavigate } from 'react-router';
import { apiFetch } from '@/api/client.ts';
import { useMe, useTags, useTeams, useUsers } from '@/api/reference.ts';
import { useTask, useUpdateTask } from '@/api/tasks.ts';
import { useViews } from '@/api/views.ts';
import { PriorityIcon, StatusIcon } from '@/components/icons.tsx';
import { useNewTask } from '@/components/task/NewTaskDialog.tsx';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command.tsx';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog.tsx';
import { UserAvatar } from '@/components/UserAvatar.tsx';
import { focusedTaskId, focusTaskRow, moveRowFocus, overlayOpen } from '@/lib/keyboard.ts';
import { formatHours, PRIORITY_LABEL, PRIORITY_ORDER, STATUS_LABEL } from '@/lib/labels.ts';
import { cn } from '@/lib/utils.ts';

type Mode = 'root' | 'status' | 'priority' | 'assignee' | 'estimate' | 'tags';

/** What the current list page exposes to the palette and shortcuts. */
export interface PageControls {
  openTaskId: string | null;
  layout: 'list' | 'board';
  toggleLayout: () => void;
  openTask: (id: string) => void;
  closeTask: () => void;
}

interface PaletteCtx {
  openPalette: (mode?: Mode) => void;
  registerPage: (controls: PageControls | null) => void;
}

const Ctx = createContext<PaletteCtx | null>(null);

export function usePalette() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePalette must be used inside <PaletteProvider>');
  return ctx;
}

/** List pages register their controls while mounted. */
export function useRegisterPage(controls: PageControls) {
  const { registerPage } = usePalette();
  useEffect(() => {
    registerPage(controls);
  });
  useEffect(() => () => registerPage(null), [registerPage]);
}

export function PaletteProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; mode: Mode; taskId: string | null }>({
    open: false,
    mode: 'root',
    taskId: null,
  });
  const page = useRef<PageControls | null>(null);

  const openPalette = useCallback((mode: Mode = 'root') => {
    // Target task (§9.4 v1.9): the highlighted row/card, else the task open in the panel.
    const taskId = focusedTaskId() ?? page.current?.openTaskId ?? null;
    if (mode !== 'root' && !taskId) return;
    setState({ open: true, mode, taskId });
  }, []);

  const ctx = useMemo<PaletteCtx>(
    () => ({ openPalette, registerPage: (c) => void (page.current = c) }),
    [openPalette],
  );

  return (
    <Ctx.Provider value={ctx}>
      {children}
      <GlobalShortcuts page={page} openPalette={openPalette} paletteOpen={state.open} />
      <Dialog open={state.open} onOpenChange={(open) => setState((s) => ({ ...s, open }))}>
        <DialogContent
          showCloseButton={false}
          className="top-[18%] translate-y-0 overflow-hidden p-0 sm:max-w-xl"
        >
          <DialogTitle className="sr-only">Command palette</DialogTitle>
          <DialogDescription className="sr-only">
            Search commands, pages and tasks.
          </DialogDescription>
          {state.open && (
            <Palette
              initialMode={state.mode}
              taskId={state.taskId}
              page={page}
              close={() => setState((s) => ({ ...s, open: false }))}
            />
          )}
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}

function GlobalShortcuts({
  page,
  openPalette,
  paletteOpen,
}: {
  page: React.RefObject<PageControls | null>;
  openPalette: (mode?: Mode) => void;
  paletteOpen: boolean;
}) {
  const navigate = useNavigate();
  const { openNewTask } = useNewTask();
  const gPending = useRef(0);
  const afterG = () => Date.now() - gPending.current < 1000;
  const off = { enabled: !paletteOpen };

  useHotkeys(
    'mod+k',
    (e) => {
      e.preventDefault();
      openPalette();
    },
    { enableOnFormTags: true, enabled: !paletteOpen },
    [openPalette],
  );
  useHotkeys(
    '/',
    (e) => {
      e.preventDefault();
      document.getElementById('task-search')?.focus();
    },
    { useKey: true, ...off },
  );
  useHotkeys(
    'c',
    (e) => {
      e.preventDefault(); // don't type "c" into the dialog's title field
      openNewTask();
    },
    off,
    [openNewTask],
  );
  useHotkeys(
    ['j', 'down'],
    (e) => {
      if (!document.querySelector('[data-task-row]')) return;
      e.preventDefault();
      moveRowFocus(1);
    },
    off,
  );
  useHotkeys(
    ['k', 'up'],
    (e) => {
      if (!document.querySelector('[data-task-row]')) return;
      e.preventDefault();
      moveRowFocus(-1);
    },
    off,
  );
  // preventDefault: the palette input gets focus during this keydown, and the browser would
  // otherwise type the shortcut letter into it.
  const field = (mode: Mode) => (e: KeyboardEvent) => {
    e.preventDefault();
    openPalette(mode);
  };
  useHotkeys('s', field('status'), off, [openPalette]);
  useHotkeys('p', field('priority'), off, [openPalette]);
  useHotkeys('a', field('assignee'), off, [openPalette]);
  useHotkeys('l', field('tags'), off, [openPalette]);
  useHotkeys('g', () => void (gPending.current = Date.now()), off);
  useHotkeys(
    'm',
    () => {
      if (afterG()) void navigate('/my-issues');
    },
    off,
    [navigate],
  );
  useHotkeys(
    'e',
    (e) => {
      e.preventDefault();
      if (afterG()) void navigate('/team/ENG/active');
      else openPalette('estimate');
    },
    off,
    [navigate, openPalette],
  );
  useHotkeys(
    'mod+b',
    (e) => {
      e.preventDefault();
      page.current?.toggleLayout();
    },
    off,
  );
  useHotkeys(
    'escape',
    () => {
      if (overlayOpen() || !page.current?.openTaskId) return;
      const id = page.current.openTaskId;
      page.current.closeTask();
      requestAnimationFrame(() => focusTaskRow(id));
    },
    off,
  );

  return null;
}

// ---------- the palette ----------

interface Item {
  id: string;
  label: string;
  group: string;
  icon?: ReactNode;
  keys?: string[];
  hint?: string;
  checked?: boolean;
  run: () => void;
}

const MODE_TITLE: Record<Exclude<Mode, 'root'>, string> = {
  status: 'Set status',
  priority: 'Set priority',
  assignee: 'Assign to',
  estimate: 'Set estimate',
  tags: 'Edit tags',
};

function Palette({
  initialMode,
  taskId,
  page,
  close,
}: {
  initialMode: Mode;
  taskId: string | null;
  page: React.RefObject<PageControls | null>;
  close: () => void;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { openNewTask } = useNewTask();
  const task = useTask(taskId).data;
  const update = useUpdateTask();
  const teams = useTeams().data ?? [];
  const views = useViews().data ?? [];
  const users = useUsers().data ?? [];
  const tags = useTags().data ?? [];
  const me = useMe().data;
  const search = useTaskSearch(mode === 'root' ? query : '');

  const go = (to: string) => {
    close();
    void navigate(to);
  };
  const apply = (input: UpdateTaskInput, keepOpen = false) => {
    if (!taskId) return;
    update.mutate({ id: taskId, input });
    if (!keepOpen) close();
  };
  const sub = (m: Mode) => {
    setMode(m);
    setQuery('');
  };

  let items: Item[] = [];
  if (mode === 'root') {
    const target = taskId ? `${taskId}` : null;
    items = [
      {
        id: 'new',
        group: 'Actions',
        label: 'Create task',
        icon: <Plus />,
        keys: ['C'],
        run: () => (close(), openNewTask()),
      },
      ...(page.current
        ? [
            {
              id: 'layout',
              group: 'Actions',
              label: page.current.layout === 'board' ? 'Switch to list' : 'Switch to board',
              icon: <Columns3 />,
              keys: ['⌘', 'B'],
              run: () => (close(), page.current?.toggleLayout()),
            },
          ]
        : []),
      {
        id: 'search',
        group: 'Actions',
        label: 'Search tasks in this list',
        icon: <Search />,
        keys: ['/'],
        run: () => (
          close(),
          requestAnimationFrame(() => document.getElementById('task-search')?.focus())
        ),
      },
      ...(target
        ? (
            [
              ['status', 'S'],
              ['priority', 'P'],
              ['assignee', 'A'],
              ['estimate', 'E'],
              ['tags', 'L'],
            ] as const
          ).map(([m, key]) => ({
            id: `set-${m}`,
            group: `Task ${target}`,
            label: `${MODE_TITLE[m]}…`,
            keys: [key],
            run: () => sub(m),
          }))
        : []),
      {
        id: 'nav-my',
        group: 'Go to',
        label: 'My issues',
        icon: <CircleUser />,
        keys: ['G', 'M'],
        run: () => go('/my-issues'),
      },
      {
        id: 'nav-triage',
        group: 'Go to',
        label: 'Triage',
        icon: <Inbox />,
        run: () => go('/triage'),
      },
      ...teams.flatMap((t) => [
        {
          id: `nav-${t.key}-active`,
          group: 'Go to',
          label: `${t.name} › Active`,
          icon: <Users />,
          keys: t.key === 'ENG' ? ['G', 'E'] : undefined,
          run: () => go(`/team/${t.key}/active`),
        },
        {
          id: `nav-${t.key}-backlog`,
          group: 'Go to',
          label: `${t.name} › Backlog`,
          icon: <Users />,
          run: () => go(`/team/${t.key}/backlog`),
        },
      ]),
      ...views.map((v) => ({
        id: `view-${v.id}`,
        group: 'Saved views',
        label: v.name,
        icon: <ListFilter />,
        run: () => go(`/views/${v.id}`),
      })),
    ];
    const q = query.trim().toLowerCase();
    if (q) items = items.filter((i) => `${i.label} ${i.group}`.toLowerCase().includes(q));
    items.push(
      ...(search.data ?? []).map((t) => ({
        id: `task-${t.id}`,
        group: 'Tasks',
        label: t.title,
        hint: t.id,
        icon: <StatusIcon status={t.status} />,
        run: () => {
          close();
          if (page.current) page.current.openTask(t.id);
          else void navigate(`/my-issues?task=${t.id}`);
        },
      })),
    );
  } else {
    const group = `${MODE_TITLE[mode]} — ${taskId}${task ? ` ${task.title}` : ''}`;
    if (mode === 'status') {
      items = TASK_STATUSES.map((s) => ({
        id: s,
        group,
        label: STATUS_LABEL[s],
        icon: <StatusIcon status={s} />,
        checked: task?.status === s,
        run: () => apply({ status: s }),
      }));
    } else if (mode === 'priority') {
      items = PRIORITY_ORDER.map((p) => ({
        id: p,
        group,
        label: PRIORITY_LABEL[p],
        icon: <PriorityIcon priority={p} />,
        checked: task?.priority === p,
        run: () => apply({ priority: p }),
      }));
    } else if (mode === 'assignee') {
      items = [
        {
          id: '-',
          group,
          label: 'Unassigned',
          icon: <UserAvatar user={null} size={16} />,
          checked: task?.assignee === null,
          run: () => apply({ assignee: null }),
        },
        ...[...users]
          .sort((a, b) => (a.handle === me?.handle ? -1 : b.handle === me?.handle ? 1 : 0))
          .map((u) => ({
            id: u.handle,
            group,
            label: u.handle === me?.handle ? `${u.name} (me)` : u.name,
            hint: u.team ?? undefined,
            icon: <UserAvatar user={u} size={16} />,
            checked: task?.assignee === u.handle,
            run: () => apply({ assignee: u.handle }),
          })),
      ];
    } else if (mode === 'tags') {
      const current = task?.tags ?? [];
      items = tags.map((t) => ({
        id: t.name,
        group,
        label: t.name,
        checked: current.includes(t.name),
        icon: (
          <span
            aria-hidden="true"
            className="size-2 rounded-full"
            style={{ backgroundColor: t.color }}
          />
        ),
        run: () =>
          apply(
            {
              tags: current.includes(t.name)
                ? current.filter((x) => x !== t.name)
                : [...current, t.name],
            },
            true,
          ),
      }));
    } else if (mode === 'estimate') {
      const typed = estimateHoursSchema.safeParse(Number(query.trim()));
      items = [
        ...(query.trim() && typed.success
          ? [
              {
                id: 'typed',
                group,
                label: `Set to ${formatHours(typed.data)}`,
                run: () => apply({ estimateHours: typed.data }),
              },
            ]
          : []),
        ...[0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 40].map((h) => ({
          id: String(h),
          group,
          label: formatHours(h),
          checked: task?.estimateHours === h,
          run: () => apply({ estimateHours: h }),
        })),
        ...(task?.estimateHours != null
          ? [
              {
                id: 'clear',
                group,
                label: 'Clear estimate',
                run: () => apply({ estimateHours: null }),
              },
            ]
          : []),
      ];
    }
    const q = query.trim().toLowerCase();
    if (q && mode !== 'estimate')
      items = items.filter(
        (i) => i.label.toLowerCase().includes(q) || i.hint?.toLowerCase().includes(q),
      );
    if (mode === 'estimate' && q)
      items = items.filter((i) => i.id === 'typed' || i.label.toLowerCase().startsWith(q));
  }

  const groups = [...new Set(items.map((i) => i.group))];
  const placeholder =
    mode === 'root'
      ? 'Type a command, page or task…'
      : mode === 'estimate'
        ? `Hours (${ESTIMATE_HOURS.min}–${ESTIMATE_HOURS.max}, ${ESTIMATE_HOURS.step} h steps)…`
        : `${MODE_TITLE[mode]}…`;

  return (
    <Command
      shouldFilter={false}
      loop
      className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-[11px]"
    >
      <CommandInput
        autoFocus
        value={query}
        onValueChange={setQuery}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Backspace' && !query && mode !== 'root') sub('root');
        }}
        className="h-11 text-[14px]"
      />
      <CommandList className="max-h-[min(420px,60vh)]">
        <CommandEmpty>{search.isFetching ? 'Searching…' : 'No results.'}</CommandEmpty>
        {groups.map((g) => (
          <CommandGroup key={g} heading={g}>
            {items
              .filter((i) => i.group === g)
              .map((i) => (
                <CommandItem
                  key={i.id}
                  value={i.id}
                  onSelect={i.run}
                  className="gap-2.5 py-2 text-[13px] [&_svg:not([class*='size-'])]:size-3.5"
                >
                  {i.icon}
                  {i.hint && g === 'Tasks' && (
                    <span className="font-mono text-xs text-subtle-foreground">{i.hint}</span>
                  )}
                  <span className="flex-1 truncate">{i.label}</span>
                  {i.hint && g !== 'Tasks' && (
                    <span className="text-[11px] text-subtle-foreground">{i.hint}</span>
                  )}
                  {i.checked !== undefined && (
                    <Check
                      aria-hidden="true"
                      className={cn('size-3.5', i.checked ? 'opacity-100' : 'opacity-0')}
                    />
                  )}
                  {i.keys && <Keys keys={i.keys} />}
                </CommandItem>
              ))}
          </CommandGroup>
        ))}
      </CommandList>
      <div className="flex items-center gap-4 border-t px-3 py-2 text-[11px] text-subtle-foreground">
        <span>↑↓ navigate</span>
        <span>↵ select</span>
        <span>esc close</span>
        {mode !== 'root' && <span>⌫ back</span>}
      </div>
    </Command>
  );
}

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex gap-1" aria-hidden="true">
      {keys.map((k) => (
        <kbd
          key={k}
          className="min-w-[18px] rounded-[4px] border bg-muted px-1 text-center font-mono text-[11px] text-muted-foreground"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

/** Top 8 tasks for the palette (§9.4 v1.9), by title text or TSK id. */
function useTaskSearch(query: string) {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);
  return useQuery({
    queryKey: ['palette-search', debounced],
    enabled: debounced.length >= 2,
    queryFn: async (): Promise<TaskDto[]> => {
      const params = new URLSearchParams({
        filter: JSON.stringify({ search: debounced }),
        limit: '8',
      });
      return (await apiFetch<ListTasksResponse>(`/tasks?${params}`)).items;
    },
    staleTime: 10_000,
  });
}
