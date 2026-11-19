// Status and priority icons from the approved design language (§9.1): each status has its own
// shape so it reads without color; only urgent priority is colored.
import type { TaskPriority, TaskStatus } from '@tracker/shared';
import { cn } from '@/lib/utils.ts';
import { PRIORITY_LABEL, STATUS_LABEL } from '@/lib/labels.ts';

const STATUS_COLOR: Record<TaskStatus, string> = {
  backlog: 'text-status-gray',
  todo: 'text-status-gray',
  in_progress: 'text-status-progress',
  in_review: 'text-status-review',
  done: 'text-status-done',
  canceled: 'text-status-gray',
};

export function StatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  const ring = (
    <circle cx="7" cy="7" r="5.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
  );
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      role="img"
      aria-label={STATUS_LABEL[status]}
      className={cn('shrink-0', STATUS_COLOR[status], className)}
    >
      {status === 'backlog' && (
        <circle
          cx="7"
          cy="7"
          r="5.75"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="2.1 1.9"
        />
      )}
      {status === 'todo' && ring}
      {status === 'in_progress' && (
        <>
          {ring}
          <path d="M7 3.5A3.5 3.5 0 0 1 7 10.5Z" fill="currentColor" />
        </>
      )}
      {status === 'in_review' && (
        <>
          {ring}
          <path d="M7 3.5A3.5 3.5 0 1 1 3.5 7L7 7Z" fill="currentColor" />
        </>
      )}
      {status === 'done' && (
        <>
          <circle cx="7" cy="7" r="6.5" fill="currentColor" />
          <path
            d="M4.2 7.2l1.9 1.9 3.7-3.9"
            fill="none"
            stroke="var(--background)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {status === 'canceled' && (
        <>
          <circle cx="7" cy="7" r="6.5" fill="currentColor" />
          <path
            d="M5 5l4 4M9 5l-4 4"
            fill="none"
            stroke="var(--background)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

export function PriorityIcon({
  priority,
  className,
}: {
  priority: TaskPriority;
  className?: string;
}) {
  const label = `${PRIORITY_LABEL[priority]}${priority === 'none' ? '' : ' priority'}`;
  if (priority === 'urgent') {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        role="img"
        aria-label={label}
        className={cn('shrink-0', className)}
      >
        <rect x="0.5" y="0.5" width="13" height="13" rx="3" fill="var(--priority-urgent)" />
        <path d="M7 3.6v4.2" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="7" cy="10.3" r="1" fill="#FFFFFF" />
      </svg>
    );
  }
  if (priority === 'none') {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        role="img"
        aria-label={label}
        className={cn('shrink-0 text-muted-foreground', className)}
      >
        <path
          d="M2 7h2M6 7h2M10 7h2"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  const level = { high: 3, medium: 2, low: 1 }[priority];
  const bar = (n: number) => (level >= n ? 1 : 0.28);
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      role="img"
      aria-label={label}
      className={cn('shrink-0 text-muted-foreground', className)}
    >
      <rect x="1.5" y="8" width="2.6" height="4.5" rx="0.8" fill="currentColor" opacity={bar(1)} />
      <rect x="5.7" y="5" width="2.6" height="7.5" rx="0.8" fill="currentColor" opacity={bar(2)} />
      <rect x="9.9" y="2" width="2.6" height="10.5" rx="0.8" fill="currentColor" opacity={bar(3)} />
    </svg>
  );
}

/** AI marker (§9.1): sparkle + accent tint on anything AI produced. */
export function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={cn('shrink-0', className)}
    >
      <path
        d="M8 1.8l1.3 3.4 3.4 1.3-3.4 1.3L8 11.2 6.7 7.8 3.3 6.5l3.4-1.3z"
        fill="currentColor"
      />
      <path d="M12.5 10.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" fill="currentColor" />
    </svg>
  );
}
