import { useState } from "react";
import { ChevronLeft, DollarSign, Lock, MoreVertical, Plus, Trash2 } from "lucide-react";
import { Button, ConfirmDialog, Field, IconButton, Input, Menu, Popover, Textarea, toast } from "@/components/ui";
import { ProjectDot } from "@/components/app/icons";
import { useMe } from "@/lib/session";
import { del, post, put } from "@/lib/api";
import { dayName, fmtDate, hm, parseDate, parseDuration } from "@/lib/format";
import type { Options, TimeEntry } from "@/lib/types";
import { ProjectTaskPicker, type Pick } from "../time/project-task-picker";
import { TagPicker } from "../time/tag-picker";
import { entryBody, type Row } from "./rows";
import s from "./timesheet.module.css";

export interface GridCtx {
  days: string[];
  today: string;
  userId: number;
  forOther: boolean;
  /** The person may change this timesheet at all (own, or someone else's with permission). */
  editable: boolean;
  /** Audit reason, required before editing someone else's time. */
  reason: string;
  options: Options | undefined;
  workDays: Set<number>;
  dayTags: Record<string, string>;
  /** True for a day that can't be changed (approved, when the company locks approved days). */
  isLocked: (date: string) => boolean;
  onChanged: () => void;
  onAddDraft: (pick: Pick) => void;
  onRemoveDraft: (key: string) => void;
}

const reasonQs = (c: GridCtx) => (c.forOther && c.reason.trim() ? `?reason=${encodeURIComponent(c.reason.trim())}` : "");
const withReason = <T extends object>(c: GridCtx, body: T) => (c.forOther ? { ...body, reason: c.reason.trim() } : body);
function guard(c: GridCtx) {
  if (c.forOther && !c.reason.trim()) throw new Error("Add a reason for the change first (shown above the grid)");
}
const isOff = (c: GridCtx, d: string) => !c.workDays.has(((parseDate(d).getDay() + 6) % 7) + 1);
/** A day can be edited when the sheet is editable, the day isn't in the future and it isn't a locked approved day. */
const dayOpen = (c: GridCtx, d: string) => c.editable && d <= c.today && !c.isLocked(d);

export function TimesheetGrid({ rows, ctx }: { rows: Row[]; ctx: GridCtx }) {
  const dayTotals = ctx.days.map((d) => rows.reduce((a, r) => a + r.entries.filter((e) => e.date === d).reduce((x, e) => x + e.minutes, 0), 0));
  const total = dayTotals.reduce((a, b) => a + b, 0);
  return (
    <table className={s.grid} style={{ minWidth: 300 + ctx.days.length * 84 + 150 }}>
      <colgroup>
        <col className={s.colProject} />
        {ctx.days.map((d) => <col key={d} className={s.colDay} />)}
        <col className={s.colTotal} /><col className={s.colAct} />
      </colgroup>
      <thead>
        <tr>
          <th className={s.sticky}>Project / task</th>
          {ctx.days.map((d) => <DayHead key={d} date={d} ctx={ctx} />)}
          <th className={s.colTotal}>Total</th>
          <th aria-label="Row actions" />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => <GridRow key={r.key} row={r} ctx={ctx} />)}
        {ctx.editable && <AddRow ctx={ctx} />}
        {!rows.length && !ctx.editable && (
          <tr><td colSpan={ctx.days.length + 3} className="center faint" style={{ height: 80 }}>No time logged in this range.</td></tr>
        )}
      </tbody>
      <tfoot>
        <tr>
          <td className={s.sticky}>Daily total</td>
          {dayTotals.map((m, i) => <td key={i} className={`${s.footNum} ${m > 12 * 60 ? s.over : ""}`}>{m ? hm(m, true) : <span className="faint">0:00</span>}</td>)}
          <td className={s.rowTotal}>{hm(total, true)}</td>
          <td />
        </tr>
      </tfoot>
    </table>
  );
}

function DayHead({ date, ctx }: { date: string; ctx: GridCtx }) {
  return (
    <th className={`${s.colDay} ${isOff(ctx, date) ? s.offDay : ""}`}>
      <div className={`${s.dayHead} ${date === ctx.today ? s.today : ""}`}>
        <span className="dn">{dayName(date)}</span>
        <span className="dd">{Number(date.slice(8))}</span>
        {ctx.dayTags[date] && <span className={s.dayTag} title={ctx.dayTags[date]}>{ctx.dayTags[date]}</span>}
      </div>
    </th>
  );
}

function GridRow({ row, ctx }: { row: Row; ctx: GridCtx }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const total = row.entries.reduce((a, e) => a + e.minutes, 0);
  const open = row.entries.filter((e) => dayOpen(ctx, e.date));

  const toggleBillable = async () => {
    if (row.draft) return;
    try {
      guard(ctx);
      if (open.length < row.entries.length) toast.info("Locked days keep their billable setting");
      for (const e of open) await put(`/time/${e.id}`, withReason(ctx, entryBody(e, { billable: !row.billable })));
      ctx.onChanged();
    } catch (e) { toast.error(e); }
  };

  const removeRow = async () => {
    if (row.draft) { ctx.onRemoveDraft(row.key); return; }
    setBusy(true);
    try {
      guard(ctx);
      for (const e of open) await del(`/time/${e.id}${reasonQs(ctx)}`);
      toast.success(open.length === row.entries.length ? "Row deleted" : `Deleted ${open.length} entries; locked days were left as they are`);
      setConfirm(false);
      ctx.onChanged();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  return (
    <tr>
      <td className={s.sticky}>
        <div className={s.projectCell} title={`${row.projectLabel}${row.taskLabel ? ` · ${row.taskLabel}` : ""}`}>
          <ProjectDot color={row.color} />
          <div className={s.projectText}>
            <span className="ellipsis medium">{row.leafLabel}{row.parentLabel && <span className="faint" style={{ fontWeight: 400 }}> · {row.parentLabel}</span>}</span>
            <span className={`ellipsis ${s.taskLine}`}>{row.taskLabel ? <>{row.taskKey && <span className="num">{row.taskKey} </span>}{row.taskLabel}</> : "No task"}</span>
          </div>
        </div>
      </td>
      {ctx.days.map((d) => <DayCell key={d} row={row} date={d} ctx={ctx} />)}
      <td className={s.rowTotal}>{total ? hm(total, true) : <span className="faint">0:00</span>}</td>
      <td>
        <div className={s.rowActions}>
          {ctx.editable && !row.draft && (
            <Menu
              placement="bottom-end"
              trigger={<IconButton size="sm" label="Row actions" icon={<MoreVertical size={14} />} />}
              items={[
                { label: row.billable ? "Make non-billable" : "Make billable", icon: <DollarSign size={14} />, onSelect: toggleBillable, disabled: !open.length },
                { type: "separator" },
                { label: "Delete row", icon: <Trash2 size={14} />, danger: true, onSelect: () => setConfirm(true), disabled: !open.length },
              ]}
            />
          )}
          {row.draft && <IconButton size="sm" label="Remove row" icon={<Trash2 size={13} />} onClick={removeRow} />}
        </div>
        <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={removeRow} danger loading={busy} confirmLabel="Delete entries"
          title="Delete this row?" description={`Deletes ${open.length} ${open.length === 1 ? "entry" : "entries"} (${hm(open.reduce((a, e) => a + e.minutes, 0))}) on ${row.projectLabel}${row.taskLabel ? ` · ${row.taskLabel}` : ""} in this range.${open.length < row.entries.length ? " Entries on locked days stay." : ""}`} />
      </td>
    </tr>
  );
}

/**
 * One project/task on one day. Clicking the cell opens a small editor right there: duration, description and tags (the row
 * already sets the project and task), saved in one step. A cell with several entries lists them first; pick one to edit it or
 * add another.
 */
function DayCell({ row, date, ctx }: { row: Row; date: string; ctx: GridCtx }) {
  const list = row.entries.filter((e) => e.date === date);
  const minutes = list.reduce((a, e) => a + e.minutes, 0);
  const [open, setOpen] = useState(false);
  const editable = dayOpen(ctx, date);
  const future = date > ctx.today;
  const label = `${row.projectLabel}${row.taskLabel ? ` ${row.taskLabel}` : ""}, ${dayName(date)} ${fmtDate(date)}`;
  const cls = `${s.dayCell} ${isOff(ctx, date) ? s.offDay : ""}`;
  if (future) return <td className={`${cls} ${s.futureCell}`} aria-label={`${label}: future date`} />;
  const locked = !editable && list.length > 0;
  const summary = list.length ? `${list.length} ${list.length === 1 ? "entry" : "entries"}, ${hm(minutes)}` : "no time";
  const tip = list.length === 1 ? [list[0].startTime && list[0].endTime ? `${list[0].startTime}–${list[0].endTime}` : "", list[0].description].filter(Boolean).join(" · ") : undefined;
  const cell = (
    <button type="button" data-row={row.key} data-date={date} className={`${s.cellBtn} ${minutes ? s.cellFilled : ""} ${locked ? s.cellLocked : ""}`} disabled={!editable && !list.length}
      aria-label={`${label}: ${summary}${locked ? ", locked" : ""}. ${editable ? "Edit" : "View"}`} title={tip || undefined}>
      {minutes ? hm(minutes, true) : <span className={s.cellEmpty}>{editable ? "+" : ""}</span>}
      {list.length > 1 && <sup>{list.length}</sup>}
      {locked && <Lock size={10} className={s.cellLock} />}
    </button>
  );
  return (
    <td className={cls}>
      <Popover trigger={cell} open={open} onOpenChange={setOpen} padded={false} width={340} placement="bottom-start">
        {(close) => <CellEditor row={row} date={date} list={list} ctx={ctx} editable={editable} close={() => { close(); setOpen(false); }} />}
      </Popover>
    </td>
  );
}

function CellEditor({ row, date, list, ctx, editable, close }: { row: Row; date: string; list: TimeEntry[]; ctx: GridCtx; editable: boolean; close: () => void }) {
  // With one entry (or none) the form opens straight away; with several, the list comes first.
  const [picked, setPicked] = useState<TimeEntry | "new" | null>(list.length > 1 ? null : list[0] ?? "new");
  const total = list.reduce((a, e) => a + e.minutes, 0);
  const head = <div className={s.popHead}><span className="medium ellipsis">{row.leafLabel}{row.taskLabel ? ` · ${row.taskLabel}` : ""}</span><span className="faint small">{dayName(date)} {fmtDate(date)}</span></div>;
  if (picked === null) {
    return (
      <div className={s.pop}>
        {head}
        <div className={s.popList}>
          {list.map((e) => (
            <button key={e.id} type="button" className={s.popItem} onClick={() => setPicked(e)}>
              <span className="num medium">{hm(e.minutes, true)}</span>
              <span className="ellipsis grow">{e.description || <span className="faint">No description</span>}</span>
              <span className="num faint small">{e.startTime && e.endTime ? `${e.startTime}–${e.endTime}` : ""}</span>
            </button>
          ))}
        </div>
        <div className={s.popFoot}>
          <span className="small muted">Total <span className="num medium">{hm(total, true)}</span></span>
          <span className="grow" />
          {editable && <Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={() => setPicked("new")}>Add entry</Button>}
        </div>
      </div>
    );
  }
  return <EntryForm key={picked === "new" ? "new" : picked.id} entry={picked === "new" ? null : picked} row={row} date={date} ctx={ctx} editable={editable} head={head}
    onBack={list.length > 1 ? () => setPicked(null) : undefined} close={close} />;
}

/** Duration, description and tags for one entry in a timesheet cell. Enter saves. */
function EntryForm({ entry, row, date, ctx, editable, head, onBack, close }: {
  entry: TimeEntry | null; row: Row; date: string; ctx: GridCtx; editable: boolean; head: React.ReactNode; onBack?: () => void; close: () => void;
}) {
  const { settings } = useMe();
  const [dur, setDur] = useState(entry ? hm(entry.minutes, true) : "");
  const [desc, setDesc] = useState(entry?.description ?? "");
  const [tagIds, setTagIds] = useState<number[]>(entry?.tags.map((t) => t.id) ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const save = async () => {
    const m = parseDuration(dur.trim());
    if (!m || m <= 0 || m > 24 * 60) { setError("Enter a duration like 2, 1.5, 1:30, 2h 30m or 45m"); return; }
    setBusy(true); setError(null);
    try {
      guard(ctx);
      if (entry) await put(`/time/${entry.id}`, withReason(ctx, { ...entryBody(entry, { minutes: m }), description: desc.trim(), tagIds }));
      else {
        await post("/time", { projectId: row.projectId, taskId: row.taskId, date, minutes: m, billable: row.billable, description: desc.trim(), tagIds, ...(ctx.forOther ? { userId: ctx.userId } : {}) });
        if (row.draft) ctx.onRemoveDraft(row.key);
      }
      toast.success(entry ? "Entry saved" : `Logged ${hm(m)} on ${dayName(date)}`);
      ctx.onChanged();
      close();
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save the entry"); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!entry) return;
    setBusy(true);
    try {
      guard(ctx);
      await del(`/time/${entry.id}${reasonQs(ctx)}`);
      const undo = entry;
      toast.info(`Removed ${hm(undo.minutes)} on ${dayName(date)}`, {
        action: { label: "Undo", onClick: () => { post("/time", { ...entryBody(undo), ...(ctx.forOther ? { userId: ctx.userId } : {}) }).then(ctx.onChanged).catch(toast.error); } },
      });
      ctx.onChanged();
      close();
    } catch (e) { toast.error(e); } finally { setBusy(false); setConfirm(false); }
  };
  const onEnter = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } };

  if (!editable) {
    return (
      <div className={s.pop}>
        {head}
        <div className={s.popBody}>
          <div className="row gap-4 small muted"><Lock size={12} /> This day is approved and locked.</div>
          <div className="row"><span className="num medium">{entry ? hm(entry.minutes, true) : ""}</span><span className="grow ellipsis">{entry?.description || <span className="faint">No description</span>}</span></div>
        </div>
      </div>
    );
  }
  return (
    <form className={s.pop} onSubmit={(e) => { e.preventDefault(); save(); }}>
      {head}
      <div className={s.popBody}>
        <Field label="Duration" error={error ?? undefined}>
          <Input autoFocus value={dur} onChange={(e) => setDur(e.target.value)} onKeyDown={onEnter} placeholder="e.g. 2 or 1h 30m" inputMode="decimal" className="num" />
        </Field>
        <Field label="Description">
          <Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} onKeyDown={onEnter} placeholder="What did you work on?" />
        </Field>
        <Field label="Tags" hint={settings.requireTags ? "At least one tag is needed" : undefined}>
          <TagPicker value={tagIds} onChange={setTagIds} userId={ctx.forOther ? ctx.userId : undefined} keep={entry?.tags} />
        </Field>
      </div>
      <div className={s.popFoot}>
        {onBack && <IconButton size="sm" label="Back to entries" icon={<ChevronLeft size={14} />} onClick={onBack} />}
        {entry && <IconButton size="sm" variant="ghost" label="Delete entry" icon={<Trash2 size={14} />} onClick={() => setConfirm(true)} />}
        <span className="grow" />
        <Button size="sm" variant="ghost" onClick={close}>Cancel</Button>
        <Button size="sm" variant="primary" type="submit" loading={busy}>{entry ? "Save" : "Add entry"}</Button>
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={remove} danger confirmLabel="Delete entry" loading={busy}
        title="Delete this entry?" description={`${entry ? hm(entry.minutes) : ""} on ${fmtDate(date)}${entry?.description ? `: “${entry.description}”` : ""}. You can undo right after.`} />
    </form>
  );
}

function AddRow({ ctx }: { ctx: GridCtx }) {
  return (
    <tr className={s.addRow}>
      <td className={s.sticky} style={{ paddingLeft: 4 }}>
        <ProjectTaskPicker
          options={ctx.options}
          value={{ projectId: null, taskId: null }}
          onChange={(v) => v.projectId && ctx.onAddDraft(v)}
          placeholder="Add row: project or task"
          autoOpenLabel="Add row"
          placeholderIcon={<Plus size={14} className="faint" />}
          width={420}
        />
      </td>
      <td colSpan={ctx.days.length + 2} />
    </tr>
  );
}
