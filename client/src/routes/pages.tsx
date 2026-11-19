import { useParams } from 'react-router';
import { useMe, useTeams } from '@/api/reference.ts';
import { TaskListPage } from '@/components/task/TaskListPage.tsx';
import { presets } from '@/lib/presets.ts';
import { PlaceholderPage } from './PlaceholderPage.tsx';

// New-task defaults per page follow §9.2 v1.6.

export function MyIssuesPage() {
  const me = useMe().data;
  return (
    <TaskListPage
      crumbs={['My issues']}
      filter={presets.myIssues()}
      emptyText="Nothing assigned to you is open. Nice."
      newTaskDefaults={{ assignee: me?.handle ?? null, status: 'todo' }}
    />
  );
}

export function TriagePage() {
  return (
    <TaskListPage
      crumbs={['Triage']}
      filter={presets.triage()}
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
      filter={tab === 'active' ? presets.teamActive(team.key) : presets.teamBacklog(team.key)}
      emptyText={
        tab === 'active'
          ? `${team.name} has nothing in progress.`
          : `${team.name}'s backlog is empty.`
      }
      newTaskDefaults={{ status: tab === 'active' ? 'todo' : 'backlog', assignee }}
    />
  );
}
