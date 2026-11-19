// List presets (§9.2 v1.4): each page is a filter AST (§6.1).
import type { Condition, FilterQueryInput } from '@tracker/shared';

const open: Condition = { field: 'status', op: 'isNoneOf', value: ['done', 'canceled'] };

export const presets = {
  myIssues: (): FilterQueryInput => ({
    conditions: [{ field: 'assignee', op: 'is', value: 'me' }, open],
  }),
  triage: (): FilterQueryInput => ({
    conditions: [{ field: 'assignee', op: 'isEmpty' }, open],
  }),
  teamActive: (team: string): FilterQueryInput => ({
    conditions: [
      { field: 'team', op: 'is', value: team },
      { field: 'status', op: 'isAnyOf', value: ['todo', 'in_progress', 'in_review'] },
    ],
  }),
  teamBacklog: (team: string): FilterQueryInput => ({
    conditions: [
      { field: 'team', op: 'is', value: team },
      { field: 'status', op: 'is', value: 'backlog' },
    ],
  }),
};
