import { useEffect, useState } from "react";
import { Bookmark, CalendarClock, Trash2 } from "lucide-react";
import { Badge, Button, ConfirmDialog, Dialog, Field, IconButton, Input, Popover, Select, toast } from "@/components/arc";
import { del, post, put } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { fmtDateTime } from "@/lib/format";
import type { ReportConfig } from "./report-config";
import type { Preset } from "./period";
import s from "./reports.module.css";

export interface SavedReport {
  id: number; name: string; schedule: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | null; nextRunAt: string | null; lastRunAt: string | null;
  config: { filters?: Record<string, string>; config?: Partial<ReportConfig>; preset?: string };
}

const SCHEDULES = [{ value: "", label: "Not scheduled" }, { value: "DAILY", label: "Daily" }, { value: "WEEKLY", label: "Weekly (Mondays)" }, { value: "MONTHLY", label: "Monthly (1st)" }, { value: "QUARTERLY", label: "Quarterly" }];

export function useSavedReports() {
  return useApi<SavedReport[]>("/reports/saved");
}

export function SavedMenu({ list, current, onLoad, onChanged }: { list: SavedReport[]; current: SavedReport | null; onLoad: (r: SavedReport) => void; onChanged: () => void }) {
  const [remove, setRemove] = useState<SavedReport | null>(null);
  return (
    <>
      <Popover trigger={<Button size="sm" variant="ghost" icon={<Bookmark size={14} />}>{current ? current.name : "Saved reports"}{list.length ? <span className="faint"> {list.length}</span> : null}</Button>} width={320} padded={false} placement="bottom-end">
        {(close) => (
          <div className={s.savedList}>
            {!list.length && <div className="faint small" style={{ padding: 12 }}>No saved reports yet. Set up a report and choose Save.</div>}
            {list.map((r) => (
              <div key={r.id} className={s.savedRow} onClick={() => { onLoad(r); close(); }} role="button" tabIndex={0}>
                <div className="grow">
                  <div className="medium ellipsis">{r.name}</div>
                  <div className="faint tiny">{r.config.preset ? `${r.config.preset} · ` : ""}{r.schedule ? `${r.schedule.toLowerCase()}, next ${fmtDateTime(r.nextRunAt)}` : "not scheduled"}</div>
                </div>
                {r.schedule && <Badge size="sm" tone="accent" icon={<CalendarClock size={11} />}>{r.schedule.toLowerCase()}</Badge>}
                <IconButton size="sm" label="Delete report" icon={<Trash2 size={13} />} onClick={(e) => { e.stopPropagation(); close(); setRemove(r); }} />
              </div>
            ))}
          </div>
        )}
      </Popover>
      <ConfirmDialog open={!!remove} onClose={() => setRemove(null)} danger confirmLabel="Delete" title={`Delete "${remove?.name}"?`}
        description={remove?.schedule ? "Its schedule stops too." : undefined}
        onConfirm={async () => {
          try { await del(`/reports/saved/${remove!.id}`); toast.success("Report deleted"); onChanged(); } catch (e) { toast.error(e); }
          setRemove(null);
        }} />
    </>
  );
}

export function SaveDialog({ open, onClose, current, payload, onSaved }: {
  open: boolean; onClose: () => void; current: SavedReport | null;
  payload: { filters: Record<string, string>; config: ReportConfig; preset: Preset }; onSaved: (id: number) => void;
}) {
  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState("");
  const [asNew, setAsNew] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setName(current?.name ?? ""); setSchedule(current?.schedule ?? ""); setAsNew(!current); } }, [open, current]);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const body = { name: name.trim(), filters: payload.filters, config: payload.config, preset: payload.preset, schedule: schedule || null };
    try {
      const r = current && !asNew ? await put<{ id: number }>(`/reports/saved/${current.id}`, body) : await post<{ id: number }>("/reports/saved", body);
      toast.success(current && !asNew ? "Report updated" : "Report saved", schedule ? { description: "You'll get it by email and in your inbox." } : undefined);
      onSaved(r.id);
      onClose();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} title={current && !asNew ? "Update saved report" : "Save report"} size="sm" onSubmit={save}
      footer={<>
        {current && <Button variant="ghost" onClick={() => setAsNew(!asNew)}>{asNew ? `Update "${current.name}" instead` : "Save as new"}</Button>}
        <div className="grow" />
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" type="submit" loading={busy} disabled={!name.trim()}>Save</Button>
      </>}>
      <div className="col gap-12">
        <Field label="Name"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Monthly client hours" /></Field>
        <Field label="Schedule" hint="Scheduled reports are delivered to you by email and in your inbox, using the period preset (for example, last month).">
          <Select value={schedule} onChange={setSchedule} options={SCHEDULES} />
        </Field>
      </div>
    </Dialog>
  );
}
