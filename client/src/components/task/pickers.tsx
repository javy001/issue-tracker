// Property pickers shared by the detail panel and the New task dialog (§9.2 v1.6).
import { TASK_STATUSES, type TaskPriority, type TaskStatus } from '@tracker/shared';
import { useLookups, useProducts, useTags, useUsers } from '@/api/reference.ts';
import { PriorityIcon, StatusIcon } from '@/components/icons.tsx';
import { TagChip } from '@/components/TagChip.tsx';
import { UserAvatar } from '@/components/UserAvatar.tsx';
import { formatHours, PRIORITY_LABEL, PRIORITY_ORDER, STATUS_LABEL } from '@/lib/labels.ts';
import { EstimatePicker } from './EstimatePicker.tsx';
import { PropertyPicker, type PickerVariant } from './PropertyPicker.tsx';

interface PickerProps<T> {
  value: T;
  onChange: (value: T) => void;
  variant?: PickerVariant;
}

export function StatusPicker({ value, onChange, variant }: PickerProps<TaskStatus>) {
  return (
    <PropertyPicker
      variant={variant}
      label={`Status: ${STATUS_LABEL[value]}. Change status`}
      placeholder="Change status…"
      trigger={
        <>
          <StatusIcon status={value} />
          {STATUS_LABEL[value]}
        </>
      }
      options={TASK_STATUSES.map((s) => ({
        value: s,
        label: STATUS_LABEL[s],
        icon: <StatusIcon status={s} />,
      }))}
      selected={[value]}
      onSelect={(v) => onChange(v as TaskStatus)}
    />
  );
}

export function PriorityPicker({ value, onChange, variant }: PickerProps<TaskPriority>) {
  return (
    <PropertyPicker
      variant={variant}
      label={`Priority: ${PRIORITY_LABEL[value]}. Change priority`}
      placeholder="Change priority…"
      trigger={
        <>
          <PriorityIcon priority={value} />
          {PRIORITY_LABEL[value]}
        </>
      }
      options={PRIORITY_ORDER.map((p) => ({
        value: p,
        label: PRIORITY_LABEL[p],
        icon: <PriorityIcon priority={p} />,
      }))}
      selected={[value]}
      onSelect={(v) => onChange(v as TaskPriority)}
    />
  );
}

export function AssigneePicker({ value, onChange, variant }: PickerProps<string | null>) {
  const users = useUsers().data ?? [];
  const lookups = useLookups();
  const user = value ? lookups.user.get(value) : undefined;
  return (
    <PropertyPicker
      variant={variant}
      label={`Assignee: ${user?.name ?? 'unassigned'}. Change assignee`}
      placeholder="Assign to…"
      trigger={
        <>
          <UserAvatar user={user} size={18} />
          <span className="truncate">{user?.name ?? 'Unassigned'}</span>
        </>
      }
      options={[
        { value: '', label: 'Unassigned', icon: <UserAvatar user={null} size={16} /> },
        ...users.map((u) => ({
          value: u.handle,
          label: u.name,
          hint: u.team ?? undefined,
          icon: <UserAvatar user={u} size={16} />,
        })),
      ]}
      selected={[value ?? '']}
      onSelect={(v) => onChange(v || null)}
    />
  );
}

export function ProductPicker({ value, onChange, variant }: PickerProps<string | null>) {
  const products = useProducts().data ?? [];
  return (
    <PropertyPicker
      variant={variant}
      label={`Product: ${value ?? 'none'}. Change product`}
      placeholder="Change product…"
      trigger={
        <span className={value ? undefined : 'text-subtle-foreground'}>
          {value ?? 'No product'}
        </span>
      }
      options={[
        { value: '', label: 'No product' },
        ...products.map((p) => ({ value: p.name, label: p.name })),
      ]}
      selected={[value ?? '']}
      onSelect={(v) => onChange(v || null)}
    />
  );
}

export function TagsPicker({ value, onChange, variant }: PickerProps<string[]>) {
  const tags = useTags().data ?? [];
  const lookups = useLookups();
  return (
    <PropertyPicker
      variant={variant}
      multiple
      label={`Tags: ${value.join(', ') || 'none'}. Change tags`}
      placeholder="Add or remove tags…"
      trigger={
        value.length > 0 ? (
          <span className="flex flex-wrap gap-1">
            {value.map((t) => (
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
      selected={value}
      onSelect={(v) =>
        onChange(value.includes(v) ? value.filter((t) => t !== v) : [...value, v].sort())
      }
    />
  );
}

export function EstimateField({ value, onChange, variant }: PickerProps<number | null>) {
  return (
    <EstimatePicker
      variant={variant}
      value={value}
      onChange={onChange}
      trigger={
        <span className={value === null ? 'text-subtle-foreground' : undefined}>
          {value === null ? 'Set estimate' : formatHours(value)}
        </span>
      }
    />
  );
}
