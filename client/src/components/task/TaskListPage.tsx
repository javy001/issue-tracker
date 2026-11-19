// A list page (§9.2): header, count row, task list, and the detail panel for `?task=` (§9.3).
import type { FilterQueryInput } from '@tracker/shared';
import { Plus } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { useTaskList } from '@/api/tasks.ts';
import { Button } from '@/components/ui/button.tsx';
import { usePageTaskDefaults, useNewTask, type NewTaskDefaults } from './NewTaskDialog.tsx';
import { TaskDetailPanel } from './TaskDetailPanel.tsx';
import { TaskList } from './TaskList.tsx';

export function TaskListPage({
  crumbs,
  filter,
  emptyText,
  newTaskDefaults,
}: {
  crumbs: string[];
  filter: FilterQueryInput;
  emptyText: string;
  /** §9.2 v1.6: prefill for tasks created from this page. */
  newTaskDefaults: NewTaskDefaults;
}) {
  usePageTaskDefaults(newTaskDefaults);
  const { openNewTask } = useNewTask();
  const [params, setParams] = useSearchParams();
  const openTask = params.get('task');
  const query = useTaskList(filter);
  const total = query.data?.pages[0]?.total;

  const closeTask = () => {
    const next = new URLSearchParams(params);
    next.delete('task');
    setParams(next);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-wrap md:flex-nowrap">
      <section
        aria-label={crumbs.join(' / ')}
        className="flex min-w-0 flex-[999_1_480px] flex-col md:h-full"
      >
        <header className="flex min-h-11 items-center gap-1.5 border-b px-4">
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
          <Button size="default" onClick={openNewTask}>
            <Plus />
            New task
          </Button>
        </header>
        <div
          className="flex h-8 items-center border-b px-4 text-xs text-subtle-foreground"
          aria-live="polite"
        >
          {total === undefined ? ' ' : `${total} ${total === 1 ? 'task' : 'tasks'}`}
          <span className="flex-1" />
          Sorted by priority
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <TaskList query={query} emptyText={emptyText} />
        </div>
      </section>
      {openTask && <TaskDetailPanel key={openTask} id={openTask} onClose={closeTask} />}
    </div>
  );
}
