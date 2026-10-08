import { useEffect, useRef, useState } from "react";
import { Clock, FileStack, FolderKanban, Milestone, X } from "lucide-react";
import { Button, Combobox, Dialog, DatePicker, Input, Menu, Popover, Switch, Textarea, toast } from "@/components/arc";
import { ProjectDot } from "@/components/app/icons";
import { AssigneePicker, PriorityPicker, StatusPicker } from "@/components/app/properties";
import type { NewTaskDefaults } from "@/components/app/shell-context";
import { post } from "@/lib/api";
import { invalidate } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import type { Priority, TaskStatus } from "@/lib/types";
import { useOptions } from "./lib";
import s from "./new-task.module.css";
import "./layer-fix.css";

type Draft = {
  title: string; description: string; projectId: number | null; status: TaskStatus; priority: Priority; assigneeId: number | null;
  dueDate: string | null; milestoneId: number | null; estimateHours: string; templateId: number | null;
};

/** Linear-style compact composer for a new task (or one built from a task template). */
export default function NewTaskDialog({ defaults, onClose, onCreated }: { defaults?: NewTaskDefaults; onClose: () => void; onCreated?: (t: { id: number }) => void }) {
  const { me, can } = useMe();
  const canManage = can("tasks", "manage");
  const opts = useOptions();
  const initial = (): Draft => ({
    title: "", description: "", projectId: defaults?.projectId ?? null, status: (defaults?.status as TaskStatus) ?? "TODO", priority: "NONE",
    assigneeId: defaults?.assigneeId !== undefined ? defaults.assigneeId : canManage ? null : me.user.id,
    dueDate: defaults?.dueDate ?? null, milestoneId: defaults?.milestoneId ?? null, estimateHours: "", templateId: null,
  });
  const [d, setD] = useState<Draft>(initial);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const projects = (opts.data?.projects ?? []).filter((p) => p.canLog || canManage);
  const nameOf = (id?: number | null) => projects.find((p) => p.id === id)?.name;
  const project = projects.find((p) => p.id === d.projectId);
  const parentProject = project?.parentId ? projects.find((p) => p.id === project.parentId) : undefined;
  const milestones = [...(project?.milestones ?? []), ...(parentProject?.milestones ?? [])];
  const templates = (opts.data?.templates ?? []).filter((t) => t.kind === "TASK");
  const template = templates.find((t) => t.id === d.templateId);

  // Pick the only project automatically for people who can only log on one.
  useEffect(() => { if (!d.projectId && projects.length === 1) set("projectId", projects[0].id); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projects.length]);

  const submit = async () => {
    setError(null);
    if (!d.projectId) { setError("Pick a project for this task"); return; }
    if (!template && !d.title.trim()) { setError("Give the task a name"); titleRef.current?.focus(); return; }
    const est = d.estimateHours.trim() ? Number(d.estimateHours) : null;
    if (est !== null && (Number.isNaN(est) || est < 0)) { setError("Estimate must be a number of hours"); return; }
    setBusy(true);
    try {
      const created = template
        ? await post<{ id: number }>("/tasks/from-template", { templateId: template.id, projectId: d.projectId, assigneeId: d.assigneeId, dueDate: d.dueDate })
        : await post<{ id: number; key: string }>("/tasks", {
          title: d.title.trim(), description: d.description.trim() || null, projectId: d.projectId, status: d.status, priority: d.priority,
          ...(canManage || d.assigneeId === me.user.id ? { assigneeId: d.assigneeId } : {}),
          dueDate: d.dueDate, milestoneId: d.milestoneId, estimateHours: est,
          ...(defaults?.parentId ? { parentId: defaults.parentId } : {}),
          ...(defaults?.section ? { section: defaults.section } : {}),
        });
      invalidate("/tasks");
      invalidate("/projects");
      invalidate("/options");
      onCreated?.(created);
      toast.success(template ? `Created from "${template.name}"` : `Created ${"key" in created ? created.key : "task"}`);
      if (more) {
        setD((x) => ({ ...x, title: "", description: "", templateId: null }));
        setTimeout(() => titleRef.current?.focus(), 0);
      } else onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the task");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open onClose={onClose} size="lg" onSubmit={submit}
      title={<span className="row gap-4 small muted"><FolderKanban size={13} />{nameOf(d.projectId) ?? "New task"}<span className="faint">›</span><span style={{ color: "var(--text)" }}>{defaults?.parentId ? "New sub-task" : "New task"}</span></span>}
      footer={
        <>
          {templates.length > 0 && (
            <Menu
              placement="top-start"
              trigger={<Button type="button" size="sm" variant="ghost" icon={<FileStack size={14} />}>{template ? template.name : "From template"}</Button>}
              items={[{ type: "heading", label: "Task templates" }, ...templates.map((t) => ({ label: t.name, checked: d.templateId === t.id, onSelect: () => set("templateId", t.id) })), ...(template ? [{ type: "separator" as const }, { label: "Blank task", onSelect: () => set("templateId", null) }] : [])]}
            />
          )}
          <span className="grow" />
          <Switch checked={more} onChange={setMore} label={<span className="small muted">Create more</span>} />
          <Button type="submit" variant="primary" loading={busy} shortcut="↵">{template ? "Create from template" : "Create task"}</Button>
        </>
      }
    >
      <div className={s.composer}>
        {template ? (
          <div className={s.templateNote}>
            <FileStack size={14} />
            <span className="grow">Creates <b>{template.name}</b> with its description, estimate and sub-tasks in the chosen project.</span>
            <button type="button" className={s.clear} aria-label="Use a blank task" onClick={() => set("templateId", null)}><X size={14} /></button>
          </div>
        ) : (
          <>
            <Input ref={titleRef} bare autoFocus className={s.title} placeholder="Task title" value={d.title} onChange={(e) => set("title", e.target.value)} aria-label="Task title" />
            <Textarea
              bare className={s.desc} placeholder="Add description…" value={d.description} rows={3} aria-label="Description"
              onChange={(e) => set("description", e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }}
            />
          </>
        )}
        <div className={s.chips}>
          <Combobox
            value={d.projectId} width={280} searchPlaceholder="Project…"
            options={projects.map((p) => ({ value: p.id, label: p.parentId ? `${nameOf(p.parentId) ?? ""} › ${p.name}` : p.name, icon: <ProjectDot color={p.color} /> }))}
            onChange={(v) => setD((x) => ({ ...x, projectId: v ? Number(v) : null, milestoneId: null }))}
            trigger={<button type="button" className={`${s.chip} ${!d.projectId ? s.required : ""}`}>{project ? <><ProjectDot color={project.color} />{project.name}</> : <><FolderKanban size={13} />Project</>}</button>}
          />
          {!template && <span className={s.chipWrap}><StatusPicker value={d.status} withLabel onChange={(v) => set("status", v)} /></span>}
          {!template && <span className={s.chipWrap}><PriorityPicker value={d.priority} withLabel onChange={(v) => set("priority", v)} /></span>}
          <span className={s.chipWrap}><AssigneePicker value={d.assigneeId} users={opts.data?.users ?? []} withLabel disabled={!canManage} onChange={(v) => set("assigneeId", v)} /></span>
          <span className={s.chipWrap}><DatePicker appearance="chip" size="sm" value={d.dueDate} onChange={(v) => set("dueDate", v)} placeholder="Due date" /></span>
          {!template && milestones.length > 0 && (
            <Combobox
              value={d.milestoneId} clearable clearLabel="No milestone" width={260} searchPlaceholder="Milestone…"
              options={milestones.map((m) => ({ value: m.id, label: m.name, hint: m.date }))}
              onChange={(v) => set("milestoneId", v ? Number(v) : null)}
              trigger={<button type="button" className={s.chip}><Milestone size={13} />{milestones.find((m) => m.id === d.milestoneId)?.name ?? "Milestone"}</button>}
            />
          )}
          {!template && (
            <Popover trigger={<button type="button" className={s.chip}><Clock size={13} />{d.estimateHours ? `${d.estimateHours}h estimate` : "Estimate"}</button>}>
              {(close) => (
                <div className="col" style={{ width: 180 }}>
                  <span className="small muted">Estimate (hours)</span>
                  <Input size="sm" autoFocus inputMode="decimal" value={d.estimateHours} onChange={(e) => set("estimateHours", e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); close(); } }} placeholder="e.g. 4" />
                </div>
              )}
            </Popover>
          )}
        </div>
        {error && <div className="field-error" role="alert">{error}</div>}
      </div>
    </Dialog>
  );
}
