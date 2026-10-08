import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { useApp } from "../state";
import { fmtDate, fmtH, HEALTH_LABEL, PROJECT_COLORS, STATUS_LABEL, TASK_LABEL } from "../lib";
import { Modal } from "../components/Modal";
import { Icon } from "../components/Icons";
import { initials } from "../App";

type Task = { id: number; title: string; status: string; estimatedHours: number | null; dueDate: string | null; assignee: { id: number; name: string } | null };
type Milestone = { id: number; name: string; dueDate: string; done: boolean };
type Project = {
  id: number; name: string; code: string | null; description: string | null; color: string; status: string; health: string;
  startDate: string | null; endDate: string | null; estimatedHours: number | null; clientId: number | null; parentId: number | null; managerId: number | null;
  client: { name: string } | null; manager: { name: string } | null; members: { id: number; name: string }[];
  milestones: Milestone[]; tasks: Task[]; trackedMinutes: number; totalMinutes?: number; children?: Project[];
};

const STATUS_TONE: Record<string, string> = { ACTIVE: "info", PLANNING: "", ON_HOLD: "warn", COMPLETED: "good", ARCHIVED: "" };
const HEALTH_ICON: Record<string, string> = { ON_TRACK: "●", AT_RISK: "▲", DELAYED: "■" };

function TimeStatus({ minutes, estimate, color }: { minutes: number; estimate: number | null; color: string }) {
  if (!estimate) return <span className="muted small">{fmtH(minutes, 0)} tracked</span>;
  const pct = (minutes / 60 / estimate) * 100;
  return (
    <div className="timebar" title={`${fmtH(minutes, 0)} of ${estimate}h budget`}>
      <div className="timebar-track"><div style={{ width: `${Math.min(100, pct)}%`, background: pct > 100 ? "var(--critical)" : color }} /></div>
      <small className="tnum">{Math.round(minutes / 60)} of {estimate} h {pct > 100 && <span className="text-critical">({Math.round(pct)}%)</span>}</small>
    </div>
  );
}

const taskProgress = (p: Project) => {
  const all = [...p.tasks, ...(p.children ?? []).flatMap((c) => c.tasks)];
  return all.length ? { done: all.filter((t) => t.status === "DONE").length, total: all.length } : null;
};

// Projects list (Toggl / Asana portfolio table) with sub-project rows and a detail drawer.
export function Projects() {
  const { perms, options, refreshOptions, toast } = useApp();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const [form, setForm] = useState<{ project?: Project; parentId?: number } | null>(null);
  const [members, setMembers] = useState<Project | null>(null);
  const [milestone, setMilestone] = useState<{ projectId: number; m?: Milestone } | null>(null);
  const [task, setTask] = useState<{ projectId: number; t?: Task } | null>(null);
  const [show, setShow] = useState<"active" | "all">("active");
  const [q, setQ] = useState("");
  const [clientId, setClientId] = useState("");
  const canManage = perms!.manageProjects === "yes";

  const load = () => api<Project[]>("/projects").then(setProjects);
  useEffect(() => { load(); }, []);
  const after = async (msg: string) => { toast(msg); await Promise.all([load(), refreshOptions()]); };
  const toggle = (id: number) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function setTaskStatus(t: Task, status: string) {
    try { await api(`/projects/tasks/${t.id}`, { method: "PUT", body: { status } }); await load(); } catch (e) { toast((e as Error).message, "error"); }
  }
  async function archive(p: Project) {
    if (!confirm(`Archive “${p.name}”? Projects with logged time are archived so reports stay intact; empty ones are deleted.`)) return;
    const r = await api<{ archived?: boolean }>(`/projects/${p.id}`, { method: "DELETE" });
    setSelected(null);
    after(r.archived ? "Project archived" : "Project deleted");
  }

  if (!projects) return <p className="muted">Loading…</p>;
  const flat = projects.flatMap((p) => [p, ...(p.children ?? [])]);
  const sel = selected ? flat.find((p) => p.id === selected) : undefined;
  const selParent = sel?.parentId ? projects.find((p) => p.id === sel.parentId) : undefined;
  const visible = projects.filter((p) => (show === "all" || p.status !== "ARCHIVED") && (!clientId || String(p.clientId) === clientId)
    && (!q || `${p.name} ${p.code ?? ""} ${p.client?.name ?? ""} ${(p.children ?? []).map((c) => c.name).join(" ")}`.toLowerCase().includes(q.toLowerCase())));

  const row = (p: Project, parent?: Project) => {
    const tp = parent ? (p.tasks.length ? { done: p.tasks.filter((t) => t.status === "DONE").length, total: p.tasks.length } : null) : taskProgress(p);
    const color = (parent ?? p).color;
    return (
      <tr key={p.id} className={`clickable ${parent ? "subrow" : ""}`} onClick={() => setSelected(p.id)}>
        <td>
          <div className="row tight">
            {!parent && (p.children?.length ? (
              <button className="icon-btn" onClick={(e) => { e.stopPropagation(); toggle(p.id); }} aria-expanded={expanded.has(p.id)} aria-label={`Show sub-projects of ${p.name}`}>
                <Icon name={expanded.has(p.id) ? "chevronDown" : "chevronRight"} />
              </button>
            ) : <span style={{ width: 30 }} />)}
            <span className="dot" style={{ background: color }} />
            <div><strong style={{ fontWeight: parent ? 500 : 600 }}>{p.name}</strong>{!parent && p.code && <span className="muted small"> · {p.code}</span>}
              {!parent && !!p.children?.length && <div className="muted small">{p.children.length} sub-project{p.children.length === 1 ? "" : "s"}</div>}</div>
          </div>
        </td>
        <td className="small">{parent ? "" : p.client?.name ?? <span className="muted">—</span>}</td>
        <td className="small nowrap">{p.startDate ? `${fmtDate(p.startDate)} – ${fmtDate(p.endDate)}` : <span className="muted">Not scheduled</span>}</td>
        <td><TimeStatus minutes={p.totalMinutes ?? p.trackedMinutes} estimate={p.estimatedHours} color={color} /></td>
        <td className="small tnum">{tp ? `${tp.done}/${tp.total}` : "—"}</td>
        <td><span className={`pill ${STATUS_TONE[p.status] ?? ""}`}>{STATUS_LABEL[p.status]}</span></td>
        <td>{!parent && <span className={`health-tag h-${p.health}`}><span aria-hidden>{HEALTH_ICON[p.health]}</span> {HEALTH_LABEL[p.health]}</span>}</td>
        <td>{!parent && p.manager && <span className="row tight small"><span className="avatar sm">{initials(p.manager.name)}</span>{p.manager.name.split(" ")[0]}</span>}</td>
      </tr>
    );
  };

  return (
    <>
      <header className="page-head">
        <div><h1>Projects</h1><p>{canManage ? "Projects, their sub-projects, budgets and progress." : "Projects you can log time against."}</p></div>
        {canManage && <button className="btn primary" onClick={() => setForm({})}><Icon name="plus" /> New project</button>}
      </header>
      <div className="filters">
        <select className={`pill-select ${show === "all" ? "set" : ""}`} value={show} onChange={(e) => setShow(e.target.value as "active" | "all")} aria-label="Show">
          <option value="active">All, except archived</option><option value="all">Including archived</option>
        </select>
        <select className={`pill-select ${clientId ? "set" : ""}`} value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Client">
          <option value="">Any client</option>{options?.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="search" placeholder="Search projects…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search projects" style={{ minWidth: 220, height: 32, minHeight: 32, borderRadius: 99 }} />
      </div>
      <div className="card flush table-wrap">
        <table>
          <thead><tr><th>Project</th><th>Client</th><th>Timeframe</th><th>Time status</th><th>Tasks</th><th>Status</th><th>Health</th><th>PM</th></tr></thead>
          <tbody>
            {visible.flatMap((p) => [row(p), ...(expanded.has(p.id) ? (p.children ?? []).filter((c) => show === "all" || c.status !== "ARCHIVED").map((c) => row(c, p)) : [])])}
            {!visible.length && <tr><td colSpan={8} className="empty">No projects match.</td></tr>}
          </tbody>
        </table>
      </div>

      {sel && (
        <>
          <div className="drawer-backdrop" onClick={() => setSelected(null)} />
          <aside className="drawer" role="dialog" aria-label={sel.name}>
            <header>
              <div className="crumbs">{selParent ? <><button className="link" onClick={() => setSelected(selParent.id)}>{selParent.name}</button> › Sub-project</> : sel.client?.name ?? "Project"}</div>
              <div className="row">
                <span className="dot" style={{ background: (selParent ?? sel).color, width: 12, height: 12 }} />
                <h1 className="grow" style={{ fontSize: 20 }}>{sel.name}</h1>
                {canManage && <button className="icon-btn" onClick={() => setForm({ project: sel })} aria-label="Edit" title="Edit"><Icon name="edit" /></button>}
                {canManage && <button className="icon-btn" onClick={() => archive(sel)} aria-label="Archive" title="Archive"><Icon name="trash" /></button>}
                <button className="icon-btn" onClick={() => setSelected(null)} aria-label="Close"><Icon name="x" /></button>
              </div>
              {sel.description && <p className="muted" style={{ margin: "6px 0 0" }}>{sel.description}</p>}
            </header>
            <div className="drawer-body">
              <dl className="props" style={{ marginTop: 18 }}>
                <dt>Status</dt><dd><span className={`pill ${STATUS_TONE[sel.status] ?? ""}`}>{STATUS_LABEL[sel.status]}</span> <span className={`health-tag h-${sel.health}`} style={{ marginLeft: 8 }}>{HEALTH_ICON[sel.health]} {HEALTH_LABEL[sel.health]}</span></dd>
                <dt>Timeframe</dt><dd>{fmtDate(sel.startDate)} – {fmtDate(sel.endDate)}</dd>
                <dt>Time status</dt><dd><TimeStatus minutes={sel.totalMinutes ?? sel.trackedMinutes} estimate={sel.estimatedHours} color={(selParent ?? sel).color} /></dd>
                <dt>Project manager</dt><dd>{sel.manager?.name ?? "—"}</dd>
                {!selParent && <><dt>Members</dt><dd className="row tight">{sel.members.length ? <span className="avatars">{sel.members.slice(0, 8).map((m) => <span key={m.id} className="avatar sm" title={m.name}>{initials(m.name)}</span>)}</span> : <span className="muted">None</span>}
                  {canManage && <button className="link small" onClick={() => setMembers(sel)} style={{ marginLeft: 8 }}>Manage</button>}</dd></>}
              </dl>

              {!selParent && (
                <section style={{ marginBottom: 22 }}>
                  <div className="row between"><h4>Sub-projects</h4>{canManage && <button className="link small" onClick={() => setForm({ parentId: sel.id })}>+ Sub-project</button>}</div>
                  <ul className="mini-list">
                    {(sel.children ?? []).map((c) => (
                      <li key={c.id} style={{ cursor: "pointer" }} onClick={() => setSelected(c.id)}>
                        <span className="grow">{c.name}</span>
                        <TimeStatus minutes={c.trackedMinutes} estimate={c.estimatedHours} color={sel.color} />
                        <Icon name="chevronRight" />
                      </li>
                    ))}
                    {!sel.children?.length && <li className="muted">No sub-projects</li>}
                  </ul>
                </section>
              )}

              <section style={{ marginBottom: 22 }}>
                <div className="row between"><h4>Tasks</h4>{canManage && <button className="link small" onClick={() => setTask({ projectId: sel.id })}>+ Task</button>}</div>
                <ul className="mini-list">
                  {sel.tasks.map((t) => (
                    <li key={t.id}>
                      <select className={`status-select s-${t.status}`} value={t.status} onChange={(e) => setTaskStatus(t, e.target.value)} aria-label={`Status of ${t.title}`}>
                        {Object.entries(TASK_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <span className="grow">{t.title}</span>
                      <small className="muted nowrap">{t.assignee?.name ?? "Unassigned"}{t.dueDate ? ` · ${fmtDate(t.dueDate)}` : ""}</small>
                      {canManage && <button className="icon-btn" onClick={() => setTask({ projectId: sel.id, t })} aria-label="Edit task"><Icon name="edit" /></button>}
                    </li>
                  ))}
                  {!sel.tasks.length && <li className="muted">No tasks{!selParent && sel.children?.length ? " on the main project. Open a sub-project to see its tasks." : ""}</li>}
                </ul>
              </section>

              <section>
                <div className="row between"><h4>Milestones</h4>{canManage && <button className="link small" onClick={() => setMilestone({ projectId: sel.id })}>+ Milestone</button>}</div>
                <ul className="mini-list">
                  {sel.milestones.map((m) => (
                    <li key={m.id}>
                      <span aria-hidden>{m.done ? "◆" : "◇"}</span>
                      <span className={`grow ${m.done ? "done" : ""}`}>{m.name}</span>
                      <small className="muted">{fmtDate(m.dueDate)}</small>
                      {canManage && <button className="icon-btn" onClick={() => setMilestone({ projectId: sel.id, m })} aria-label="Edit milestone"><Icon name="edit" /></button>}
                    </li>
                  ))}
                  {!sel.milestones.length && <li className="muted">No milestones</li>}
                </ul>
              </section>
            </div>
          </aside>
        </>
      )}

      {form && <ProjectForm {...form} parents={projects} onClose={() => setForm(null)} onSaved={() => { setForm(null); after("Project saved"); }} />}
      {members && (
        <Modal title={`Members · ${members.name}`} onClose={() => setMembers(null)}>
          <MembersForm project={members} users={options?.users ?? []} onSaved={() => { setMembers(null); after("Members updated"); }} />
        </Modal>
      )}
      {milestone && <MilestoneForm {...milestone} onClose={() => setMilestone(null)} onSaved={() => { setMilestone(null); after("Milestone saved"); }} />}
      {task && <TaskForm {...task} users={options?.users ?? []} onClose={() => setTask(null)} onSaved={() => { setTask(null); after("Task saved"); }} />}
    </>
  );
}

function ProjectForm({ project, parentId, parents, onClose, onSaved }: { project?: Project; parentId?: number; parents: Project[]; onClose: () => void; onSaved: () => void }) {
  const { options, toast } = useApp();
  const parent = parents.find((p) => p.id === (project?.parentId ?? parentId));
  const [d, setD] = useState({
    name: project?.name ?? "", code: project?.code ?? "", description: project?.description ?? "",
    color: project?.color ?? parent?.color ?? PROJECT_COLORS[parents.length % PROJECT_COLORS.length],
    status: project?.status ?? "ACTIVE", health: project?.health ?? "ON_TRACK",
    startDate: project?.startDate?.slice(0, 10) ?? "", endDate: project?.endDate?.slice(0, 10) ?? "",
    estimatedHours: project?.estimatedHours?.toString() ?? "", clientId: project?.clientId ?? parent?.clientId ?? null, managerId: project?.managerId ?? parent?.managerId ?? null,
  });
  const [newClient, setNewClient] = useState("");
  const set = (k: string, v: unknown) => setD((x) => ({ ...x, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (d.startDate && d.endDate && d.endDate < d.startDate) return toast("End date must be after start date", "error");
    try {
      let clientId = d.clientId;
      if (newClient.trim()) clientId = (await api<{ id: number }>("/people/clients", { body: { name: newClient.trim() } })).id;
      const body = { ...d, clientId, code: d.code || null, startDate: d.startDate || null, endDate: d.endDate || null, estimatedHours: d.estimatedHours ? Number(d.estimatedHours) : null, parentId: project ? undefined : parentId ?? null };
      await api(project ? `/projects/${project.id}` : "/projects", { method: project ? "PUT" : "POST", body });
      onSaved();
    } catch (err) { toast((err as Error).message, "error"); }
  }

  const title = project ? `Edit ${project.parentId ? "sub-project" : "project"}` : parent ? `New sub-project in ${parent.name}` : "New project";
  return (
    <Modal title={title} onClose={onClose} wide>
      <form onSubmit={submit} className="form-grid">
        <label className="field span2"><span>Name</span><input required value={d.name} onChange={(e) => set("name", e.target.value)} /></label>
        <label className="field"><span>Code</span><input value={d.code} maxLength={20} onChange={(e) => set("code", e.target.value)} /></label>
        <label className="field span3"><span>Description</span><textarea rows={2} value={d.description} onChange={(e) => set("description", e.target.value)} /></label>
        {!parent && (
          <label className="field"><span>Client</span>
            <select value={d.clientId ?? ""} onChange={(e) => set("clientId", e.target.value ? Number(e.target.value) : null)}>
              <option value="">No client</option>
              {options?.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
        {!parent && <label className="field"><span>…or new client</span><input value={newClient} onChange={(e) => setNewClient(e.target.value)} placeholder="Client name" /></label>}
        <label className="field"><span>Project manager</span>
          <select value={d.managerId ?? ""} onChange={(e) => set("managerId", e.target.value ? Number(e.target.value) : null)}>
            <option value="">None</option>
            {options?.users.filter((u) => u.role !== "EMPLOYEE").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Start date</span><input type="date" value={d.startDate} onChange={(e) => set("startDate", e.target.value)} /></label>
        <label className="field"><span>End date</span><input type="date" value={d.endDate} onChange={(e) => set("endDate", e.target.value)} /></label>
        <label className="field"><span>Estimated hours</span><input type="number" min={0} value={d.estimatedHours} onChange={(e) => set("estimatedHours", e.target.value)} /></label>
        <label className="field"><span>Status</span>
          <select value={d.status} onChange={(e) => set("status", e.target.value)}>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label className="field"><span>Health</span>
          <select value={d.health} onChange={(e) => set("health", e.target.value)}>{Object.entries(HEALTH_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        {!parent && (
          <div className="field"><span>Colour</span>
            <div className="swatches">{PROJECT_COLORS.map((c) => <button type="button" key={c} className={`swatch ${d.color === c ? "on" : ""}`} style={{ background: c }} onClick={() => set("color", c)} aria-label={`Colour ${c}`} />)}</div>
          </div>
        )}
        <div className="row end span3"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary">Save</button></div>
      </form>
    </Modal>
  );
}

function MembersForm({ project, users, onSaved }: { project: Project; users: { id: number; name: string; role: string }[]; onSaved: () => void }) {
  const { toast } = useApp();
  const [sel, setSel] = useState(new Set(project.members.map((m) => m.id)));
  return (
    <>
      <p className="muted">Members can log time on this project and all its sub-projects. People with “all projects” access don't need to be added.</p>
      <div className="checklist">
        {users.map((u) => (
          <label key={u.id} className="check"><input type="checkbox" checked={sel.has(u.id)} onChange={(e) => setSel((s) => { const n = new Set(s); e.target.checked ? n.add(u.id) : n.delete(u.id); return n; })} /> {u.name}</label>
        ))}
      </div>
      <div className="row end"><button className="btn primary" onClick={async () => { try { await api(`/projects/${project.id}/members`, { method: "PUT", body: { userIds: [...sel] } }); onSaved(); } catch (e) { toast((e as Error).message, "error"); } }}>Save members</button></div>
    </>
  );
}

function MilestoneForm({ projectId, m, onClose, onSaved }: { projectId: number; m?: Milestone; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [name, setName] = useState(m?.name ?? "");
  const [dueDate, setDue] = useState(m?.dueDate.slice(0, 10) ?? "");
  const [done, setDone] = useState(m?.done ?? false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try { await api(m ? `/projects/milestones/${m.id}` : `/projects/${projectId}/milestones`, { method: m ? "PUT" : "POST", body: { name, dueDate, done } }); onSaved(); } catch (err) { toast((err as Error).message, "error"); }
  };
  const del = async () => { if (m && confirm("Delete this milestone?")) { await api(`/projects/milestones/${m.id}`, { method: "DELETE" }); onSaved(); } };
  return (
    <Modal title={m ? "Edit milestone" : "New milestone"} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <label className="field full"><span>Name</span><input required value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span>Due date</span><input type="date" required value={dueDate} onChange={(e) => setDue(e.target.value)} /></label>
        <label className="check"><input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} /> Reached</label>
        <div className="row between">{m ? <button type="button" className="btn danger ghost" onClick={del}>Delete</button> : <span />}<button className="btn primary">Save</button></div>
      </form>
    </Modal>
  );
}

function TaskForm({ projectId, t, users, onClose, onSaved }: { projectId: number; t?: Task; users: { id: number; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [d, setD] = useState({ title: t?.title ?? "", status: t?.status ?? "TODO", assigneeId: t?.assignee?.id ?? null as number | null, dueDate: t?.dueDate?.slice(0, 10) ?? "", estimatedHours: t?.estimatedHours?.toString() ?? "" });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = { ...d, dueDate: d.dueDate || null, estimatedHours: d.estimatedHours ? Number(d.estimatedHours) : null };
    try { await api(t ? `/projects/tasks/${t.id}` : `/projects/${projectId}/tasks`, { method: t ? "PUT" : "POST", body }); onSaved(); } catch (err) { toast((err as Error).message, "error"); }
  };
  const del = async () => { if (t && confirm("Delete this task? Logged time stays but loses the task link.")) { await api(`/projects/tasks/${t.id}`, { method: "DELETE" }); onSaved(); } };
  return (
    <Modal title={t ? "Edit task" : "New task"} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <label className="field full"><span>Title</span><input required value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></label>
        <div className="row wrap">
          <label className="field"><span>Assignee</span>
            <select value={d.assigneeId ?? ""} onChange={(e) => setD({ ...d, assigneeId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Unassigned</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
          <label className="field"><span>Status</span><select value={d.status} onChange={(e) => setD({ ...d, status: e.target.value })}>{Object.entries(TASK_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="field"><span>Due</span><input type="date" value={d.dueDate} onChange={(e) => setD({ ...d, dueDate: e.target.value })} /></label>
          <label className="field"><span>Estimate (h)</span><input type="number" min={0} style={{ width: 90 }} value={d.estimatedHours} onChange={(e) => setD({ ...d, estimatedHours: e.target.value })} /></label>
        </div>
        <div className="row between">{t ? <button type="button" className="btn danger ghost" onClick={del}>Delete</button> : <span />}<button className="btn primary">Save</button></div>
      </form>
    </Modal>
  );
}
