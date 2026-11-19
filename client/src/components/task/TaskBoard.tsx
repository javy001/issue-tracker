// Board view (§9.2 v1.7): one column per allowed status, each loading its own pages; dragging a
// card to another column changes its status (pointer or keyboard, via @dnd-kit).
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  PRIORITY_RANK,
  type FilterQueryInput,
  type TaskDto,
  type TaskStatus,
} from '@tracker/shared';
import { useState, type KeyboardEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useLookups } from '@/api/reference.ts';
import { useTaskList, useUpdateTask } from '@/api/tasks.ts';
import { PriorityIcon, StatusIcon } from '@/components/icons.tsx';
import { TagChip } from '@/components/TagChip.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Skeleton } from '@/components/ui/skeleton.tsx';
import { UserAvatar } from '@/components/UserAvatar.tsx';
import { columnFilter } from '@/lib/board.ts';
import { formatHours, STATUS_LABEL } from '@/lib/labels.ts';
import { cn } from '@/lib/utils.ts';

/** Cards dropped in another column, shown there until the lists refetch. */
type Moves = Record<string, { task: TaskDto; to: TaskStatus }>;

const titleOf = (active: { data: { current?: unknown } }) =>
  (active.data.current as { task?: TaskDto } | undefined)?.task?.title ?? '';

export function TaskBoard({
  filter,
  statuses,
}: {
  filter: FilterQueryInput;
  statuses: TaskStatus[];
}) {
  const update = useUpdateTask();
  const [moves, setMoves] = useState<Moves>({});
  const [dragging, setDragging] = useState<TaskDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sensors = useSensors(
    // A short threshold keeps a plain click opening the card.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  );

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${active.id}, ${titleOf(active)}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${active.id} is over ${STATUS_LABEL[over.id as TaskStatus]}.`
        : `${active.id} is not over a column.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${active.id} moved to ${STATUS_LABEL[over.id as TaskStatus]}.`
        : `${active.id} dropped; nothing changed.`,
    onDragCancel: ({ active }) => `Moving ${active.id} was cancelled.`,
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    setError(null);
    setDragging((active.data.current as { task: TaskDto }).task);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    const task = (active.data.current as { task: TaskDto }).task;
    const to = over?.id as TaskStatus | undefined;
    const from = moves[task.id]?.to ?? task.status;
    if (!to || to === from) return;

    setMoves((m) => ({ ...m, [task.id]: { task: { ...task, status: to }, to } }));
    update
      .mutateAsync({ id: task.id, input: { status: to } })
      .catch((err: Error) =>
        setError(`Couldn't move ${task.id}: ${err.message}. It has been put back.`),
      )
      .finally(() =>
        setMoves((m) => {
          const { [task.id]: _done, ...rest } = m;
          return rest;
        }),
      );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error && (
        <p role="alert" className="m-0 border-b px-4 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              'To move a task to another status, press Space to pick it up, use the arrow keys to choose a column, then press Space to drop it. Press Escape to cancel. Press Enter to open the task.',
          },
        }}
      >
        <div className="min-h-0 flex-1 overflow-x-auto">
          <div
            className="grid h-full gap-3 px-4 py-3"
            style={{ gridTemplateColumns: `repeat(${statuses.length}, minmax(240px, 1fr))` }}
          >
            {statuses.map((s) => (
              <BoardColumn key={s} status={s} filter={columnFilter(filter, s)} moves={moves} />
            ))}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {dragging && <CardBody task={dragging} lifted />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function BoardColumn({
  status,
  filter,
  moves,
}: {
  status: TaskStatus;
  filter: FilterQueryInput;
  moves: Moves;
}) {
  const query = useTaskList(filter);
  const { setNodeRef, isOver } = useDroppable({ id: status });

  const loaded = query.data?.pages.flatMap((p) => p.items) ?? [];
  const movedAway = (t: TaskDto) => moves[t.id] !== undefined && moves[t.id]!.to !== status;
  const inColumn = loaded.filter((t) => t.status === status && !movedAway(t));
  const movedIn = Object.values(moves)
    .filter((m) => m.to === status && !inColumn.some((t) => t.id === m.task.id))
    .map((m) => m.task);
  const cards = [...inColumn, ...movedIn].sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  );

  const serverTotal = query.data?.pages[0]?.total;
  const total =
    serverTotal === undefined
      ? undefined
      : serverTotal +
        movedIn.length -
        loaded.filter((t) => t.status === status && movedAway(t)).length;

  return (
    <section
      ref={setNodeRef}
      aria-label={`${STATUS_LABEL[status]}${total === undefined ? '' : `, ${total} tasks`}`}
      className={cn(
        'flex min-h-0 min-w-0 flex-col gap-2 rounded-lg p-1 transition-colors',
        isOver && 'bg-accent/60 ring-1 ring-ring/40',
      )}
    >
      <h2 className="m-0 flex h-7 items-center gap-2 px-1 text-[13px] font-medium">
        <StatusIcon status={status} />
        {STATUS_LABEL[status]}
        <span className="text-xs font-normal text-subtle-foreground">{total ?? ''}</span>
      </h2>
      <div className="flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto pb-2">
        {query.isPending &&
          Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[84px] w-full rounded-lg" />
          ))}
        {query.isError && (
          <p role="alert" className="m-0 px-1 text-xs text-muted-foreground">
            Couldn't load. {query.error.message}
          </p>
        )}
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {cards.map((t) => (
            <DraggableCard key={t.id} task={t} />
          ))}
        </ul>
        {query.data && cards.length === 0 && (
          <p className="m-0 px-1 py-2 text-xs text-subtle-foreground">No tasks</p>
        )}
        {query.hasNextPage && (
          <Button
            variant="ghost"
            className="self-start text-muted-foreground"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        )}
      </div>
    </section>
  );
}

function DraggableCard({ task }: { task: TaskDto }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const open = () => {
    const next = new URLSearchParams(params);
    next.set('task', task.id);
    void navigate({ search: next.toString() });
  };

  return (
    <li>
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        aria-roledescription="draggable task"
        data-task-id={task.id}
        aria-label={`${task.id}: ${task.title}`}
        aria-current={params.get('task')?.toUpperCase() === task.id ? 'true' : undefined}
        onClick={open}
        onKeyDown={(e: KeyboardEvent) => {
          listeners?.onKeyDown?.(e);
          if (e.key === 'Enter') open();
        }}
        className={cn(
          'cursor-grab rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isDragging && 'opacity-40',
        )}
      >
        <CardBody task={task} selected={params.get('task')?.toUpperCase() === task.id} />
      </div>
    </li>
  );
}

function CardBody({
  task,
  selected,
  lifted,
}: {
  task: TaskDto;
  selected?: boolean;
  lifted?: boolean;
}) {
  const lookups = useLookups();
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border bg-card px-3 py-2.5 hover:border-border-strong',
        selected && 'border-ring/60',
        lifted && 'cursor-grabbing shadow-xl ring-1 ring-ring/40',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex-1 font-mono text-[11px] text-subtle-foreground">{task.id}</span>
        <UserAvatar user={task.assignee ? lookups.user.get(task.assignee) : null} size={18} />
      </div>
      <span className="text-[13px] leading-snug">{task.title}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        <PriorityIcon priority={task.priority} />
        {task.tags.slice(0, 2).map((t) => (
          <TagChip key={t} name={t} color={lookups.tagColor.get(t)} />
        ))}
        <span className="flex-1" />
        <span className="text-[11px] text-subtle-foreground">
          {formatHours(task.estimateHours)}
        </span>
      </div>
    </div>
  );
}
