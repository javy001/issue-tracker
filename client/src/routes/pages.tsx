import type { SavedViewDto } from '@tracker/shared';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { ApiError } from '@/api/client.ts';
import { useMe, useTeams } from '@/api/reference.ts';
import { useDeleteView, useUpdateView, useView } from '@/api/views.ts';
import { TaskListPage, type PageState } from '@/components/task/TaskListPage.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import { Input } from '@/components/ui/input.tsx';
import { sameFilter, toUserFilter } from '@/lib/filters.ts';
import { presets } from '@/lib/presets.ts';
import { PlaceholderPage } from './PlaceholderPage.tsx';

// New-task defaults per page follow §9.2 v1.6.

export function MyIssuesPage() {
  const me = useMe().data;
  return (
    <TaskListPage
      crumbs={['My issues']}
      baseFilter={presets.myIssues()}
      emptyText="Nothing assigned to you is open. Nice."
      newTaskDefaults={{ assignee: me?.handle ?? null, status: 'todo' }}
    />
  );
}

export function TriagePage() {
  return (
    <TaskListPage
      crumbs={['Triage']}
      baseFilter={presets.triage()}
      emptyText="Every open task has an owner."
      newTaskDefaults={{ assignee: null }}
    />
  );
}

export function TeamPage() {
  const { teamKey = '', tab } = useParams();
  const teams = useTeams();
  const me = useMe().data;
  const team = teams.data?.find((t) => t.key === teamKey.toUpperCase());

  if (teams.isPending) return null;
  if (!team || (tab !== 'active' && tab !== 'backlog'))
    return <PlaceholderPage title="Not found" />;

  // A task's team comes from its assignee (§5 v1.3), so default to me only if I'm in this team.
  const assignee = me?.team === team.key ? me.handle : null;

  return (
    <TaskListPage
      key={`${team.key}-${tab}`}
      crumbs={[team.name, tab === 'active' ? 'Active' : 'Backlog']}
      baseFilter={tab === 'active' ? presets.teamActive(team.key) : presets.teamBacklog(team.key)}
      emptyText={
        tab === 'active'
          ? `${team.name} has nothing in progress.`
          : `${team.name}'s backlog is empty.`
      }
      newTaskDefaults={{ status: tab === 'active' ? 'todo' : 'backlog', assignee }}
    />
  );
}

const NO_BASE = { conditions: [] };

/** A saved view (§6.2 v1.8): its whole filter is editable chips; changes stay in the URL until saved. */
export function ViewPage() {
  const { viewId = '' } = useParams();
  const view = useView(viewId);
  const defaultUserFilter = useMemo(
    () => (view.data ? toUserFilter(view.data.filter) : undefined),
    [view.data],
  );

  if (view.isPending) return null;
  if (view.isError || !view.data || !defaultUserFilter) {
    const missing = view.error instanceof ApiError && view.error.status === 404;
    return (
      <PlaceholderPage
        title="Saved view"
        message={
          missing
            ? "This view doesn't exist or was deleted."
            : `Couldn't load this view. ${view.error?.message ?? ''}`
        }
      />
    );
  }

  return (
    <TaskListPage
      key={viewId}
      crumbs={['Saved views', view.data.name]}
      baseFilter={NO_BASE}
      defaultUserFilter={defaultUserFilter}
      defaultLayout={view.data.display.layout}
      emptyText="No tasks match this view."
      newTaskDefaults={{}}
      headerActions={(state) => (
        <ViewActions view={view.data} state={state} defaults={defaultUserFilter} />
      )}
    />
  );
}

function ViewActions({
  view,
  state,
  defaults,
}: {
  view: SavedViewDto;
  state: PageState;
  defaults: ReturnType<typeof toUserFilter>;
}) {
  const [, setParams] = useSearchParams();
  const update = useUpdateView(view.id);
  const dirty =
    (state.filterChanged && !sameFilter(state.userFilter, defaults)) || state.layoutChanged;

  const discard = () =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('q');
      next.delete('layout');
      return next;
    });

  return (
    <div className="flex items-center gap-1.5">
      {update.isError && (
        <span role="alert" className="text-xs text-destructive">
          Couldn't save: {update.error.message}
        </span>
      )}
      {dirty && (
        <>
          <span className="text-xs text-subtle-foreground">Unsaved changes</span>
          <Button variant="ghost" onClick={discard}>
            Discard
          </Button>
          <Button
            variant="outline"
            disabled={update.isPending}
            onClick={() =>
              update.mutate(
                { filter: state.userFilter, display: { layout: state.layout } },
                { onSuccess: discard }, // the saved view now holds what the URL held
              )
            }
          >
            {update.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      )}
      <ViewMenu view={view} />
    </div>
  );
}

function ViewMenu({ view }: { view: SavedViewDto }) {
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null);
  const [name, setName] = useState(view.name);
  const update = useUpdateView(view.id);
  const remove = useDeleteView(view.id);
  const navigate = useNavigate();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="View actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              setName(view.name);
              setDialog('rename');
            }}
          >
            <Pencil />
            Rename…
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog('delete')}>
            <Trash2 />
            Delete view…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDialog(null);
            update.reset();
            remove.reset();
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          {dialog === 'rename' ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!name.trim()) return;
                update.mutate({ name: name.trim() }, { onSuccess: () => setDialog(null) });
              }}
            >
              <DialogHeader>
                <DialogTitle>Rename view</DialogTitle>
                <DialogDescription className="sr-only">
                  Enter a new name for this view.
                </DialogDescription>
              </DialogHeader>
              <Input
                autoFocus
                aria-label="View name"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                className="h-8 text-[13px]"
              />
              {update.isError && (
                <p role="alert" className="m-0 text-xs text-destructive">
                  Couldn't rename: {update.error.message}
                </p>
              )}
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={!name.trim() || update.isPending}>
                  Rename
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Delete “{view.name}”?</DialogTitle>
                <DialogDescription>
                  The view is removed from your sidebar. Tasks are not affected.
                </DialogDescription>
              </DialogHeader>
              {remove.isError && (
                <p role="alert" className="m-0 text-xs text-destructive">
                  Couldn't delete: {remove.error.message}
                </p>
              )}
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  disabled={remove.isPending}
                  onClick={() =>
                    remove.mutate(undefined, { onSuccess: () => void navigate('/my-issues') })
                  }
                >
                  Delete view
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
