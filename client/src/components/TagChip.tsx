import { cn } from '@/lib/utils.ts';

/** Neutral pill with a colored dot (§9.1). */
export function TagChip({
  name,
  color,
  className,
}: {
  name: string;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border px-[7px] text-[11px] text-muted-foreground',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full"
        style={{ backgroundColor: color ?? 'var(--status-gray)' }}
      />
      {name}
    </span>
  );
}
