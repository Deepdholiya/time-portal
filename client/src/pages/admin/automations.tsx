import { useState } from "react";
import { AlarmClock, CalendarClock, ListChecks, MoreHorizontal, Pencil, Plus, Timer, Trash2, Workflow } from "lucide-react";
import { Page } from "@/components/app/page";
import { STATUSES, STATUS_META } from "@/components/app/icons";
import { Badge, Button, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, IconButton, Input, Menu, Select, SkeletonRows, Switch, toast } from "@/components/ui";
import { del, post, put } from "@/lib/api";
import { invalidate, useApi } from "@/lib/hooks";
import { relTime } from "@/lib/format";
import s from "./integrations.module.css";

type Config = { status?: string; notify?: string; notifyManager?: boolean; days?: number };
type Automation = { id: number; name: string; trigger: string; config: Config; enabled: boolean; runs: number; createdAt: string };

const TRIGGERS: Record<string, { label: string; icon: React.ReactNode; describe: (c: Config) => string }> = {
  TIMESHEET_REMINDER: { label: "Timesheet reminder", icon: <Timer size={14} />, describe: () => "Each working day, remind everyone who logged no time on the previous working day (people on approved leave are skipped)." },
  TASK_OVERDUE: { label: "Task overdue", icon: <AlarmClock size={14} />, describe: (c) => `When a task passes its due date, notify the assignee${c.notifyManager ? " and the project manager" : ""}.` },
  TASK_STATUS: { label: "Task status changes", icon: <ListChecks size={14} />, describe: (c) => `When a task moves to ${STATUS_META[c.status as keyof typeof STATUS_META]?.label ?? "a status"}, notify the ${c.notify === "creator" ? "task creator" : "project manager"}.` },
  DUE_SOON: { label: "Due soon", icon: <CalendarClock size={14} />, describe: (c) => `Remind assignees ${Number(c.days ?? 1) === 0 ? "on the due date" : `${c.days ?? 1} day${Number(c.days ?? 1) === 1 ? "" : "s"} before the due date`}.` },
};

export default function Automations() {
  const { data, error, loading, reload, mutate } = useApi<Automation[]>("/settings/automations");
  const [edit, setEdit] = useState<Automation | "new" | null>(null);
  const [remove, setRemove] = useState<Automation | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = async (a: Automation, enabled: boolean) => {
    mutate((rows) => (rows ?? []).map((r) => (r.id === a.id ? { ...r, enabled } : r)));
    try {
      await put(`/settings/automations/${a.id}`, { enabled });
      toast.success(`${a.name} ${enabled ? "on" : "off"}`);
    } catch (e) { toast.error(e); reload(); }
  };
  const doDelete = async () => {
    if (!remove) return;
    setBusy(true);
    try {
      await del(`/settings/automations/${remove.id}`);
      toast.success(`Deleted ${remove.name}`);
      setRemove(null);
      invalidate("/settings/automations");
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  return (
    <Page title="Automations" icon={<Workflow size={15} />} actions={<Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setEdit("new")}>New automation</Button>}>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <SkeletonRows /> : !data?.length ? (
        <EmptyState icon={<Workflow size={28} />} title="No automations" description="Send reminders and notifications automatically when work changes." action={<Button variant="primary" onClick={() => setEdit("new")}>Create automation</Button>} />
      ) : (
        <div className="list">
          {data.map((a) => {
            const t = TRIGGERS[a.trigger];
            return (
              <div key={a.id} className="list-row" style={{ height: "auto", minHeight: 52, padding: "8px 16px 8px 20px" }}>
                <span className={s.icon}>{t?.icon ?? <Workflow size={14} />}</span>
                <div className="grow col" style={{ gap: 2 }}>
                  <span className="row"><span className="medium">{a.name}</span><Badge size="sm">{t?.label ?? a.trigger}</Badge></span>
                  <span className="small muted ellipsis">{t?.describe(a.config) ?? ""}</span>
                </div>
                <span className="small faint num" style={{ width: 110, textAlign: "right" }}>{a.runs} {a.runs === 1 ? "run" : "runs"}</span>
                <span className="small faint" style={{ width: 90, textAlign: "right" }}>{relTime(a.createdAt)}</span>
                <Switch checked={a.enabled} onChange={(v) => toggle(a, v)} aria-label={`Enable ${a.name}`} />
                <Menu placement="bottom-end" trigger={<IconButton label={`Actions for ${a.name}`} size="sm" icon={<MoreHorizontal size={15} />} />} items={[
                  { label: "Edit", icon: <Pencil size={14} />, onSelect: () => setEdit(a) },
                  { type: "separator" },
                  { label: "Delete", icon: <Trash2 size={14} />, danger: true, onSelect: () => setRemove(a) },
                ]} />
              </div>
            );
          })}
        </div>
      )}
      {edit && <AutomationDialog item={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      <ConfirmDialog open={!!remove} onClose={() => setRemove(null)} onConfirm={doDelete} loading={busy} danger confirmLabel="Delete" title={`Delete "${remove?.name}"?`} description="Its notifications stop immediately." />
    </Page>
  );
}

function AutomationDialog({ item, onClose }: { item: Automation | null; onClose: () => void }) {
  const [name, setName] = useState(item?.name ?? "");
  const [trigger, setTrigger] = useState(item?.trigger ?? "TASK_STATUS");
  const [cfg, setCfg] = useState<Config>(item?.config ?? { status: "IN_REVIEW", notify: "manager" });
  const [enabled, setEnabled] = useState(item?.enabled ?? true);
  const [busy, setBusy] = useState(false);

  const changeTrigger = (t: string) => {
    setTrigger(t);
    setCfg(t === "TASK_STATUS" ? { status: "IN_REVIEW", notify: "manager" } : t === "TASK_OVERDUE" ? { notifyManager: true } : t === "DUE_SOON" ? { days: 1 } : {});
    if (!name || Object.values(TRIGGERS).some((x) => x.label === name)) setName(TRIGGERS[t].label);
  };

  const save = async () => {
    if (!name.trim()) { toast.error("Name the automation"); return; }
    setBusy(true);
    try {
      if (item) await put(`/settings/automations/${item.id}`, { name: name.trim(), config: cfg, enabled });
      else await post("/settings/automations", { name: name.trim(), trigger, config: cfg, enabled });
      toast.success(item ? "Automation saved" : "Automation created");
      invalidate("/settings/automations");
      onClose();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  return (
    <Dialog open onClose={onClose} title={item ? "Edit automation" : "New automation"} onSubmit={save}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>{item ? "Save" : "Create"}</Button></>}>
      <div className="col gap-16">
        <Field label="When" hint={item ? "The trigger can't be changed; create a new automation instead." : undefined}>
          <Select value={trigger} disabled={!!item} onChange={changeTrigger} options={Object.entries(TRIGGERS).map(([k, t]) => ({ value: k, label: t.label }))} />
        </Field>
        {trigger === "TASK_STATUS" && (
          <div className="form-grid">
            <Field label="Status becomes"><Select value={cfg.status ?? "IN_REVIEW"} onChange={(v) => setCfg({ ...cfg, status: v })} options={STATUSES.map((st) => ({ value: st, label: STATUS_META[st].label }))} /></Field>
            <Field label="Notify"><Select value={cfg.notify ?? "manager"} onChange={(v) => setCfg({ ...cfg, notify: v })} options={[{ value: "manager", label: "Project manager" }, { value: "creator", label: "Task creator" }]} /></Field>
          </div>
        )}
        {trigger === "TASK_OVERDUE" && <Switch checked={!!cfg.notifyManager} onChange={(v) => setCfg({ ...cfg, notifyManager: v })} label="Also notify the project manager" />}
        {trigger === "DUE_SOON" && <Field label="Days before due date"><Input type="number" min={0} max={14} value={cfg.days ?? 1} onChange={(e) => setCfg({ ...cfg, days: Number(e.target.value) })} suffix="days" /></Field>}
        <p className="small muted">{TRIGGERS[trigger]?.describe(cfg)}</p>
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Switch checked={enabled} onChange={setEnabled} label="Enabled" />
      </div>
    </Dialog>
  );
}
