import { useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge, Button, ConfirmDialog, DatePicker, ErrorState, Field, IconButton, Input, Select, SkeletonRows, toast } from "@/components/ui";
import { del, post } from "@/lib/api";
import { invalidate, useApi } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import { dayName, fmtDate, relTime, titleCase, today } from "@/lib/format";
import s from "./settings.module.css";

type Holiday = { id: number; date: string; name: string };
type CustomField = { id: number; name: string; type: string; options: string[] };
type Template = { id: number; kind: string; name: string; createdAt: string };

function useDelete(path: string, prefix: string, label: string) {
  const [target, setTarget] = useState<{ id: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await del(`${path}/${target.id}`);
      toast.success(`Deleted ${target.name}`);
      setTarget(null);
      invalidate(prefix);
      invalidate("/options");
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const dialog = <ConfirmDialog open={!!target} onClose={() => setTarget(null)} onConfirm={run} loading={busy} danger confirmLabel="Delete" title={`Delete ${label} "${target?.name}"?`} />;
  return { ask: setTarget, dialog };
}

export function Holidays() {
  const { data, error, loading, reload } = useApi<Holiday[]>("/settings/holidays");
  const [date, setDate] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const d = useDelete("/settings/holidays", "/settings/holidays", "holiday");
  const [past, setPast] = useState(false);

  const add = async () => {
    if (!date || !name.trim()) { toast.error("Pick a date and name the holiday"); return; }
    setBusy(true);
    try {
      await post("/settings/holidays", { date, name: name.trim() });
      toast.success(`Added ${name.trim()}`);
      setName(""); setDate(null);
      invalidate("/settings/holidays");
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  const rows = (data ?? []).filter((h) => past || h.date >= today());
  return (
    <Section title="Holidays" desc="Company holidays are excluded from capacity and shown on calendars and timesheets."
      actions={<Button size="sm" variant="ghost" onClick={() => setPast(!past)}>{past ? "Hide past" : "Show past"}</Button>}>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <SkeletonRows rows={4} /> : (
        <>
          {!rows.length && <div className={s.listRow}><span className="faint">No upcoming holidays.</span></div>}
          {rows.map((h) => (
            <div key={h.id} className={s.listRow}>
              <span className="num" style={{ width: 110 }}>{fmtDate(h.date, true)}</span>
              <span className="faint small" style={{ width: 40 }}>{dayName(h.date)}</span>
              <span className={`grow ${h.date < today() ? "faint" : ""}`}>{h.name}</span>
              <IconButton size="sm" label={`Delete ${h.name}`} icon={<Trash2 size={14} />} onClick={() => d.ask(h)} />
            </div>
          ))}
          <div className={s.addRow}>
            <Field label="Date"><DatePicker value={date} onChange={setDate} /></Field>
            <Field label="Name" className="grow"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diwali" onKeyDown={(e) => e.key === "Enter" && add()} /></Field>
            <Button variant="primary" icon={<Plus size={14} />} loading={busy} onClick={add}>Add</Button>
          </div>
        </>
      )}
      {d.dialog}
    </Section>
  );
}

export function CustomFields() {
  const { data, error, loading, reload } = useApi<CustomField[]>("/settings/custom-fields");
  const [f, setF] = useState({ name: "", type: "TEXT", options: "" });
  const [busy, setBusy] = useState(false);
  const d = useDelete("/settings/custom-fields", "/settings/custom-fields", "field");

  const add = async () => {
    if (!f.name.trim()) { toast.error("Name the field"); return; }
    setBusy(true);
    try {
      await post("/settings/custom-fields", { name: f.name.trim(), type: f.type, options: f.type === "SELECT" ? f.options.split(",").map((x) => x.trim()).filter(Boolean) : [] });
      toast.success(`Added ${f.name.trim()}`);
      setF({ name: "", type: "TEXT", options: "" });
      invalidate("/settings/custom-fields");
      invalidate("/options");
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  return (
    <Section title="Custom task fields" desc="Extra fields on every task in this company, shown in the task detail and list columns.">
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <SkeletonRows rows={3} /> : (
        <>
          {!data?.length && <div className={s.listRow}><span className="faint">No custom fields yet.</span></div>}
          {(data ?? []).map((c) => (
            <div key={c.id} className={s.listRow}>
              <span className="medium" style={{ width: 180 }}>{c.name}</span>
              <Badge size="sm">{titleCase(c.type)}</Badge>
              <span className="grow ellipsis small muted">{c.options.join(", ")}</span>
              <IconButton size="sm" label={`Delete ${c.name}`} icon={<Trash2 size={14} />} onClick={() => d.ask(c)} />
            </div>
          ))}
          <div className={s.addRow}>
            <Field label="Name" className="grow"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Sprint" /></Field>
            <Field label="Type"><Select value={f.type} onChange={(v) => setF({ ...f, type: v })} fullWidth={false} options={["TEXT", "NUMBER", "SELECT", "DATE"].map((t) => ({ value: t, label: titleCase(t) }))} /></Field>
            {f.type === "SELECT" && <Field label="Options (comma separated)" className="grow"><Input value={f.options} onChange={(e) => setF({ ...f, options: e.target.value })} placeholder="Low, Medium, High" /></Field>}
            <Button variant="primary" icon={<Plus size={14} />} loading={busy} onClick={add}>Add</Button>
          </div>
        </>
      )}
      {d.dialog}
    </Section>
  );
}

export function Templates() {
  const { can } = useMe();
  const { data, error, loading, reload } = useApi<Template[]>("/settings/templates");
  const d = useDelete("/settings/templates", "/settings/templates", "template");
  return (
    <Section title="Templates" desc="Project and task templates saved from the projects pages. Create them with “Save as template” on a project.">
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <SkeletonRows rows={3} /> : (
        <>
          {!data?.length && <div className={s.listRow}><span className="faint">No templates yet.</span></div>}
          {(data ?? []).map((t) => (
            <div key={t.id} className={s.listRow}>
              <Badge size="sm" tone={t.kind === "PROJECT" ? "accent" : "gray"}>{titleCase(t.kind)}</Badge>
              <span className="grow ellipsis">{t.name}</span>
              <span className="small faint">{relTime(t.createdAt)}</span>
              {can("projects", "manage") && <IconButton size="sm" label={`Delete ${t.name}`} icon={<Trash2 size={14} />} onClick={() => d.ask(t)} />}
            </div>
          ))}
        </>
      )}
      {d.dialog}
    </Section>
  );
}

export function Section({ title, desc, children, actions }: { title: string; desc?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className={s.section}>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <h2 className={s.h2}>{title}</h2>
          {desc && <p className="small muted">{desc}</p>}
        </div>
        {actions}
      </div>
      <div className={s.rows}>{children}</div>
    </section>
  );
}
