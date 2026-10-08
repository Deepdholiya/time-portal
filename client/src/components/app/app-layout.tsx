import { Suspense, useCallback, useMemo, useState, lazy } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Menu as MenuIcon, Search } from "lucide-react";
import { IconButton, Loading } from "@/components/arc";
import { useHotkey } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { toggleTheme } from "@/lib/theme";
import { Sidebar } from "./sidebar";
import { CommandMenu } from "./command-menu";
import { ShellContext, type NewEntryDefaults, type NewTaskDefaults, type Shell } from "./shell-context";
import s from "./layout.module.css";

const TaskSheet = lazy(() => import("@/pages/tasks/task-sheet"));
const NewTaskDialog = lazy(() => import("@/pages/tasks/new-task-dialog"));
const EntryDialog = lazy(() => import("@/pages/time/entry-dialog"));

type EntryState = { open: boolean; id?: number; defaults?: NewEntryDefaults; onSaved?: () => void };

export function AppLayout() {
  const { me } = useSession();
  const nav = useNavigate();
  const loc = useLocation();
  const [cmd, setCmd] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [taskId, setTaskId] = useState<number | null>(null);
  const [newTask, setNewTask] = useState<{ open: boolean; defaults?: NewTaskDefaults; onCreated?: (t: { id: number }) => void }>({ open: false });
  const [entry, setEntry] = useState<EntryState>({ open: false });

  const openTask = useCallback((id: number) => setTaskId(id), []);
  const shell = useMemo<Shell>(() => ({
    openTask,
    newTask: (defaults, onCreated) => setNewTask({ open: true, defaults, onCreated }),
    logTime: (defaults, onSaved) => setEntry({ open: true, defaults, onSaved }),
    editEntry: (id, onSaved) => setEntry({ open: true, id, onSaved }),
    openCommand: () => setCmd(true),
  }), [openTask]);

  useHotkey("mod+k", () => setCmd((v) => !v), { allowInInputs: true });
  useHotkey("c", () => setNewTask({ open: true }));
  useHotkey("shift+d", toggleTheme);
  useHotkey("/", () => setCmd(true));

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
          <div className={s.mobileBar}>
            <IconButton label="Open menu" icon={<MenuIcon size={18} />} onClick={() => setDrawer(true)} />
            <span className="strong grow ellipsis">{me?.company.name}</span>
            <IconButton label="Search" icon={<Search size={16} />} onClick={() => setCmd(true)} />
          </div>
          <div className={s.content}>
            <Suspense fallback={<Loading />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
      <CommandMenu open={cmd} onClose={() => setCmd(false)} />
      <Suspense fallback={null}>
        {shownTask !== null && <TaskSheet id={shownTask} onClose={closeTask} onOpenTask={openTask} />}
        {newTask.open && <NewTaskDialog defaults={newTask.defaults} onClose={() => setNewTask({ open: false })} onCreated={newTask.onCreated} />}
        {entry.open && <EntryDialog id={entry.id} defaults={entry.defaults} onClose={() => setEntry({ open: false })} onSaved={entry.onSaved} />}
      </Suspense>
    </ShellContext.Provider>
  );
}
