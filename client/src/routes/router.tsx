import { createBrowserRouter, Navigate } from 'react-router';
import { AppLayout } from '@/components/AppLayout.tsx';
import { MyIssuesPage, TeamPage, TriagePage, ViewPage } from './pages.tsx';
import { PlaceholderPage } from './PlaceholderPage.tsx';

// §9.3 routes (v1.4). The open task is `?task=TSK-142` on the current list.
export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/my-issues" replace /> },
      { path: 'my-issues', element: <MyIssuesPage /> },
      { path: 'triage', element: <TriagePage /> },
      { path: 'team/:teamKey/:tab', element: <TeamPage /> },
      { path: 'views/:viewId', element: <ViewPage /> },
      { path: '*', element: <PlaceholderPage title="Not found" /> },
    ],
  },
]);
