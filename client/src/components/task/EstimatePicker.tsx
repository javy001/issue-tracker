// Estimate in hours (§5: 0.5 h steps, 0.5–80 h): quick picks plus a validated custom value.
import { ESTIMATE_HOURS, estimateHoursSchema } from '@tracker/shared';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.tsx';
import { cn } from '@/lib/utils.ts';
import { pickerTriggerClass, type PickerVariant } from './PropertyPicker.tsx';

const QUICK = [0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 40];

export function EstimatePicker({
  value,
  trigger,
  onChange,
  variant,
}: {
  value: number | null;
  trigger: ReactNode;
  onChange: (hours: number | null) => void;
  variant?: PickerVariant;
}) {
  const inputId = useId();
  const errorId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const choose = (hours: number | null) => {
    onChange(hours);
    setOpen(false);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    // React bubbles events through portals: don't submit an enclosing form (New task dialog).
    e.stopPropagation();
    const parsed = estimateHoursSchema.safeParse(Number(draft));
    if (!draft.trim() || !parsed.success) {
      setError(
        `Enter ${ESTIMATE_HOURS.min}–${ESTIMATE_HOURS.max} hours in ${ESTIMATE_HOURS.step} h steps`,
      );
      return;
    }
    choose(parsed.data);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setDraft(value === null ? '' : String(value));
        setError(null);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Estimate: ${value === null ? 'none' : `${value} hours`}. Change estimate`}
          className={pickerTriggerClass(variant)}
        >
          {trigger}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-4 gap-1">
            {QUICK.map((h) => (
              <Button
                key={h}
                type="button"
                variant={h === value ? 'secondary' : 'ghost'}
                size="sm"
                className={cn('font-normal', h === value && 'font-medium')}
                onClick={() => choose(h)}
              >
                {h}h
              </Button>
            ))}
          </div>
          <form onSubmit={submit} className="flex flex-col gap-1.5">
            <label htmlFor={inputId} className="text-[11px] font-medium text-subtle-foreground">
              Custom (hours)
            </label>
            <div className="flex gap-1.5">
              <Input
                id={inputId}
                inputMode="decimal"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setError(null);
                }}
                aria-invalid={!!error}
                aria-describedby={error ? errorId : undefined}
                className="h-7 text-[13px]"
              />
              <Button type="submit" size="default">
                Set
              </Button>
            </div>
            {error && (
              <p id={errorId} role="alert" className="text-[11px] text-destructive">
                {error}
              </p>
            )}
          </form>
          {value !== null && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start text-muted-foreground"
              onClick={() => choose(null)}
            >
              Clear estimate
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
