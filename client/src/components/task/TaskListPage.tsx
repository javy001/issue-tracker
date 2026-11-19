// A list page (§9.2): header with List/Board toggle, filter bar, count row, the list or board,
// and the detail panel for `?task=` (§9.3). Layout is `?layout=` (v1.7); the user's filter is
// `?q=` on top of the page's hidden base filter (v1.8).
import type { FilterQueryInput } from '@tracker/shared';
import { Columns3, List, Plus } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useTaskList } from '@/api/tasks.ts';
import { FilterBar } from '@/components/filters/FilterBar.tsx';
import { Button } from '@/components/ui/button.tsx';
import { allowedStatuses } from '@/lib/board.ts';
import {
  EMPTY_FILTER,
  mergeFilters,
  sortText,
  useUserFilter,
  type UserFilter,
} from '@/lib/filters.ts';
import { cn } from '@/lib/utils.ts';
import { usePageTaskDefaults, useNewTask, type NewTaskDefaults } from './NewTaskDialog.tsx';
import { TaskBoard } from './TaskBoard.tsx';
import { TaskDetailPanel } from './TaskDetailPanel.tsx';
import { TaskList } from './TaskList.tsx';

export type Layout = 'list' | 'board';

export interface PageState {
  userFilter: UserFilter;
  /** True when `?q=` differs from the page default (a saved view's filter). */
  filterChanged: boolean;
  layout: Layout;
  layoutChanged: boolean;
}

export function TaskListPage({
  crumbs,
  baseFilter,
  emptyText,
  newTaskDefaults,
  defaultUserFilter = EMPTY_FILTER,
  defaultLayout = 'list',
  headerActions,
  canSaveView = true,
}: {
  crumbs: string[];
  /** The page's own conditions: fixed and not shown as chips (§9.2 v1.8). */
  baseFilter: FilterQueryInput;
  emptyText: string;
  /** §9.2 v1.6: prefill for tasks created from this page. */
  newTaskDefaults: NewTaskDefaults;
  /** Initial chips/search/sort when the URL has no `?q=` (saved views). */
  defaultUserFilter?: UserFilter;
  defaultLayout?: Layout;
  headerActions?: (state: PageState) => ReactNode;
  canSaveView?: boolean;
}) {
  usePageTaskDefaults(newTaskDefaults);
  const { openNewTask } = useNewTask();
  const [params, setParams] = useSearchParams();
  const user = useUserFilter(defaultUserFilter);
  const openTask = params.get('task');
  const layoutParam = params.get('layout');
  const layout: Layout =
    layoutParam === 'board' || layoutParam === 'list' ? layoutParam : defaultLayout;
  const isBoard = layout === 'board';

  const filter = useMemo(() => mergeFilters(baseFilter, user.value), [baseFilter, user.value]);
  const statuses = useMemo(() => allowedStatuses(filter), [filter]);

  // The list query only runs in list layout; the board loads per column.
  const query = useTaskList(filter, { enabled: !isBoard });
  const total = query.data?.pages[0]?.total;

  const setParam = (key: string, value: string | null) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === null) next.delete(key);
      else next.set(key, value);
      return next;
    });
  };
  const setLayout = (l: Layout) => setParam('layout', l === defaultLayout ? null : l);

  const state: PageState = {
    userFilter: user.value,
    filterChanged: user.overridden,
    layout,
    layoutChanged: layout !== defaultLayout,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-wrap md:flex-nowrap">
      <section
        aria-label={crumbs.join(' / ')}
        className="flex min-w-0 flex-[999_1_480px] flex-col md:h-full"
      >
        <header className="flex min-h-11 flex-wrap items-center gap-1.5 border-b px-4 py-1.5">
          {crumbs.map((c, i) => (
            <span key={c} className="flex items-center gap-1.5">
              {i > 0 && (
                <span aria-hidden="true" className="text-subtle-foreground">
                  /
                </span>
              )}
              {i === crumbs.length - 1 ? (
                <h1 className="m-0 text-[13px] font-medium">{c}</h1>
              ) : (
                <span className="text-muted-foreground">{c}</span>
              )}
            </span>
          ))}
          <span className="flex-1" />
          {headerActions?.(state)}
          <div
            role="group"
            aria-label="Layout"
            className="mx-1.5 inline-flex gap-0.5 rounded-[7px] border bg-sidebar p-0.5"
          >
            <LayoutButton active={!isBoard} onClick={() => setLayout('list')} icon={<List />}>
              List
            </LayoutButton>
            <LayoutButton active={isBoard} onClick={() => setLayout('board')} icon={<Columns3 />}>
              Board
            </LayoutButton>
          </div>
          <Button size="default" onClick={openNewTask}>
            <Plus />
            New task
          </Button>
        </header>
        <FilterBar
          value={user.value}
          onChange={user.set}
          effectiveFilter={filter}
          layout={layout}
          canSaveView={canSaveView}
        />
        <div
          className="flex h-8 items-center border-b px-4 text-xs text-subtle-foreground"
          aria-live="polite"
        >
          {isBoard
            ? 'Drag cards between columns to change status'
            : total === undefined
              ? ' '
              : `${total} ${total === 1 ? 'task' : 'tasks'}`}
          <span className="flex-1" />
          {sortText(user.value)}
        </div>
        {isBoard ? (
          statuses.length > 0 ? (
            <TaskBoard filter={filter} statuses={statuses} />
          ) : (
            <p className="m-0 p-4 text-muted-foreground">These filters exclude every status.</p>
          )
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <TaskList
              query={query}
              emptyText={
                user.value.conditions.length || user.value.search
                  ? 'No tasks match these filters.'
                  : emptyText
              }
            />
          </div>
        )}
      </section>
      {openTask && (
        <TaskDetailPanel key={openTask} id={openTask} onClose={() => setParam('task', null)} />
      )}
    </div>
  );
}

function LayoutButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-[5px] px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5',
        active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
