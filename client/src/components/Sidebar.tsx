import { CircleUser, Inbox, ListFilter, Plus, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { useHealth } from '@/api/health.ts';
import { useMe, useTeams } from '@/api/reference.ts';
import { useViews } from '@/api/views.ts';
import { cn } from '@/lib/utils.ts';
import { usePalette } from './keyboard/CommandPalette.tsx';
import { useNewTask } from './task/NewTaskDialog.tsx';
import { Button } from './ui/button.tsx';
import { UserAvatar } from './UserAvatar.tsx';

// §9.2 v1.4/v1.8: My issues, Triage, Teams (Active / Backlog), Saved views, current-user footer.
export function Sidebar() {
  const me = useMe().data;
  const teams = useTeams().data ?? [];
  const views = useViews();
  const health = useHealth();
  const { openNewTask } = useNewTask();
  const { openPalette } = usePalette();

  return (
    <nav
      aria-label="Workspace"
      className="flex min-w-0 flex-[1_1_220px] flex-col gap-4 border-r bg-sidebar px-2 py-2.5 md:h-full md:max-w-[240px] md:overflow-y-auto"
    >
      <div className="flex h-[30px] items-center gap-2 px-2 font-semibold">
        <span className="inline-flex size-5 items-center justify-center rounded-[5px] bg-primary text-[11px] text-primary-foreground">
          N
        </span>
        <span className="flex-1">Northwind</span>
        <Button variant="ghost" size="icon" aria-label="Search (⌘K)" onClick={() => openPalette()}>
          <Search />
        </Button>
        <Button variant="outline" size="icon" aria-label="New task" onClick={openNewTask}>
          <Plus />
        </Button>
      </div>

      <div className="flex flex-col gap-px">
        <SidebarLink to="/my-issues" icon={<CircleUser className="size-3.5" />}>
          My issues
        </SidebarLink>
        <SidebarLink to="/triage" icon={<Inbox className="size-3.5" />}>
          Triage
        </SidebarLink>
      </div>

      <div className="flex flex-col gap-px">
        <div className="px-2 pb-1 text-[11px] font-medium text-subtle-foreground">Teams</div>
        {teams.map((team) => (
          <div key={team.key} className="flex flex-col gap-px">
            <div className="flex h-7 items-center gap-2 px-2 font-medium">
              <span
                aria-hidden="true"
                className="inline-flex size-4 items-center justify-center rounded-[4px] text-[9px] font-semibold text-white"
                style={{ backgroundColor: team.color }}
              >
                {team.name[0]}
              </span>
              {team.name}
            </div>
            <SidebarLink to={`/team/${team.key}/active`} indent>
              Active
            </SidebarLink>
            <SidebarLink to={`/team/${team.key}/backlog`} indent>
              Backlog
            </SidebarLink>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-px">
        <div className="px-2 pb-1 text-[11px] font-medium text-subtle-foreground">Saved views</div>
        {views.isError && (
          <p className="m-0 px-2 text-xs text-muted-foreground">Couldn't load views.</p>
        )}
        {views.data?.length === 0 && (
          <p className="m-0 px-2 text-xs text-subtle-foreground">Use “Save as view” on any list.</p>
        )}
        {views.data?.map((v) => (
          <SidebarLink key={v.id} to={`/views/${v.id}`} icon={<ListFilter className="size-3.5" />}>
            <span className="truncate">{v.name}</span>
          </SidebarLink>
        ))}
      </div>

      <div className="mt-auto flex items-center gap-2 border-t px-2 pt-2">
        <UserAvatar user={me} size={24} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{me?.name ?? '…'}</span>
          <span className="font-mono text-[11px] text-subtle-foreground">
            --user={me?.handle ?? '…'}
          </span>
        </div>
        <span
          role="status"
          title={
            health.isSuccess ? 'API connected' : health.isError ? 'API unreachable' : 'Connecting…'
          }
          aria-label={
            health.isSuccess ? 'API connected' : health.isError ? 'API unreachable' : 'Connecting'
          }
          className={cn(
            'size-2 rounded-full',
            health.isSuccess
              ? 'bg-status-done'
              : health.isError
                ? 'bg-destructive'
                : 'bg-status-gray',
          )}
        />
      </div>
    </nav>
  );
}

function SidebarLink({
  to,
  icon,
  indent,
  children,
}: {
  to: string;
  icon?: ReactNode;
  indent?: boolean;
  children: ReactNode;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex h-7 items-center gap-2 rounded-md px-2 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
          indent && 'pl-8',
          isActive && 'bg-accent text-foreground',
        )
      }
    >
      {icon}
      {children}
    </NavLink>
  );
}
