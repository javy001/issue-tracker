import { createBrowserRouter, Navigate } from 'react-router';
import { AppLayout } from '@/components/AppLayout.tsx';
import { PlaceholderPage } from './PlaceholderPage.tsx';

// §9.3 routes. Pages are placeholders until their features are built.
export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/my-issues" replace /> },
      { path: 'my-issues', element: <PlaceholderPage title="My issues" /> },
      { path: 'team/:teamKey/:tab', element: <PlaceholderPage title="Team" /> },
      { path: 'views/:viewId', element: <PlaceholderPage title="Saved view" /> },
      { path: '*', element: <PlaceholderPage title="Not found" /> },
    ],
  },
]);
