import { useEffect, useRef, useState } from "react";
import { DollarSign, Lock, MoreVertical, Pencil, Plus, Send, Trash2, Undo2 } from "lucide-react";
import { ConfirmDialog, IconButton, Menu, Tooltip, toast, type MenuItem } from "@/components/ui";
import { ProjectDot } from "@/components/app/icons";
import { useShell } from "@/components/app/shell-context";
import { del, post, put } from "@/lib/api";
import { dayName, fmtDate, hm, parseDate, parseDuration } from "@/lib/format";
import type { DayState, Options, TimeEntry } from "@/lib/types";
import { ProjectTaskPicker, type Pick } from "../time/project-task-picker";
import { DAY_STATUS, LOCKED } from "../time/time-utils";
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
  dayStates: Map<string, DayState>;
  onChanged: () => void;
  onAddDraft: (pick: Pick) => void;
  onRemoveDraft: (key: string) => void;
  onSubmitDay: (date: string) => void;
  onReopenDay: (date: string) => void;
}

const reasonQs = (c: GridCtx) => (c.forOther && c.reason.trim() ? `?reason=${encodeURIComponent(c.reason.trim())}` : "");
const withReason = <T extends object>(c: GridCtx, body: T) => (c.forOther ? { ...body, reason: c.reason.trim() } : body);
function guard(c: GridCtx) {
  if (c.forOther && !c.reason.trim()) throw new Error("Add a reason for the change first (shown above the grid)");
}
const isOff = (c: GridCtx, d: string) => !c.workDays.has(((parseDate(d).getDay() + 6) % 7) + 1);
/** A day can be edited when the sheet is editable and the day isn't submitted or approved. */
const dayOpen = (c: GridCtx, d: string) => c.editable && d <= c.today && !LOCKED.includes(c.dayStates.get(d)?.status ?? "SAVED");

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
  const st = ctx.dayStates.get(date);
  const info = st ? DAY_STATUS[st.status] : null;
  const overdue = st?.status === "SAVED" && st.overdue;
  const label = overdue ? "Not submitted" : info?.label;
  const own = !ctx.forOther && ctx.editable;
  const items: MenuItem[] = [
    { type: "heading", label: `${dayName(date)} ${fmtDate(date)}${st ? ` · ${hm(st.minutes)}` : ""}` },
    ...(own && st && !LOCKED.includes(st.status) ? [{ label: st.status === "SAVED" ? "Submit day" : "Resubmit day", icon: <Send size={14} />, onSelect: () => ctx.onSubmitDay(date) }] : []),
    ...(own && st?.status === "SUBMITTED" ? [{ label: "Reopen to correct", icon: <Undo2 size={14} />, onSelect: () => ctx.onReopenDay(date) }] : []),
  ];
  const head = (
    <div className={`${s.dayHead} ${date === ctx.today ? s.today : ""}`}>
      <span className="dn">{dayName(date)}</span>
      <span className="dd">{Number(date.slice(8))}</span>
      {ctx.dayTags[date] && <span className={s.dayTag} title={ctx.dayTags[date]}>{ctx.dayTags[date]}</span>}
      {info && <span className={`${s.dayStatus} ${s["st_" + (overdue ? "OVERDUE" : st!.status)]}`}>{LOCKED.includes(st!.status) && <Lock size={9} />}{label}</span>}
    </div>
  );
  return (
    <th className={`${s.colDay} ${isOff(ctx, date) ? s.offDay : ""}`}>
      {items.length > 1 ? (
        <Menu placement="bottom-start" width={220} items={items} trigger={
          <button type="button" className={s.dayHeadBtn} aria-label={`${dayName(date)} ${fmtDate(date)}: ${label ?? "no time"}. Day actions`} title={st?.note ?? (info ? (overdue ? "Changed after the cutoff. Submit it when you're ready." : info.hint) : undefined)}>{head}</button>
        } />
      ) : <div title={st?.note ?? info?.hint}>{head}</div>}
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
      if (open.length < row.entries.length) toast.info("Submitted days keep their billable setting");
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
      toast.success(open.length === row.entries.length ? "Row deleted" : `Deleted ${open.length} entries; submitted days were left as they are`);
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
          title="Delete this row?" description={`Deletes ${open.length} ${open.length === 1 ? "entry" : "entries"} (${hm(open.reduce((a, e) => a + e.minutes, 0))}) on ${row.projectLabel}${row.taskLabel ? ` · ${row.taskLabel}` : ""} in this range.${open.length < row.entries.length ? " Entries on submitted days stay." : ""}`} />
      </td>
    </tr>
  );
}

/**
 * One project/task on one day. Type hours straight into an empty or single-entry cell; the ⋮ menu opens the full editor for each
 * entry or adds another one. A cell with several entries shows their sum and is edited through the menu.
 */
function DayCell({ row, date, ctx }: { row: Row; date: string; ctx: GridCtx }) {
  const shell = useShell();
  const list = row.entries.filter((e) => e.date === date);
  const minutes = list.reduce((a, e) => a + e.minutes, 0);
  const shown = minutes ? hm(minutes, true) : "";
  const [val, setVal] = useState(shown);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<TimeEntry | null>(null);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setVal(shown); }, [shown]);
  const open = dayOpen(ctx, date);
  const future = date > ctx.today;
  const draft = val.trim() !== shown;
  const label = `${row.projectLabel}${row.taskLabel ? ` ${row.taskLabel}` : ""}, ${dayName(date)} ${fmtDate(date)}`;

  const commit = async () => {
    focused.current = false;
    const raw = val.trim();
    if (raw === shown) return;
    const m = raw ? parseDuration(raw) : 0;
    if (m === null || m < 0 || m > 24 * 60) { toast.error("Enter hours like 2, 1.5, 1:30, 2h 30m or 45m"); setVal(shown); return; }
    if (m === minutes) { setVal(shown); return; }
    setSaving(true);
    try {
      guard(ctx);
      const e = list[0];
      if (!e && m > 0) {
        await post("/time", { projectId: row.projectId, taskId: row.taskId, date, minutes: m, billable: row.billable, ...(ctx.forOther ? { userId: ctx.userId } : {}) });
        if (row.draft) ctx.onRemoveDraft(row.key);
      } else if (e && m > 0) {
        await put(`/time/${e.id}`, withReason(ctx, entryBody(e, { minutes: m })));
      } else if (e) {
        await del(`/time/${e.id}${reasonQs(ctx)}`);
        const undo = e;
        toast.info(`Removed ${hm(undo.minutes)} on ${dayName(date)}`, {
          action: { label: "Undo", onClick: () => { post("/time", { ...entryBody(undo), ...(ctx.forOther ? { userId: ctx.userId } : {}) }).then(ctx.onChanged).catch(toast.error); } },
        });
      }
      ctx.onChanged();
    } catch (err) {
      toast.error(err);
      setVal(shown);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (e: TimeEntry) => {
    try { guard(ctx); await del(`/time/${e.id}${reasonQs(ctx)}`); toast.success("Entry deleted"); setConfirm(null); ctx.onChanged(); } catch (err) { toast.error(err); }
  };

  const edit = (e: TimeEntry) => shell.editEntry(e.id, ctx.onChanged);
  const addEntry = () => shell.logTime({ date, projectId: row.projectId, taskId: row.taskId, billable: row.billable, userId: ctx.forOther ? ctx.userId : undefined }, () => { if (row.draft) ctx.onRemoveDraft(row.key); ctx.onChanged(); });
  const items: MenuItem[] = [
    ...(list.length ? [{ type: "heading" as const, label: `${list.length} ${list.length === 1 ? "entry" : "entries"} · ${hm(minutes)}` }] : []),
    ...list.map((e) => ({
      label: <span className={s.menuEntry}><span className="num faint">{e.startTime && e.endTime ? `${e.startTime}–${e.endTime}` : hm(e.minutes, true)}</span><span className="ellipsis">{e.description || "No description"}</span></span>,
      icon: <Pencil size={14} />, onSelect: () => edit(e),
    })),
    ...(open ? [
      ...(list.length ? [{ type: "separator" as const }] : []),
      { label: list.length ? "Add another entry" : "Add entry with details", icon: <Plus size={14} />, onSelect: addEntry },
      ...(list.length === 1 ? [{ label: "Delete entry", icon: <Trash2 size={14} />, danger: true, onSelect: () => setConfirm(list[0]) }] : []),
    ] : []),
  ];

  const cls = `${s.dayCell} ${isOff(ctx, date) ? s.offDay : ""} ${!open && list.length ? s.lockedCell : ""}`;
  if (future) return <td className={`${cls} ${s.futureCell}`} aria-label={`${label}: future date`} />;
  return (
    <td className={cls}>
      <div className={s.cellWrap}>
        {list.length > 1 || !open ? (
          <button type="button" className={list.length > 1 ? s.cellMulti : s.cellStatic} disabled={!list.length && !open} onClick={() => list.length === 1 && open ? edit(list[0]) : undefined}
            aria-label={`${label}: ${list.length ? `${list.length} ${list.length === 1 ? "entry" : "entries"}, ${hm(minutes)}` : "no time"}${open ? "" : ", locked"}`}
            title={!open && list.length ? "This day is submitted. Reopen it to make changes." : undefined}>
            {minutes ? hm(minutes, true) : ""}{list.length > 1 && <sup>{list.length}</sup>}
          </button>
        ) : (
          <input
            className={`${s.cellInput} ${saving ? s.saving : ""} ${draft ? s.draft : ""}`}
            aria-label={label}
            data-row={row.key}
            data-date={date}
            inputMode="decimal"
            placeholder="–"
            value={val}
            disabled={saving}
            title={draft ? "Draft: press Enter or leave the cell to save" : list[0] ? `${list[0].startTime && list[0].endTime ? `${list[0].startTime}–${list[0].endTime}` : ""}${list[0].description ? ` · ${list[0].description}` : ""}` : "Type hours, e.g. 2 or 1h 30m"}
            onFocus={(e) => { focused.current = true; e.target.select(); }}
            onChange={(e) => setVal(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") { setVal(shown); focused.current = false; (e.target as HTMLInputElement).blur(); }
            }}
          />
        )}
        {items.length > 0 && (list.length > 0 || open) && (
          <Menu placement="bottom-end" width={280} items={items} trigger={
            <button type="button" className={s.cellMenu} aria-label={`Entries for ${label}`}><MoreVertical size={12} /></button>
          } />
        )}
      </div>
      {confirm && (
        <ConfirmDialog open onClose={() => setConfirm(null)} onConfirm={() => remove(confirm)} danger confirmLabel="Delete entry"
          title="Delete this entry?" description={`${hm(confirm.minutes)} on ${fmtDate(date)}${confirm.description ? `: “${confirm.description}”` : ""}. This can't be undone.`} />
      )}
    </td>
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

export function StatusLegend() {
  return (
    <div className={s.legend} aria-label="Day status legend">
      {(["SAVED", "SUBMITTED", "APPROVED", "FAILED", "REJECTED"] as const).map((k) => (
        <Tooltip key={k} content={DAY_STATUS[k].hint}><span className={`${s.dayStatus} ${s["st_" + k]}`}>{LOCKED.includes(k) && <Lock size={9} />}{DAY_STATUS[k].label}</span></Tooltip>
      ))}
    </div>
  );
}
