import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar.tsx';
import { PaletteProvider } from './keyboard/CommandPalette.tsx';
import { NewTaskProvider } from './task/NewTaskDialog.tsx';

// §9.2: sidebar | main (list) | task detail panel (rendered by the list page). Panes stack on
// narrow screens.
export function AppLayout() {
  return (
    <NewTaskProvider>
      <PaletteProvider>
        <div className="flex min-h-screen flex-wrap md:h-screen md:flex-nowrap md:overflow-hidden">
          <Sidebar />
          <main className="flex min-w-0 flex-[999_1_560px] flex-col md:h-full">
            <Outlet />
          </main>
        </div>
      </PaletteProvider>
    </NewTaskProvider>
  );
}
