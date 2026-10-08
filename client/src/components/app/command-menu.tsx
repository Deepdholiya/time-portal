import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, Moon, Plus, Timer, Clock, Building, FolderKanban } from "lucide-react";
import { Kbd, toast } from "@/components/ui";
import { CommandPalette, type CommandItem } from "@/components/arc/command-palette/command-palette";
import dialogStyles from "@/components/arc/dialog/dialog.module.css";
import { get } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { toggleTheme } from "@/lib/theme";
import type { Task } from "@/lib/types";
import { visibleNav } from "./nav";
import { StatusIcon, ProjectDot } from "./icons";
import { useShell } from "./shell-context";
import s from "./command-menu.module.css";

interface Cmd { id: string; group: string; label: string; icon: ReactNode; hint?: string; keywords?: string; run: () => void }

export function CommandMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const { can, me, switchCompany } = useSession();
  const shell = useShell();
  const [q, setQ] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<{ id: number; name: string; color: string; parentId?: number | null }[]>([]);
  const dq = useDebounced(q, 150);

  useEffect(() => { if (open) { setQ(""); get<{ projects: typeof projects }>("/options").then((o) => setProjects(o.projects.filter((p) => !p.parentId))).catch(() => {}); } }, [open]);
  useEffect(() => {
    if (!open || dq.trim().length < 2) { setTasks([]); return; }
    let alive = true;
    get<Task[]>("/tasks", { q: dq, includeDone: true, parent: "all" }).then((t) => alive && setTasks(t.slice(0, 8))).catch(() => {});
    return () => { alive = false; };
  }, [dq, open]);

  const cmds = useMemo<Cmd[]>(() => {
    const go = (to: string) => () => nav(to);
    const list: Cmd[] = [
      { id: "new-task", group: "Actions", label: "Create new task", icon: <Plus size={16} />, hint: "C", run: () => shell.newTask() },
      { id: "log-time", group: "Actions", label: "Log time manually", icon: <Clock size={16} />, run: () => shell.logTime() },
      { id: "start-timer", group: "Actions", label: "Start a timer", icon: <Timer size={16} />, run: go("/time?start=1") },
      { id: "theme", group: "Actions", label: "Toggle dark mode", icon: <Moon size={16} />, hint: "⇧D", run: toggleTheme },
      ...visibleNav(can).flatMap((sec) => sec.items.map((i) => ({ id: "nav" + i.to, group: "Go to", label: i.label, icon: <i.icon size={16} />, keywords: i.keywords, run: go(i.to) }))),
      { id: "account", group: "Go to", label: "Account settings", icon: <ArrowRight size={16} />, keywords: "password mfa profile sessions", run: go("/settings/account") },
      ...(me?.companies ?? []).filter((c) => c.id !== me?.company.id).map((c) => ({ id: "co" + c.id, group: "Switch company", label: c.name, icon: <Building size={16} />, run: () => { switchCompany(c.id).then(() => nav("/")).catch(toast.error); } })),
      ...projects.map((p) => ({ id: "p" + p.id, group: "Projects", label: p.name, icon: <FolderKanban size={16} color={p.color} />, run: go(`/projects/${p.id}`) })),
    ];
    return list;
  }, [can, me, nav, projects, shell, switchCompany]);

  // Tasks come from a server search on what the person types, so they are added as items that always pass the palette's own filter.
  const items = useMemo<(CommandItem & { run: () => void })[]>(() => {
    const visible = q.trim() ? cmds : cmds.filter((c) => c.group !== "Projects");
    const taskCmds: Cmd[] = tasks.map((tk) => ({ id: "t" + tk.id, group: "Tasks", label: tk.title, hint: tk.key, keywords: dq, icon: <StatusIcon status={tk.status} />, run: () => shell.openTask(tk.id) }));
    return [...taskCmds, ...visible].map((c) => ({ id: c.id, group: c.group, label: c.label, icon: c.icon, shortcut: c.hint, keywords: c.keywords ? [c.keywords] : undefined, run: c.run }));
  }, [cmds, q, dq, tasks, shell]);

  const run = (c: CommandItem) => { const item = items.find((i) => i.id === c.id); if (!item) return; onClose(); setTimeout(item.run, 0); };
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogStyles.overlay} />
        <Dialog.Content className={s.panel} aria-describedby={undefined} onInput={(e) => { const t = e.target as HTMLInputElement; if (t.getAttribute("role") === "combobox") setQ(t.value); }}>
          <Dialog.Title className={s.srOnly}>Command menu</Dialog.Title>
          <CommandPalette items={items} placeholder="Type a command or search tasks…" label="Command menu" autoFocus onSelect={run} onClose={onClose} />
          <div className={s.footer}><span className="row gap-4"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span><span className="row gap-4"><Kbd>↵</Kbd> open</span><span className="row gap-4"><Kbd>esc</Kbd> close</span><span style={{ marginLeft: "auto" }} className="row gap-4"><ProjectDot color="var(--accent)" />{me?.company.name}</span></div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
