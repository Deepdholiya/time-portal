import { createContext, useContext } from "react";

export interface NewTaskDefaults { projectId?: number; parentId?: number; status?: string; assigneeId?: number | null; milestoneId?: number; dueDate?: string; section?: string }
export interface NewEntryDefaults { date?: string; projectId?: number; taskId?: number; userId?: number }

/** App-wide actions any page can trigger: open a task in the side panel, create a task, log time. */
export interface Shell {
  openTask: (id: number) => void;
  newTask: (defaults?: NewTaskDefaults, onCreated?: (task: { id: number }) => void) => void;
  logTime: (defaults?: NewEntryDefaults, onSaved?: () => void) => void;
  editEntry: (id: number, onSaved?: () => void) => void;
  openCommand: () => void;
}

export const ShellContext = createContext<Shell | null>(null);
export function useShell() {
  const s = useContext(ShellContext);
  if (!s) throw new Error("useShell outside the app shell");
  return s;
}
