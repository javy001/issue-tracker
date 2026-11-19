import { useParams } from 'react-router';
import { useTeams } from '@/api/reference.ts';
import { TaskListPage } from '@/components/task/TaskListPage.tsx';
import { presets } from '@/lib/presets.ts';
import { PlaceholderPage } from './PlaceholderPage.tsx';

export function MyIssuesPage() {
  return (
    <TaskListPage
      crumbs={['My issues']}
      filter={presets.myIssues()}
      emptyText="Nothing assigned to you is open. Nice."
    />
  );
}

export function TriagePage() {
  return (
    <TaskListPage
      crumbs={['Triage']}
      filter={presets.triage()}
      emptyText="Every open task has an owner."
    />
  );
}

export function TeamPage() {
  const { teamKey = '', tab } = useParams();
  const teams = useTeams();
  const team = teams.data?.find((t) => t.key === teamKey.toUpperCase());

  if (teams.isPending) return null;
  if (!team || (tab !== 'active' && tab !== 'backlog'))
    return <PlaceholderPage title="Not found" />;

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
    />
  );
}
