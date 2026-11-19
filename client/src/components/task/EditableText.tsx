// Click-to-edit title and description (§9.2 v1.6). Title: Enter/blur saves. Description:
// ⌘/Ctrl+Enter or blur saves. Esc cancels both.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input.tsx';
import { Textarea } from '@/components/ui/textarea.tsx';
import { cn } from '@/lib/utils.ts';

const MAX_TITLE = 200;

export function EditableTitle({
  value,
  onSave,
}: {
  value: string;
  onSave: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const start = () => {
    cancelled.current = false;
    setDraft(value);
    setError(null);
    setEditing(true);
  };
  const commit = () => {
    if (cancelled.current) return;
    const next = draft.trim();
    if (!next) {
      setError('Title is required');
      return;
    }
    setEditing(false);
    if (next !== value) onSave(next);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancelled.current = true;
      setEditing(false);
    }
  };

  if (!editing) {
    return (
      <h2 className="m-0">
        <button
          type="button"
          onClick={start}
          aria-label={`Title: ${value}. Edit title`}
          className="-mx-1.5 w-[calc(100%+12px)] rounded-md px-1.5 py-0.5 text-left text-[17px] leading-snug font-semibold outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          {value}
        </button>
      </h2>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <Input
        ref={input}
        aria-label="Title"
        value={draft}
        maxLength={MAX_TITLE}
        aria-invalid={!!error}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className="h-9 text-[17px] font-semibold"
      />
      {error && (
        <p role="alert" className="m-0 text-[11px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function EditableDescription({
  value,
  onSave,
}: {
  value: string;
  onSave: (description: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const area = useRef<HTMLTextAreaElement>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (editing) {
      const el = area.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editing]);

  const commit = () => {
    if (cancelled.current) return;
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          cancelled.current = false;
          setDraft(value);
          setEditing(true);
        }}
        aria-label={value ? 'Description. Edit description' : 'Add a description'}
        className={cn(
          '-mx-1.5 w-[calc(100%+12px)] rounded-md px-1.5 py-1 text-left whitespace-pre-wrap outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
          value ? 'text-muted-foreground' : 'text-subtle-foreground italic',
        )}
      >
        {value || 'Add a description…'}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <Textarea
        ref={area}
        aria-label="Description"
        value={draft}
        maxLength={10_000}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cancelled.current = true;
            setEditing(false);
          }
        }}
        className="min-h-24 text-[13px]"
      />
      <p className="m-0 text-[11px] text-subtle-foreground">⌘/Ctrl+Enter to save · Esc to cancel</p>
    </div>
  );
}
