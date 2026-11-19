// Searchable single/multi select built from shadcn Popover + Command (§9.1: shadcn primitives).
import { Check } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.tsx';
import { cn } from '@/lib/utils.ts';

export interface PickerOption {
  value: string;
  label: string;
  icon?: ReactNode;
  hint?: string;
}

interface Props {
  /** Accessible name of the trigger, e.g. "Status: In Progress. Change status". */
  label: string;
  placeholder: string;
  trigger: ReactNode;
  options: PickerOption[];
  selected: string[];
  onSelect: (value: string) => void;
  multiple?: boolean;
  disabled?: boolean;
}

export function PropertyPicker({
  label,
  placeholder,
  trigger,
  options,
  selected,
  onSelect,
  multiple,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          className="-ml-2 inline-flex h-7 max-w-full min-w-0 items-center gap-2 rounded-md px-2 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {trigger}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-0">
        <Command>
          <CommandInput placeholder={placeholder} className="h-9 text-[13px]" />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const isSelected = selected.includes(o.value);
                return (
                  <CommandItem
                    key={o.value}
                    value={`${o.label} ${o.value}`}
                    onSelect={() => {
                      onSelect(o.value);
                      if (!multiple) setOpen(false);
                    }}
                    className="gap-2 text-[13px]"
                  >
                    {o.icon}
                    <span className="flex-1 truncate">{o.label}</span>
                    {o.hint && <span className="text-[11px] text-subtle-foreground">{o.hint}</span>}
                    <Check
                      className={cn('size-3.5', isSelected ? 'opacity-100' : 'opacity-0')}
                      aria-hidden="true"
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
