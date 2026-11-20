// Task detail panel (§9.2): every field is editable; edits are optimistic (§9.5). Delete sits in
// a ⋯ menu behind a confirmation dialog (v1.6).
import type { ActivityDto, TaskDetailDto, UpdateTaskInput } from '@tracker/shared';
import { Check, Link2, MoreHorizontal, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useEstimateSuggestion } from '@/api/ai.ts';
import { ApiError } from '@/api/client.ts';
import { useLookups } from '@/api/reference.ts';
import { useDeleteTask, useTask, useUpdateTask } from '@/api/tasks.ts';
import { SparkleIcon } from '@/components/icons.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import { Skeleton } from '@/components/ui/skeleton.tsx';
import { formatHours, PRIORITY_LABEL, relativeTime, STATUS_LABEL } from '@/lib/labels.ts';
import { EditableDescription, EditableTitle } from './EditableText.tsx';
import { AiSuggestButton, EstimateSuggestionCard } from './AiSuggestions.tsx';
import {
  AssigneePicker,
  EstimateField,
  PriorityPicker,
  ProductPicker,
  StatusPicker,
  TagsPicker,
} from './pickers.tsx';

export function TaskDetailPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const task = useTask(id);
  const displayId = id.toUpperCase();

  return (
    <aside
      aria-label="Task details"
      className="flex min-w-0 flex-[1_1_340px] flex-col gap-4 overflow-y-auto border-l bg-sidebar px-5 pt-3 pb-5 md:h-full md:max-w-[400px]"
    >
      <div className="flex h-7 items-center gap-1.5">
        <span className="flex-1 font-mono text-xs text-subtle-foreground">{displayId}</span>
        <CopyLinkButton />
        {task.data && <TaskMenu id={task.data.id} onDeleted={onClose} />}
        <Button variant="ghost" size="icon" aria-label="Close details" onClick={onClose}>
          <X />
        </Button>
      </div>
      {task.isPending && <PanelSkeleton />}
      {task.isError && (
        <p role="alert" className="text-muted-foreground">
          {task.error instanceof ApiError && task.error.status === 404
            ? `Task ${displayId} doesn't exist.`
            : `Couldn't load this task. ${task.error.message}`}
        </p>
      )}
      {task.data && <TaskDetail task={task.data} />}
    </aside>
  );
}

function TaskDetail({ task }: { task: TaskDetailDto }) {
  const update = useUpdateTask();
  const lookups = useLookups();
  const estimate = useEstimateSuggestion();
  const save = (input: UpdateTaskInput) => update.mutate({ id: task.id, input });

  const assignee = task.assignee ? lookups.user.get(task.assignee) : undefined;
  const team = assignee?.team ? lookups.team.get(assignee.team) : undefined;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <EditableTitle value={task.title} onSave={(title) => save({ title })} />
        <EditableDescription
          value={task.description}
          onSave={(description) => save({ description })}
        />
      </div>

      {update.isError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 px-3 py-2 text-xs text-destructive"
        >
          Couldn't save the change: {update.error.message}. It has been undone.
        </p>
      )}

      <dl className="m-0 grid grid-cols-[92px_minmax(0,1fr)] items-center gap-x-3 gap-y-1">
        <Property label="Status">
          <StatusPicker value={task.status} onChange={(status) => save({ status })} />
        </Property>
        <Property label="Priority">
          <PriorityPicker value={task.priority} onChange={(priority) => save({ priority })} />
        </Property>
        <Property label="Assignee">
          <AssigneePicker value={task.assignee} onChange={(a) => save({ assignee: a })} />
        </Property>
        <Property label="Estimate">
          <div className="flex min-w-0 items-center gap-2">
            <EstimateField
              value={task.estimateHours}
              onChange={(h) => save({ estimateHours: h })}
            />
            {task.estimateSource === 'ai' && <AiBadge>AI estimate</AiBadge>}
            <AiSuggestButton
              label="Suggest an estimate"
              pendingLabel="Estimating…"
              pending={estimate.isPending}
              onClick={() => estimate.mutate({ taskId: task.id })}
            />
          </div>
        </Property>
        <Property label="Team">
          <span
            className={team ? undefined : 'text-subtle-foreground'}
            title="Derived from the assignee's team"
          >
            {team?.name ?? (assignee ? 'No team' : '—')}
          </span>
        </Property>
        <Property label="Product">
          <ProductPicker value={task.product} onChange={(product) => save({ product })} />
        </Property>
        <Property label="Tags">
          <TagsPicker value={task.tags} onChange={(tags) => save({ tags })} />
        </Property>
      </dl>

      <EstimateSuggestionCard
        suggestion={estimate}
        onAccept={(hours) => save({ estimateHours: hours, estimateSource: 'ai' })}
      />

      <section aria-label="Activity" className="flex flex-col gap-2.5 border-t pt-3.5">
        <h3 className="m-0 text-xs font-medium text-muted-foreground">Activity</h3>
        <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
          {task.activity.map((a) => (
            <ActivityItem key={a.id} entry={a} />
          ))}
        </ol>
      </section>
    </>
  );
}

function TaskMenu({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const remove = useDeleteTask(id);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="More actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
            <Trash2 />
            Delete task…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={confirming}
        onOpenChange={(open) => {
          setConfirming(open);
          if (!open) remove.reset();
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {id}?</DialogTitle>
            <DialogDescription>
              This permanently deletes the task, its tags and its activity. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          {remove.isError && (
            <p role="alert" className="m-0 text-xs text-destructive">
              Couldn't delete: {remove.error.message}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(undefined, {
                  onSuccess: () => {
                    setConfirming(false);
                    onDeleted();
                  },
                })
              }
            >
              {remove.isPending ? 'Deleting…' : 'Delete task'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Property({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-xs text-subtle-foreground">{label}</dt>
      <dd className="m-0 flex min-h-7 min-w-0 items-center">{children}</dd>
    </>
  );
}

function AiBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded-full bg-ai-soft px-[7px] text-[11px] font-medium text-ai">
      <SparkleIcon className="size-[11px]" />
      {children}
    </span>
  );
}

function ActivityItem({ entry }: { entry: ActivityDto }) {
  const lookups = useLookups();
  const name = (handle: unknown) =>
    typeof handle === 'string' ? (lookups.user.get(handle)?.name ?? handle) : 'nobody';
  const actor = entry.actor ? (lookups.user.get(entry.actor)?.name ?? entry.actor) : 'Someone';
  const p = entry.payload;
  const label = <T extends Record<string, string>>(map: T, v: unknown) =>
    map[v as keyof T] ?? String(v);

  let text: string;
  switch (entry.kind) {
    case 'created':
      text = 'created the task';
      break;
    case 'status_changed':
      text = `changed status from ${label(STATUS_LABEL, p.from)} to ${label(STATUS_LABEL, p.to)}`;
      break;
    case 'priority_changed':
      text = `changed priority from ${label(PRIORITY_LABEL, p.from)} to ${label(PRIORITY_LABEL, p.to)}`;
      break;
    case 'assigned':
      text = p.to ? `assigned ${name(p.to)}` : `unassigned ${name(p.from)}`;
      break;
    case 'estimated':
      text =
        p.to === null
          ? 'cleared the estimate'
          : `set the estimate to ${formatHours(p.to as number)}`;
      break;
    case 'tags_changed':
      text = 'changed tags';
      break;
    default:
      text = `edited ${Array.isArray(p.fields) ? p.fields.join(' and ') : 'the task'}`;
  }

  return (
    <li className="flex gap-2 text-xs text-muted-foreground">
      <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-border-strong" />
      <span className="flex-1">
        <span className="font-medium text-foreground">{actor}</span> {text}
        {p.source === 'ai' && (
          <span className="ml-1.5 inline-flex align-middle">
            <AiBadge>AI suggested</AiBadge>
          </span>
        )}
      </span>
      <time
        dateTime={entry.createdAt}
        title={new Date(entry.createdAt).toLocaleString()}
        className="text-subtle-foreground"
      >
        {relativeTime(entry.createdAt)}
      </time>
    </li>
  );
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={copied ? 'Link copied' : 'Copy link'}
      onClick={() => {
        void navigator.clipboard.writeText(window.location.href).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check /> : <Link2 />}
    </Button>
  );
}

function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading task">
      <Skeleton className="h-5 w-4/5" />
      <Skeleton className="h-12 w-full" />
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-5 w-2/3" />
      ))}
    </div>
  );
}
