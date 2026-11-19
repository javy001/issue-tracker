// Dense task list (§9.2): priority, ID, status, title, tags, estimate, assignee. Loads more
// pages as you scroll (§7.2 cursors).
import type { TaskDto } from '@tracker/shared';
import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useLookups } from '@/api/reference.ts';
import type { useTaskList } from '@/api/tasks.ts';
import { PriorityIcon, StatusIcon } from '@/components/icons.tsx';
import { TagChip } from '@/components/TagChip.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Skeleton } from '@/components/ui/skeleton.tsx';
import { UserAvatar } from '@/components/UserAvatar.tsx';
import { formatHours } from '@/lib/labels.ts';
import { cn } from '@/lib/utils.ts';

type ListQuery = ReturnType<typeof useTaskList>;

export function TaskList({ query, emptyText }: { query: ListQuery; emptyText: string }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: '400px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  if (query.isPending) {
    return (
      <div aria-busy="true" aria-label="Loading tasks" className="flex flex-col">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="flex h-9 items-center gap-3 border-b px-4">
            <Skeleton className="h-3.5 w-14" />
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="size-5 rounded-full" />
          </div>
        ))}
      </div>
    );
  }
  if (query.isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 p-4 text-muted-foreground">
        Couldn't load tasks. {query.error.message}
        <Button variant="outline" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const tasks = query.data.pages.flatMap((p) => p.items);
  if (tasks.length === 0) {
    return <p className="m-0 p-4 text-muted-foreground">{emptyText}</p>;
  }

  return (
    <>
      <ul aria-label="Tasks" className="m-0 flex list-none flex-col p-0">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
      </ul>
      <div ref={sentinel} className="h-px" />
      {isFetchingNextPage && (
        <p className="m-0 px-4 py-2 text-xs text-subtle-foreground">Loading more…</p>
      )}
    </>
  );
}

function TaskRow({ task }: { task: TaskDto }) {
  const [params] = useSearchParams();
  const lookups = useLookups();
  const selected = params.get('task')?.toUpperCase() === task.id;
  const next = new URLSearchParams(params);
  next.set('task', task.id);

  return (
    <li>
      <Link
        to={{ search: next.toString() }}
        aria-current={selected ? 'true' : undefined}
        data-task-row
        data-task-id={task.id}
        className={cn(
          'flex h-9 items-center gap-2.5 border-b px-4 text-foreground no-underline outline-none hover:bg-accent/60 focus-visible:bg-accent focus-visible:shadow-[inset_2px_0_0_var(--ring)]',
          selected && 'bg-accent shadow-[inset_2px_0_0_var(--primary)]',
        )}
      >
        <PriorityIcon priority={task.priority} />
        <span className="w-[60px] shrink-0 font-mono text-xs text-subtle-foreground">
          {task.id}
        </span>
        <StatusIcon status={task.status} />
        <span className="min-w-0 flex-1 truncate">{task.title}</span>
        <span className="hidden shrink-0 gap-1 sm:flex">
          {task.tags.slice(0, 3).map((t) => (
            <TagChip key={t} name={t} color={lookups.tagColor.get(t)} />
          ))}
        </span>
        <span className="w-11 shrink-0 text-right text-xs text-subtle-foreground">
          {formatHours(task.estimateHours)}
        </span>
        <UserAvatar user={task.assignee ? lookups.user.get(task.assignee) : null} />
      </Link>
    </li>
  );
}
