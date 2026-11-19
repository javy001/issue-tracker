import { NavLink, Outlet } from 'react-router';
import { useHealth } from '@/api/health.ts';
import { cn } from '@/lib/utils.ts';

// §9.2 three-pane shell. The sidebar is a skeleton until the navigation feature is built.
export function AppLayout() {
  const health = useHealth();

  return (
    <div className="flex min-h-screen flex-wrap">
      <nav
        aria-label="Workspace"
        className="flex min-w-0 flex-[1_1_220px] flex-col gap-4 border-r bg-sidebar px-2 py-2.5 md:max-w-[240px]"
      >
        <div className="flex h-[30px] items-center gap-2 px-2 font-semibold">
          <span className="inline-flex size-5 items-center justify-center rounded-[5px] bg-primary text-[11px] text-primary-foreground">
            N
          </span>
          Northwind
        </div>
        <div className="flex flex-col gap-px">
          <SidebarLink to="/my-issues">My issues</SidebarLink>
        </div>
        <div className="mt-auto flex items-center gap-2 border-t px-2 pt-2 text-[11px] text-subtle-foreground">
          <span
            aria-hidden="true"
            className={cn(
              'size-1.5 rounded-full',
              health.isSuccess
                ? 'bg-status-done'
                : health.isError
                  ? 'bg-destructive'
                  : 'bg-status-gray',
            )}
          />
          {health.isSuccess ? 'API connected' : health.isError ? 'API unreachable' : 'Connecting…'}
        </div>
      </nav>
      <main className="flex min-w-0 flex-[999_1_560px] flex-col">
        <Outlet />
      </main>
    </div>
  );
}

function SidebarLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex h-7 items-center rounded-md px-2 text-muted-foreground hover:bg-accent',
          isActive && 'bg-accent text-foreground',
        )
      }
    >
      {children}
    </NavLink>
  );
}
