import { useEffect, useRef, useState, type ReactElement } from "react";
import { useApp } from "../state";
import { Icon } from "./Icons";
import type { Pick } from "./ProjectPicker";

// Toggl-style project popover: search across projects, sub-projects and their open tasks.
export function ProjectMenu({ value, onChange }: { value: Pick; onChange: (v: Pick) => void }) {
  const { options } = useApp();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const projects = options?.projects ?? [];
  const byId = new Map(projects.map((p) => [p.id, p]));
  const names = new Map((options?.allProjects ?? []).map((p) => [p.id, p.name]));
  const tops = projects.filter((p) => !p.parentId || !byId.has(p.parentId));
  const cur = value.projectId ? byId.get(value.projectId) : undefined;
  const parent = cur?.parentId ? byId.get(cur.parentId) : undefined;
  const task = cur?.tasks.find((t) => t.id === value.taskId);
  const color = (parent ?? cur)?.color;
  const label = cur ? [parent?.name, cur.name, task?.title].filter(Boolean).join(" › ") : "Project";
  const match = (s: string) => !q || s.toLowerCase().includes(q.toLowerCase());
  const pick = (v: Pick) => { onChange(v); setOpen(false); setQ(""); };

  return (
    <div className="popover-wrap" ref={ref}>
      <button type="button" className={`tool-btn ${cur ? "on" : ""}`} onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open} title={label}>
        {cur ? <span className="dot" style={{ background: color, margin: 0 }} /> : <Icon name="folder" />}
        <span className={cur ? "label" : ""}>{cur ? label : "Project"}</span>
      </button>
      {open && (
        <div className="popover" role="listbox">
          <input autoFocus type="search" placeholder="Find project, sub-project or task…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 0 }} />
          {value.projectId && <button className="menu-item" onClick={() => pick({ projectId: null, taskId: null })}><span className="muted">No project</span></button>}
          <div className="group-label">Projects</div>
          {tops.map((p) => {
            const subs = projects.filter((s) => s.parentId === p.id);
            const items: ReactElement[] = [];
            const pTop = p.parentId ? `${names.get(p.parentId) ?? ""} › ${p.name}` : p.name;
            const anyMatch = match(pTop) || subs.some((s) => match(s.name) || s.tasks.some((t) => match(t.title))) || p.tasks.some((t) => match(t.title));
            if (!anyMatch) return null;
            items.push(<button key={p.id} className={`menu-item ${value.projectId === p.id && !value.taskId ? "active" : ""}`} onClick={() => pick({ projectId: p.id, taskId: null })}><span className="dot" style={{ background: p.color, margin: 0 }} /><strong>{pTop}</strong></button>);
            for (const t of p.tasks) if (q && match(t.title)) items.push(<button key={`t${t.id}`} className="menu-item l3" onClick={() => pick({ projectId: p.id, taskId: t.id })}>{t.title}</button>);
            for (const s of subs) {
              if (q && !match(s.name) && !match(pTop) && !s.tasks.some((t) => match(t.title))) continue;
              items.push(<button key={s.id} className={`menu-item l2 ${value.projectId === s.id && !value.taskId ? "active" : ""}`} onClick={() => pick({ projectId: s.id, taskId: null })}>{s.name}</button>);
              for (const t of s.tasks) if (!q || match(t.title) || match(s.name)) items.push(<button key={`t${t.id}`} className={`menu-item l3 ${value.taskId === t.id ? "active" : ""}`} onClick={() => pick({ projectId: s.id, taskId: t.id })}>{t.title}</button>);
            }
            return items;
          })}
          {!tops.length && <p className="muted small" style={{ padding: 8 }}>You haven't been added to any projects yet.</p>}
        </div>
      )}
    </div>
  );
}
