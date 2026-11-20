// AI suggestions in the detail panel (§8.2 v1.12): a ✨ Suggest button, then a card
// to accept or dismiss. Nothing is applied until the user clicks.
import type { EstimateResponse } from '@tracker/shared';
import { Loader2, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { SparkleIcon } from '@/components/icons.tsx';
import { Button } from '@/components/ui/button.tsx';
import { formatHours } from '@/lib/labels.ts';

/** The parts of a React Query mutation a card reads. */
interface Suggestion<T> {
  data: T | undefined;
  isError: boolean;
  error: Error | null;
  reset: () => void;
}

export function AiSuggestButton({
  onClick,
  pending,
  pendingLabel,
  label,
}: {
  onClick: () => void;
  pending: boolean;
  pendingLabel: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label={pending ? pendingLabel : label}
      className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-[7px] text-[11px] font-medium text-ai outline-none hover:bg-ai-soft focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70"
    >
      {pending ? (
        <Loader2 className="size-[11px] animate-spin" aria-hidden="true" />
      ) : (
        <SparkleIcon className="size-[11px]" />
      )}
      {pending ? pendingLabel : 'Suggest'}
    </button>
  );
}

/** Error line or card frame, shared by both suggestion kinds. */
function SuggestionFrame<T>({
  suggestion,
  what,
  title,
  children,
  actions,
}: {
  suggestion: Suggestion<T>;
  what: string;
  title: ReactNode;
  children: (data: T) => ReactNode;
  actions?: (data: T) => ReactNode;
}) {
  if (suggestion.isError) {
    return (
      <p role="alert" className="m-0 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="flex-1">
          Couldn't suggest {what}: {suggestion.error?.message}
        </span>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => suggestion.reset()}
          className="rounded-sm p-0.5 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3" />
        </button>
      </p>
    );
  }
  const data = suggestion.data;
  if (data === undefined) return null;

  return (
    <section
      aria-label={`Suggested ${what}`}
      aria-live="polite"
      className="flex flex-col gap-2 rounded-lg bg-ai-soft px-3 py-2.5 text-xs"
    >
      <div className="flex items-center gap-1.5 text-ai">
        <SparkleIcon className="size-3.5" />
        <span className="flex-1 font-medium">{title}</span>
      </div>
      {children(data)}
      <div className="flex justify-end gap-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={() => suggestion.reset()}>
          Dismiss
        </Button>
        {actions?.(data)}
      </div>
    </section>
  );
}

export function EstimateSuggestionCard({
  suggestion,
  onAccept,
}: {
  suggestion: Suggestion<EstimateResponse>;
  onAccept: (hours: number) => void;
}) {
  const [params] = useSearchParams();
  const taskLink = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('task', id);
    return { search: next.toString() };
  };
  const hours = suggestion.data ? formatHours(suggestion.data.estimateHours) : '';

  return (
    <SuggestionFrame
      suggestion={suggestion}
      what="an estimate"
      title={`Suggested estimate: ${hours}`}
      actions={(data) => (
        <Button
          type="button"
          size="sm"
          onClick={() => {
            onAccept(data.estimateHours);
            suggestion.reset();
          }}
        >
          Accept
        </Button>
      )}
    >
      {(data) => (
        <>
          <p className="m-0 text-foreground">{data.rationale}</p>
          {data.similarTasks.length > 0 && (
            <p className="m-0 text-muted-foreground">
              Based on{' '}
              {data.similarTasks.map((s, i) => (
                <span key={s.id}>
                  {i > 0 && ' · '}
                  <Link to={taskLink(s.id)} title={s.title} className="font-mono text-foreground">
                    {s.id}
                  </Link>{' '}
                  ({formatHours(s.estimateHours)})
                </span>
              ))}
            </p>
          )}
        </>
      )}
    </SuggestionFrame>
  );
}
