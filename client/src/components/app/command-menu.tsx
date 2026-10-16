import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Moon, Plus, Timer, Clock, Building, FolderKanban } from "lucide-react";
import { Kbd, toast } from "@/components/arc";
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
  const [hi, setHi] = useState(0);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<{ id: number; name: string; color: string; parentId?: number | null }[]>([]);
  const dq = useDebounced(q, 150);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) { setQ(""); setHi(0); get<{ projects: typeof projects }>("/options").then((o) => setProjects(o.projects.filter((p) => !p.parentId))).catch(() => {}); } }, [open]);
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

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const base = t ? cmds.filter((c) => `${c.label} ${c.keywords ?? ""} ${c.group}`.toLowerCase().includes(t)) : cmds.filter((c) => c.group !== "Projects");
    const taskCmds: Cmd[] = tasks.map((tk) => ({ id: "t" + tk.id, group: "Tasks", label: tk.title, hint: tk.key, icon: <StatusIcon status={tk.status} />, run: () => shell.openTask(tk.id) }));
    return [...taskCmds, ...base].slice(0, 60);
  }, [cmds, q, tasks, shell]);

  useEffect(() => { setHi(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" }); }, [hi]);

  const run = (c?: Cmd) => { if (!c) return; onClose(); setTimeout(c.run, 0); };
  let last = "";
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className={s.overlay} data-layer={9999} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div className={s.panel} role="dialog" aria-label="Command menu" initial={{ scale: 0.98, y: -6 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.98, opacity: 0 }} transition={{ duration: 0.14 }}>
            <input
              autoFocus className={s.input} placeholder="Type a command or search tasks…" value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(filtered.length - 1, h + 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
                else if (e.key === "Enter") { e.preventDefault(); run(filtered[hi]); }
                else if (e.key === "Escape") { e.preventDefault(); onClose(); }
              }}
            />
            <div className={s.list} ref={listRef} role="listbox">
              {filtered.map((c, i) => {
                const header = c.group !== last ? <div className={s.group}>{c.group}</div> : null;
                last = c.group;
                return (
                  <div key={c.id}>
                    {header}
                    <div data-i={i} role="option" aria-selected={i === hi} className={`${s.item} ${i === hi ? s.hi : ""}`} onMouseMove={() => setHi(i)} onClick={() => run(c)}>
                      {c.icon}<span className="ellipsis">{c.label}</span>{c.hint && <span className={s.hint}>{c.hint}</span>}
                    </div>
                  </div>
                );
              })}
              {!filtered.length && <div className="faint center" style={{ padding: 24 }}>No results for “{q}”</div>}
            </div>
            <div className={s.footer}><span className="row gap-4"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span><span className="row gap-4"><Kbd>↵</Kbd> open</span><span className="row gap-4"><Kbd>esc</Kbd> close</span><span style={{ marginLeft: "auto" }} className="row gap-4"><ProjectDot color="var(--accent)" />{me?.company.name}</span></div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
