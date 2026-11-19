// Static demo data for the seed (design doc §10). Generated tasks are built from these lists.
import type { TaskPriority, TaskStatus } from '@tracker/shared';

export const USERS = [
  { handle: 'ana', name: 'Ana Ruiz', avatarColor: '#7C4DCC' },
  { handle: 'ben', name: 'Ben Okafor', avatarColor: '#1F7A6D' },
  { handle: 'chen', name: 'Chen Wei', avatarColor: '#B4532A' },
  { handle: 'dana', name: 'Dana Park', avatarColor: '#2F64C8' },
  { handle: 'eli', name: 'Eli Moss', avatarColor: '#8A3F6B' },
  { handle: 'fatima', name: 'Fatima Haddad', avatarColor: '#9A4A1F' },
  { handle: 'gus', name: 'Gus Lindqvist', avatarColor: '#3F6E2A' },
] as const;
export type Handle = (typeof USERS)[number]['handle'];

export const PRODUCTS = ['Web App', 'API', 'Mobile'] as const;
export type ProductName = (typeof PRODUCTS)[number];

export const TAGS = [
  { name: 'bug', color: '#E5534B' },
  { name: 'feature', color: '#9B87F5' },
  { name: 'auth', color: '#B17BEA' },
  { name: 'filters', color: '#2FA6D9' },
  { name: 'a11y', color: '#2DB37F' },
  { name: 'api', color: '#D9921A' },
  { name: 'perf', color: '#E07B3A' },
  { name: 'design', color: '#E06AAE' },
  { name: 'ai', color: '#7B8CF0' },
  { name: 'devx', color: '#8A95A8' },
] as const;
export type TagName = (typeof TAGS)[number]['name'];

type Kind = 'bug' | 'feature' | 'design' | 'platform';

export interface TeamSeed {
  key: string;
  name: string;
  color: string;
  members: Handle[];
  generatedCount: number;
  products: [ProductName, number][]; // weighted
  kinds: [Kind, number][]; // weighted
}

export const TEAMS: TeamSeed[] = [
  {
    key: 'ENG',
    name: 'Engineering',
    color: '#1F7A6D',
    members: ['ana', 'ben', 'chen', 'eli', 'gus'],
    generatedCount: 255,
    products: [
      ['Web App', 5],
      ['API', 3],
      ['Mobile', 2],
    ],
    kinds: [
      ['bug', 5],
      ['feature', 5],
    ],
  },
  {
    key: 'DES',
    name: 'Design',
    color: '#8A3F6B',
    members: ['dana', 'fatima', 'ana'],
    generatedCount: 110,
    products: [
      ['Web App', 6],
      ['Mobile', 4],
    ],
    kinds: [
      ['design', 8],
      ['bug', 2],
    ],
  },
  {
    key: 'PLT',
    name: 'Platform',
    color: '#B4532A',
    members: ['eli', 'gus', 'chen'],
    generatedCount: 125,
    products: [
      ['API', 7],
      ['Web App', 3],
    ],
    kinds: [
      ['platform', 7],
      ['bug', 3],
    ],
  },
];

export const AREAS: Record<ProductName, string[]> = {
  'Web App': [
    'Task list',
    'Board view',
    'Command palette',
    'Filter bar',
    'Saved views sidebar',
    'Task detail panel',
    'Login page',
    'Settings page',
    'Search results',
    'Keyboard shortcuts',
  ],
  API: [
    'Tasks endpoint',
    'Search endpoint',
    'Saved views API',
    'Pagination cursor',
    'Webhook delivery',
    'Rate limiter',
    'Auth middleware',
    'Export job',
  ],
  Mobile: [
    'Push notifications',
    'Offline mode',
    'Task detail screen',
    'Inbox screen',
    'Login flow',
    'Image upload',
  ],
};

// UI templates apply to Web App and Mobile areas; API templates to API areas.
export type Surface = 'ui' | 'api';
export const surfaceOf = (product: ProductName): Surface => (product === 'API' ? 'api' : 'ui');

export const TITLE_TEMPLATES: Record<Kind, Record<Surface, string[]>> = {
  bug: {
    ui: [
      '{area} crashes when the list is empty',
      '{area} shows stale data after an update',
      '{area} flickers while scrolling',
      '{area} ignores the selected sort order',
      '{area} drops unsaved changes on navigation',
      '{area} is slow with 1,000+ tasks',
      '{area} renders the wrong colors in light theme',
      '{area} loses focus after closing a dialog',
      '{area} submits twice on Enter',
    ],
    api: [
      '{area} returns 500 for very long titles',
      '{area} returns stale results after an update',
      '{area} times out under load',
      '{area} ignores the requested sort order',
      '{area} accepts invalid input',
      '{area} leaks database connections on error',
      '{area} is slow with 1,000+ tasks',
    ],
  },
  feature: {
    ui: [
      'Add bulk edit to {area}',
      'Support keyboard navigation in {area}',
      'Add an empty state to {area}',
      'Show relative timestamps in {area}',
      'Remember the last used filter in {area}',
      'Add loading skeletons to {area}',
    ],
    api: [
      'Add request validation to {area}',
      'Add integration tests for {area}',
      'Add CSV export to {area}',
      'Support partial updates in {area}',
      'Add field selection to {area}',
    ],
  },
  design: {
    ui: [
      'Design the {area} empty state',
      'Refresh icons in {area}',
      'Audit color contrast in {area}',
      'Prototype a denser {area} layout',
      'Write the interaction spec for {area}',
      'Polish hover and focus states in {area}',
    ],
    api: ['Write the error message guidelines for {area}'],
  },
  platform: {
    ui: [
      'Add error tracking to {area}',
      'Reduce bundle size of {area}',
      'Add performance budgets for {area}',
    ],
    api: [
      'Add metrics and alerts for {area}',
      'Reduce p95 latency of {area}',
      'Add retries with backoff to {area}',
      'Write a runbook for {area}',
      'Add structured logging to {area}',
      'Load test {area}',
    ],
  },
};

export const DESCRIPTION_TEMPLATES: Record<Kind, string[]> = {
  bug: [
    'Reported by two users this week. Steps: open {area}, perform the action, observe the problem. Expected: no error and the latest data.',
    'Happens intermittently in {area}. Logs show the request succeeding, so the issue is likely client-side state.',
    'Reproducible on the latest build. Started after the last release; check recent changes to {area}.',
  ],
  feature: [
    'Users have asked for this in {area}. Keep it consistent with the rest of the app and keyboard accessible.',
    'Small improvement to {area}. Scope: implementation, tests and a short note in the changelog.',
    'Part of the quarter goal to make {area} faster to use. Coordinate with Design before building.',
  ],
  design: [
    'Explore two or three options for {area} and share them in the design review.',
    'The current {area} feels inconsistent with the rest of the app. Align it with the design language.',
  ],
  platform: [
    'Needed before traffic grows. {area} should degrade gracefully and be observable.',
    'Follow-up from the last incident review: improve the reliability of {area}.',
  ],
};

// Weighted distributions for generated tasks.
export const STATUS_WEIGHTS: [TaskStatus, number][] = [
  ['backlog', 20],
  ['todo', 25],
  ['in_progress', 15],
  ['in_review', 10],
  ['done', 25],
  ['canceled', 5],
];
export const PRIORITY_WEIGHTS: [TaskPriority, number][] = [
  ['none', 15],
  ['low', 25],
  ['medium', 30],
  ['high', 20],
  ['urgent', 10],
];
export const ESTIMATE_CHOICES: [number, number][] = [
  [0.5, 4],
  [1, 8],
  [1.5, 4],
  [2, 10],
  [3, 8],
  [4, 8],
  [6, 5],
  [8, 6],
  [12, 3],
  [16, 3],
  [24, 2],
  [40, 1],
];

// Hand-written tasks that match the approved design mockup, so the demo opens on familiar data.
export interface HandcraftedTask {
  team: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: Handle | null;
  product: ProductName;
  tags: TagName[];
  estimateHours: number | null;
  daysAgo: number;
}

export const HANDCRAFTED_TASKS: HandcraftedTask[] = [
  {
    team: 'ENG',
    title: 'Login redirect loops after session expires',
    description:
      'After the session cookie expires, /login redirects to /tasks, which redirects back to /login. Repro: idle for 30 minutes, then reload any task page.',
    status: 'in_progress',
    priority: 'urgent',
    assignee: 'ana',
    product: 'Web App',
    tags: ['bug', 'auth'],
    estimateHours: 3,
    daysAgo: 2,
  },
  {
    team: 'ENG',
    title: 'Saved view filters drop tag conditions on reload',
    description:
      'Saving a view with a tag condition works, but after a reload the tag condition is missing from the filter. Other conditions persist.',
    status: 'todo',
    priority: 'high',
    assignee: null,
    product: 'Web App',
    tags: ['bug', 'filters'],
    estimateHours: null,
    daysAgo: 3,
  },
  {
    team: 'ENG',
    title: 'Keyboard focus lost after closing task panel',
    description:
      'Pressing Esc closes the panel, but focus moves to the document body instead of returning to the selected row.',
    status: 'in_review',
    priority: 'high',
    assignee: 'ben',
    product: 'Web App',
    tags: ['bug', 'a11y'],
    estimateHours: 1,
    daysAgo: 4,
  },
  {
    team: 'ENG',
    title: 'Board drag-and-drop flickers on Safari',
    description:
      'Cards flash at their old position for one frame after dropping into a new column. Safari only.',
    status: 'todo',
    priority: 'urgent',
    assignee: 'gus',
    product: 'Web App',
    tags: ['bug'],
    estimateHours: 2,
    daysAgo: 1,
  },
  {
    team: 'ENG',
    title: 'Natural-language filter: support date ranges',
    description:
      'Queries like “created last week” or “due before Friday” should parse into date conditions.',
    status: 'todo',
    priority: 'high',
    assignee: 'ana',
    product: 'API',
    tags: ['ai', 'feature'],
    estimateHours: null,
    daysAgo: 5,
  },
  {
    team: 'ENG',
    title: 'Offline banner overlaps the header',
    description: 'On small screens the offline banner covers the top navigation.',
    status: 'backlog',
    priority: 'none',
    assignee: null,
    product: 'Mobile',
    tags: ['bug'],
    estimateHours: null,
    daysAgo: 6,
  },
  {
    team: 'DES',
    title: 'Command palette visual pass',
    description: 'Tighten spacing, group headers and the keyboard hint style in the ⌘K palette.',
    status: 'in_review',
    priority: 'low',
    assignee: 'dana',
    product: 'Web App',
    tags: ['design'],
    estimateHours: 2,
    daysAgo: 3,
  },
];
