import { Suspense, useCallback, useMemo, useRef, useState, lazy } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Loading } from "@/components/ui";
import { useHotkey } from "@/lib/hooks";
import { toggleTheme } from "@/lib/theme";
import { Sidebar } from "./sidebar";
import { TopBar, type TopBarHandle } from "./top-bar";
import { ShellContext, type EntryFocus, type NewEntryDefaults, type NewTaskDefaults, type Shell } from "./shell-context";
import s from "./layout.module.css";

const TaskSheet = lazy(() => import("@/pages/tasks/task-sheet"));
const NewTaskDialog = lazy(() => import("@/pages/tasks/new-task-dialog"));
const EntryDialog = lazy(() => import("@/pages/time/entry-dialog"));

type EntryState = { open: boolean; id?: number; defaults?: NewEntryDefaults; focus?: EntryFocus; onSaved?: () => void };

export function AppLayout() {
  const nav = useNavigate();
  const loc = useLocation();
  const search = useRef<TopBarHandle>(null);
  const [drawer, setDrawer] = useState(false);
  const [taskId, setTaskId] = useState<number | null>(null);
  const [newTask, setNewTask] = useState<{ open: boolean; defaults?: NewTaskDefaults; onCreated?: (t: { id: number }) => void }>({ open: false });
  const [entry, setEntry] = useState<EntryState>({ open: false });

  const openTask = useCallback((id: number) => setTaskId(id), []);
  const shell = useMemo<Shell>(() => ({
    openTask,
    newTask: (defaults, onCreated) => setNewTask({ open: true, defaults, onCreated }),
    logTime: (defaults, onSaved) => setEntry({ open: true, defaults, onSaved }),
    editEntry: (id, onSaved, focus) => setEntry({ open: true, id, onSaved, focus }),
    openCommand: () => search.current?.focus(),
  }), [openTask]);

  useHotkey("mod+k", () => search.current?.focus(), { allowInInputs: true });
  useHotkey("c", () => setNewTask({ open: true }));
  useHotkey("shift+d", toggleTheme);
  useHotkey("/", () => search.current?.focus());

  // Deep links like /tasks/123 open the task panel on top of the task list.
  const deepTask = loc.pathname.match(/^\/tasks\/(\d+)$/)?.[1];
  const shownTask = taskId ?? (deepTask ? Number(deepTask) : null);
  const closeTask = () => { setTaskId(null); if (deepTask) nav("/tasks", { replace: true }); };

  return (
    <ShellContext.Provider value={shell}>
      <div className={s.app}>
        <div className={s.desktopSidebar}><Sidebar /></div>
        {drawer && (
          <div className={s.drawer}>
            <div className={s.drawerBackdrop} onClick={() => setDrawer(false)} />
            <div className={s.drawerPanel}><Sidebar onNavigate={() => setDrawer(false)} /></div>
          </div>
        )}
        <main className={s.main}>
          <TopBar ref={search} onMenu={() => setDrawer(true)} />
          <div className={s.content}>
            <Suspense fallback={<Loading />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
      <Suspense fallback={null}>
        {shownTask !== null && <TaskSheet id={shownTask} onClose={closeTask} onOpenTask={openTask} />}
        {newTask.open && <NewTaskDialog defaults={newTask.defaults} onClose={() => setNewTask({ open: false })} onCreated={newTask.onCreated} />}
        {entry.open && <EntryDialog id={entry.id} defaults={entry.defaults} focus={entry.focus} onClose={() => setEntry({ open: false })} onSaved={entry.onSaved} />}
      </Suspense>
    </ShellContext.Provider>
  );
}
