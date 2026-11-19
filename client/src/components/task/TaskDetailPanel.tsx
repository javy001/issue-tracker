// Task detail panel (§9.2): properties are editable; edits are optimistic (§9.5).
import {
  TASK_STATUSES,
  type ActivityDto,
  type TaskDetailDto,
  type UpdateTaskInput,
  type UserDto,
} from '@tracker/shared';
import { Check, Link2, X } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '@/api/client.ts';
import { useLookups, useProducts, useTags, useUsers } from '@/api/reference.ts';
import { useTask, useUpdateTask } from '@/api/tasks.ts';
import { PriorityIcon, SparkleIcon, StatusIcon } from '@/components/icons.tsx';
import { TagChip } from '@/components/TagChip.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Skeleton } from '@/components/ui/skeleton.tsx';
import { UserAvatar } from '@/components/UserAvatar.tsx';
import {
  formatHours,
  PRIORITY_LABEL,
  PRIORITY_ORDER,
  relativeTime,
  STATUS_LABEL,
} from '@/lib/labels.ts';
import { EstimatePicker } from './EstimatePicker.tsx';
import { PropertyPicker } from './PropertyPicker.tsx';

export function TaskDetailPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const task = useTask(id);

  return (
    <aside
      aria-label="Task details"
      className="flex min-w-0 flex-[1_1_340px] flex-col gap-4 overflow-y-auto border-l bg-sidebar px-5 pt-3 pb-5 md:h-full md:max-w-[400px]"
    >
      <div className="flex h-7 items-center gap-1.5">
        <span className="flex-1 font-mono text-xs text-subtle-foreground">{id.toUpperCase()}</span>
        <CopyLinkButton />
        <Button variant="ghost" size="icon" aria-label="Close details" onClick={onClose}>
          <X />
        </Button>
      </div>
      {task.isPending && <PanelSkeleton />}
      {task.isError && (
        <p role="alert" className="text-muted-foreground">
          {task.error instanceof ApiError && task.error.status === 404
            ? `Task ${id.toUpperCase()} doesn't exist.`
            : `Couldn't load this task. ${task.error.message}`}
        </p>
      )}
      {task.data && <TaskDetail task={task.data} />}
    </aside>
  );
}

function TaskDetail({ task }: { task: TaskDetailDto }) {
  const update = useUpdateTask(task.id);
  const lookups = useLookups();
  const users = useUsers().data ?? [];
  const products = useProducts().data ?? [];
  const tags = useTags().data ?? [];
  const save = (input: UpdateTaskInput) => update.mutate(input);

  const assignee = task.assignee ? lookups.user.get(task.assignee) : undefined;
  const team = assignee?.team ? lookups.team.get(assignee.team) : undefined;

  return (
    <>
      <div className="flex flex-col gap-2">
        <h2 className="m-0 text-[17px] leading-snug font-semibold">{task.title}</h2>
        {task.description ? (
          <p className="m-0 whitespace-pre-wrap text-muted-foreground">{task.description}</p>
        ) : (
          <p className="m-0 text-subtle-foreground italic">No description.</p>
        )}
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
          <PropertyPicker
            label={`Status: ${STATUS_LABEL[task.status]}. Change status`}
            placeholder="Change status…"
            trigger={
              <>
                <StatusIcon status={task.status} />
                {STATUS_LABEL[task.status]}
              </>
            }
            options={TASK_STATUSES.map((s) => ({
              value: s,
              label: STATUS_LABEL[s],
              icon: <StatusIcon status={s} />,
            }))}
            selected={[task.status]}
            onSelect={(v) => save({ status: v as TaskDetailDto['status'] })}
          />
        </Property>

        <Property label="Priority">
          <PropertyPicker
            label={`Priority: ${PRIORITY_LABEL[task.priority]}. Change priority`}
            placeholder="Change priority…"
            trigger={
              <>
                <PriorityIcon priority={task.priority} />
                {PRIORITY_LABEL[task.priority]}
              </>
            }
            options={PRIORITY_ORDER.map((p) => ({
              value: p,
              label: PRIORITY_LABEL[p],
              icon: <PriorityIcon priority={p} />,
            }))}
            selected={[task.priority]}
            onSelect={(v) => save({ priority: v as TaskDetailDto['priority'] })}
          />
        </Property>

        <Property label="Assignee">
          <PropertyPicker
            label={`Assignee: ${assignee?.name ?? 'unassigned'}. Change assignee`}
            placeholder="Assign to…"
            trigger={
              <>
                <UserAvatar user={assignee} size={18} />
                <span className="truncate">{assignee?.name ?? 'Unassigned'}</span>
              </>
            }
            options={[
              { value: '', label: 'Unassigned', icon: <UserAvatar user={null} size={16} /> },
              ...users.map((u: UserDto) => ({
                value: u.handle,
                label: u.name,
                hint: u.team ?? undefined,
                icon: <UserAvatar user={u} size={16} />,
              })),
            ]}
            selected={[task.assignee ?? '']}
            onSelect={(v) => save({ assignee: v || null })}
          />
        </Property>

        <Property label="Estimate">
          <div className="flex min-w-0 items-center gap-2">
            <EstimatePicker
              value={task.estimateHours}
              trigger={
                <span
                  className={task.estimateHours === null ? 'text-subtle-foreground' : undefined}
                >
                  {task.estimateHours === null ? 'Set estimate' : formatHours(task.estimateHours)}
                </span>
              }
              onChange={(h) => save({ estimateHours: h })}
            />
            {task.estimateSource === 'ai' && <AiBadge>AI estimate</AiBadge>}
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
          <PropertyPicker
            label={`Product: ${task.product ?? 'none'}. Change product`}
            placeholder="Change product…"
            trigger={
              <span className={task.product ? undefined : 'text-subtle-foreground'}>
                {task.product ?? 'No product'}
              </span>
            }
            options={[
              { value: '', label: 'No product' },
              ...products.map((p) => ({ value: p.name, label: p.name })),
            ]}
            selected={[task.product ?? '']}
            onSelect={(v) => save({ product: v || null })}
          />
        </Property>

        <Property label="Tags">
          <PropertyPicker
            label={`Tags: ${task.tags.join(', ') || 'none'}. Change tags`}
            placeholder="Add or remove tags…"
            multiple
            trigger={
              task.tags.length > 0 ? (
                <span className="flex flex-wrap gap-1">
                  {task.tags.map((t) => (
                    <TagChip key={t} name={t} color={lookups.tagColor.get(t)} />
                  ))}
                </span>
              ) : (
                <span className="text-subtle-foreground">Add tags</span>
              )
            }
            options={tags.map((t) => ({
              value: t.name,
              label: t.name,
              icon: (
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ backgroundColor: t.color }}
                />
              ),
            }))}
            selected={task.tags}
            onSelect={(v) =>
              save({
                tags: task.tags.includes(v) ? task.tags.filter((t) => t !== v) : [...task.tags, v],
              })
            }
          />
        </Property>
      </dl>

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
  const viaAi = p.source === 'ai';

  let text: string;
  switch (entry.kind) {
    case 'created':
      text = 'created the task';
      break;
    case 'status_changed':
      text = `changed status from ${STATUS_LABEL[p.from as keyof typeof STATUS_LABEL] ?? p.from} to ${STATUS_LABEL[p.to as keyof typeof STATUS_LABEL] ?? p.to}`;
      break;
    case 'priority_changed':
      text = `changed priority from ${PRIORITY_LABEL[p.from as keyof typeof PRIORITY_LABEL] ?? p.from} to ${PRIORITY_LABEL[p.to as keyof typeof PRIORITY_LABEL] ?? p.to}`;
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
        {viaAi && (
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
