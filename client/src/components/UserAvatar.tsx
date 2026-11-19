import type { UserDto } from '@tracker/shared';
import { cn } from '@/lib/utils.ts';

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** Initials on the user's color; a dashed ring when unassigned (§9.1). */
export function UserAvatar({
  user,
  size = 20,
  className,
}: {
  user: Pick<UserDto, 'name' | 'avatarColor'> | null | undefined;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.42)) };
  if (!user) {
    return (
      <span
        title="Unassigned"
        style={style}
        className={cn(
          'inline-block shrink-0 rounded-full border-[1.5px] border-dashed border-subtle-foreground',
          className,
        )}
      />
    );
  }
  return (
    <span
      title={user.name}
      style={{ ...style, backgroundColor: user.avatarColor }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        className,
      )}
    >
      {initials(user.name)}
    </span>
  );
}
