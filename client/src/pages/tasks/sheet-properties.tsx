import { useEffect, useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { Combobox, DatePicker, Input, Popover, Select, Switch } from "@/components/arc";
import { ProjectDot } from "@/components/app/icons";
import { AssigneePicker, PriorityPicker, StatusPicker } from "@/components/app/properties";
import { fmtDate } from "@/lib/format";
import type { Options } from "@/lib/types";
import { RECURRENCE, type TaskDetail } from "./lib";
import s from "./task-sheet.module.css";

export function PropRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="prop-row"><span className="prop-label">{label}</span><div>{children}</div></div>;
}

/** Text/number input that saves on blur or Enter, like Linear's inline fields. */
export function InlineInput({ value, onSave, placeholder, disabled, type = "text", suffix }: { value: string; onSave: (v: string) => void; placeholder?: string; disabled?: boolean; type?: string; suffix?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  if (disabled) return <span className={value ? "" : "faint"} style={{ padding: "0 5px" }}>{value ? `${value}${suffix ?? ""}` : "—"}</span>;
  return (
    <input
      className={s.inlineInput} value={v} placeholder={placeholder} type={type} inputMode={type === "number" ? "decimal" : undefined}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== value) onSave(v); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setV(value); } }}
    />
  );
}

function TagEditor({ tags, all, onChange, disabled }: { tags: string[]; all: string[]; onChange: (t: string[]) => void; disabled: boolean }) {
  const [draft, setDraft] = useState("");
  const options = [...new Set([...all, ...tags])].sort();
  const shown = options.filter((t) => t.toLowerCase().includes(draft.trim().toLowerCase()));
  const exact = options.some((t) => t.toLowerCase() === draft.trim().toLowerCase());
  const toggle = (t: string) => onChange(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]);
  return (
    <>
      {tags.map((t) => (
        <span key={t} className={s.tagPill}>{t}{!disabled && <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}><X size={11} /></button>}</span>
      ))}
      {!tags.length && disabled && <span className="faint" style={{ padding: "0 5px" }}>None</span>}
      {!disabled && (
        <Popover padded={false} onOpenChange={(o) => !o && setDraft("")} trigger={<button type="button" className="prop-chip faint" aria-label="Edit tags"><Plus size={12} />{tags.length ? "" : "Add tag"}</button>}>
          <div style={{ width: 220 }}>
            <div style={{ padding: 6, borderBottom: "1px solid var(--border)" }}>
              <Input size="sm" autoFocus value={draft} maxLength={40} placeholder="Find or create tag…" onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const t = draft.trim(); if (t) { if (!tags.includes(t)) onChange([...tags, exact ? options.find((o) => o.toLowerCase() === t.toLowerCase())! : t]); setDraft(""); } } }} />
            </div>
            <div style={{ maxHeight: 220, overflow: "auto", padding: 4 }}>
              {shown.map((t) => (
                <label key={t} className="row prop-chip" style={{ width: "100%", height: 28 }}>
                  <input type="checkbox" checked={tags.includes(t)} onChange={() => toggle(t)} />{t}
                </label>
              ))}
              {draft.trim() && !exact && <button type="button" className="prop-chip" style={{ width: "100%", height: 28 }} onClick={() => { onChange([...tags, draft.trim()]); setDraft(""); }}><Plus size={12} />Create “{draft.trim()}”</button>}
              {!shown.length && !draft.trim() && <div className="small faint" style={{ padding: 8 }}>Type to create a tag</div>}
            </div>
          </div>
        </Popover>
      )}
    </>
  );
}

/** Right-hand property panel. Employees may change status/priority/tags/custom fields on their own tasks; managers everything. */
export function SheetProperties({ task, options, onPatch }: { task: TaskDetail; options?: Options; onPatch: (body: Record<string, unknown>) => void }) {
  const own = task.canEdit;
  const mgr = task.canManage;
  const projects = options?.projects ?? [];
  const users = options?.users ?? [];
  const project = projects.find((p) => p.id === task.projectId);
  const parent = project?.parentId ? projects.find((p) => p.id === project.parentId) : undefined;
  const milestones = [...(project?.milestones ?? []), ...(parent?.milestones ?? [])];
  const projName = (id: number) => { const p = projects.find((x) => x.id === id); const par = p?.parentId ? projects.find((x) => x.id === p.parentId) : undefined; return p ? (par ? `${par.name} › ${p.name}` : p.name) : ""; };
  const cf = task.customFields ?? {};

  return (
    <div className={s.props}>
      <PropRow label="Status"><StatusPicker value={task.status} withLabel disabled={!own} onChange={(v) => onPatch({ status: v })} /></PropRow>
      <PropRow label="Priority"><PriorityPicker value={task.priority} withLabel disabled={!own} onChange={(v) => onPatch({ priority: v })} /></PropRow>
      <PropRow label="Assignee"><AssigneePicker value={task.assignee?.id ?? null} users={users} withLabel disabled={!mgr} onChange={(v) => onPatch({ assigneeId: v })} /></PropRow>
      <PropRow label="Project">
        {mgr ? (
          <Combobox
            value={task.projectId} width={280} searchPlaceholder="Move to project…"
            options={projects.map((p) => ({ value: p.id, label: projName(p.id), icon: <ProjectDot color={p.color} /> }))}
            onChange={(v) => v && Number(v) !== task.projectId && onPatch({ projectId: Number(v), milestoneId: null })}
            trigger={<button type="button" className="prop-chip"><ProjectDot color={task.project?.parent?.color ?? task.project?.color} /><span className="ellipsis">{task.project?.name}</span></button>}
          />
        ) : <span className="row gap-4" style={{ padding: "0 5px" }}><ProjectDot color={task.project?.parent?.color ?? task.project?.color} /><span className="ellipsis">{task.project?.name}</span></span>}
      </PropRow>
      {task.project?.parent && <PropRow label="Parent project"><span className="ellipsis muted" style={{ padding: "0 5px" }}>{task.project.parent.name}</span></PropRow>}
      <PropRow label="Milestone">
        {mgr && milestones.length ? (
          <Combobox
            value={task.milestone?.id ?? null} clearable clearLabel="No milestone" width={260} searchPlaceholder="Milestone…"
            options={milestones.map((m) => ({ value: m.id, label: m.name, hint: fmtDate(m.date) }))}
            onChange={(v) => onPatch({ milestoneId: v ? Number(v) : null })}
            trigger={<button type="button" className={`prop-chip ${task.milestone ? "" : "faint"}`}>{task.milestone?.name ?? "Add milestone"}</button>}
          />
        ) : <span className={task.milestone ? "" : "faint"} style={{ padding: "0 5px" }}>{task.milestone?.name ?? "None"}</span>}
      </PropRow>
      <PropRow label="Start date"><DatePicker appearance="chip" size="sm" value={task.startDate ?? null} disabled={!mgr} placeholder="Set start" onChange={(v) => onPatch({ startDate: v })} /></PropRow>
      <PropRow label="Due date"><DatePicker appearance="chip" size="sm" value={task.dueDate ?? null} disabled={!mgr} placeholder="Set due date" highlightOverdue={task.status !== "DONE"} onChange={(v) => onPatch({ dueDate: v })} /></PropRow>
      <PropRow label="Estimate">
        <InlineInput
          value={task.estimateHours != null ? String(task.estimateHours) : ""} placeholder="Hours" disabled={!mgr} type="number" suffix="h"
          onSave={(v) => onPatch({ estimateHours: v.trim() === "" ? null : Number(v) })}
        />
      </PropRow>
      <PropRow label="Billable"><Switch checked={task.billable} disabled={!mgr} onChange={(v) => onPatch({ billable: v })} aria-label="Billable" /></PropRow>
      <PropRow label="Repeats">
        {mgr ? (
          <Select size="sm" fullWidth={false} value={task.recurrence ?? ""} onChange={(v) => onPatch({ recurrence: v || null })} options={[{ value: "", label: "Doesn't repeat" }, ...RECURRENCE]} aria-label="Recurrence" />
        ) : <span className={task.recurrence ? "" : "faint"} style={{ padding: "0 5px" }}>{RECURRENCE.find((r) => r.value === task.recurrence)?.label ?? "Doesn't repeat"}</span>}
      </PropRow>
      <PropRow label="Tags"><TagEditor tags={task.tags} all={options?.tags ?? []} disabled={!own} onChange={(t) => onPatch({ tags: t })} /></PropRow>
      {(options?.customFields ?? []).map((f) => {
        const val = cf[f.name];
        const save = (v: unknown) => onPatch({ customFields: { ...cf, [f.name]: v } });
        let control: ReactNode;
        if (f.type === "SELECT") {
          control = own ? (
            <Combobox value={val == null ? null : String(val)} clearable clearLabel="None" width={220} options={f.options.map((o) => ({ value: o, label: o }))} onChange={(v) => save(v)}
              trigger={<button type="button" className={`prop-chip ${val ? "" : "faint"}`}>{val ? String(val) : "Set"}</button>} />
          ) : <span className={val ? "" : "faint"} style={{ padding: "0 5px" }}>{val ? String(val) : "None"}</span>;
        } else if (f.type === "DATE") {
          control = <DatePicker appearance="chip" size="sm" value={val ? String(val) : null} disabled={!own} placeholder="Set date" onChange={(v) => save(v)} />;
        } else {
          control = <InlineInput value={val == null ? "" : String(val)} disabled={!own} type={f.type === "NUMBER" ? "number" : "text"} placeholder="Empty" onSave={(v) => save(f.type === "NUMBER" ? (v === "" ? null : Number(v)) : v || null)} />;
        }
        return <PropRow key={f.id} label={f.name}>{control}</PropRow>;
      })}
    </div>
  );
}
