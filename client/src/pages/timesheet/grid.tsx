import { useEffect, useRef, useState } from "react";
import { DollarSign, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, ConfirmDialog, IconButton, Popover, Tooltip, toast } from "@/components/ui";
import { ProjectDot } from "@/components/app/icons";
import { useShell } from "@/components/app/shell-context";
import { del, post, put } from "@/lib/api";
import { dayName, hm, parseDate, parseDuration, today } from "@/lib/format";
import type { Options, TimeEntry } from "@/lib/types";
import { ProjectTaskPicker, type Pick } from "../time/project-task-picker";
import { entryBody, type Row } from "./rows";
import s from "./timesheet.module.css";

export interface GridCtx {
  days: string[];
  userId: number;
  forOther: boolean;
  editable: boolean;
  /** Audit reason, required before editing someone else's week. */
  reason: string;
  options: Options | undefined;
  workDays: Set<number>;
  dayTags: Record<string, string>;
  onChanged: () => void;
  onAddDraft: (pick: Pick) => void;
  onUpdateDraft: (key: string, patch: Partial<Row>) => void;
  onRemoveDraft: (key: string) => void;
}

const reasonQs = (c: GridCtx) => (c.forOther && c.reason.trim() ? `?reason=${encodeURIComponent(c.reason.trim())}` : "");
const withReason = <T extends object>(c: GridCtx, body: T) => (c.forOther ? { ...body, reason: c.reason.trim() } : body);
function guard(c: GridCtx) {
  if (c.forOther && !c.reason.trim()) throw new Error("Add a reason for the change first (shown above the grid)");
}

export function TimesheetGrid({ rows, ctx }: { rows: Row[]; ctx: GridCtx }) {
  const dayTotals = ctx.days.map((d) => rows.reduce((a, r) => a + r.entries.filter((e) => e.date === d).reduce((x, e) => x + e.minutes, 0), 0));
  const total = dayTotals.reduce((a, b) => a + b, 0);
  const t = today();
  return (
    <table className={s.grid}>
      <colgroup>
        <col className={s.colProject} /><col className={s.colDesc} />
        {ctx.days.map((d) => <col key={d} className={s.colDay} />)}
        <col className={s.colTotal} /><col className={s.colAct} />
      </colgroup>
      <thead>
        <tr>
          <th>Project / task</th>
          <th>Description</th>
          {ctx.days.map((d) => {
            const off = !ctx.workDays.has(((parseDate(d).getDay() + 6) % 7) + 1);
            return (
              <th key={d} className={`${s.colDay} ${off ? s.offDay : ""}`}>
                <div className={`${s.dayHead} ${d === t ? s.today : ""}`}>
                  <span className="dn">{dayName(d)}</span>
                  <span className="dd">{Number(d.slice(8))}</span>
                  {ctx.dayTags[d] && <span className={s.dayTag} title={ctx.dayTags[d]}>{ctx.dayTags[d]}</span>}
                </div>
              </th>
            );
          })}
          <th className={s.colTotal}>Total</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => <GridRow key={r.key} row={r} ctx={ctx} />)}
        {ctx.editable && <AddRow ctx={ctx} />}
        {!rows.length && !ctx.editable && (
          <tr><td colSpan={ctx.days.length + 4} className="center faint" style={{ height: 80 }}>No time logged this week.</td></tr>
        )}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={2}>Total</td>
          {dayTotals.map((m, i) => <td key={i} className={`${s.footNum} ${m > 12 * 60 ? s.over : ""}`}>{m ? hm(m, true) : <span className="faint">0:00</span>}</td>)}
          <td className={s.rowTotal}>{hm(total, true)}</td>
          <td />
        </tr>
      </tfoot>
    </table>
  );
}

function GridRow({ row, ctx }: { row: Row; ctx: GridCtx }) {
  const [desc, setDesc] = useState(row.description);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const descRef = useRef<HTMLInputElement>(null);
  useEffect(() => setDesc(row.description), [row.description]);
  const total = row.entries.reduce((a, e) => a + e.minutes, 0);

  const saveDesc = async () => {
    const v = desc.trim();
    if (v === row.description) return;
    if (row.draft) { ctx.onUpdateDraft(row.key, { description: v }); return; }
    if (!v) { setDesc(row.description); return toast.error("A description is required"); }
    try {
      guard(ctx);
      for (const e of row.entries) await put(`/time/${e.id}`, withReason(ctx, entryBody(e, { description: v })));
      toast.success(`Updated ${row.entries.length === 1 ? "the entry" : `${row.entries.length} entries`}`);
      ctx.onChanged();
    } catch (e) { toast.error(e); setDesc(row.description); }
  };

  const toggleBillable = async () => {
    if (row.draft) return ctx.onUpdateDraft(row.key, { billable: !row.billable });
    try {
      guard(ctx);
      for (const e of row.entries) await put(`/time/${e.id}`, withReason(ctx, entryBody(e, { billable: !row.billable })));
      ctx.onChanged();
    } catch (e) { toast.error(e); }
  };

  const removeRow = async () => {
    if (row.draft) { ctx.onRemoveDraft(row.key); return; }
    setBusy(true);
    try {
      guard(ctx);
      for (const e of row.entries) await del(`/time/${e.id}${reasonQs(ctx)}`);
      toast.success("Row deleted");
      setConfirm(false);
      ctx.onChanged();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  return (
    <tr>
      <td>
        <div className={s.projectCell} title={`${row.projectLabel}${row.taskLabel ? ` · ${row.taskLabel}` : ""}`}>
          <ProjectDot color={row.color} />
          <span className="ellipsis medium" style={{ flexShrink: 0, maxWidth: row.taskLabel ? "55%" : "100%" }}>{row.leafLabel}</span>
          {row.taskLabel && <span className={`ellipsis ${s.taskLine}`}>· {row.taskKey ? `${row.taskKey} ` : ""}{row.taskLabel}</span>}
        </div>
      </td>
      <td>
        <input
          ref={descRef}
          className={`${s.descInput} ${row.draft && !desc.trim() ? s.missing : ""}`}
          aria-label={`Description for ${row.projectLabel}`}
          placeholder="What did you work on?"
          value={desc}
          disabled={!ctx.editable}
          data-row-desc={row.key}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={saveDesc}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setDesc(row.description); (e.target as HTMLInputElement).blur(); } }}
        />
      </td>
      {ctx.days.map((d) => <DayCell key={d} row={row} date={d} ctx={ctx} desc={desc} focusDesc={() => descRef.current?.focus()} />)}
      <td className={s.rowTotal}>{total ? hm(total, true) : <span className="faint">0:00</span>}</td>
      <td>
        <div className={s.rowActions}>
          <Tooltip content={row.billable ? "Billable" : "Non-billable"}>
            <IconButton size="sm" label={row.billable ? "Billable: click to make non-billable" : "Non-billable: click to make billable"} disabled={!ctx.editable}
              icon={<DollarSign size={13} color={row.billable ? "var(--accent-text)" : "var(--text-3)"} />} onClick={toggleBillable} />
          </Tooltip>
          {ctx.editable && <IconButton size="sm" label="Delete row" icon={<Trash2 size={13} />} onClick={() => (row.draft ? removeRow() : setConfirm(true))} />}
        </div>
        <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={removeRow} danger loading={busy} confirmLabel="Delete row"
          title="Delete this row?" description={`Deletes ${row.entries.length} ${row.entries.length === 1 ? "entry" : "entries"} (${hm(total)}) for “${row.description}” this week.`} />
      </td>
    </tr>
  );
}

function DayCell({ row, date, ctx, desc, focusDesc }: { row: Row; date: string; ctx: GridCtx; desc: string; focusDesc: () => void }) {
  const list = row.entries.filter((e) => e.date === date);
  const minutes = list.reduce((a, e) => a + e.minutes, 0);
  const shown = minutes ? hm(minutes, true) : "";
  const [val, setVal] = useState(shown);
  const [saving, setSaving] = useState(false);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setVal(shown); }, [shown]);
  const off = !ctx.workDays.has(((parseDate(date).getDay() + 6) % 7) + 1);

  if (list.length > 1) return <td className={`${s.dayCell} ${off ? s.offDay : ""}`}><MultiCell entries={list} row={row} date={date} ctx={ctx} /></td>;

  const commit = async () => {
    focused.current = false;
    const raw = val.trim();
    if (raw === shown) return;
    const m = raw ? parseDuration(raw) : 0;
    if (m === null || m < 0 || m > 24 * 60) { toast.error("Enter hours like 1:30, 1.5 or 90m"); setVal(shown); return; }
    if (m === minutes) { setVal(shown); return; }
    const description = desc.trim() || row.description.trim();
    setSaving(true);
    try {
      guard(ctx);
      const e = list[0];
      if (!e && m > 0) {
        if (!description) { setVal(""); focusDesc(); throw new Error("Add a description for this row first"); }
        await post("/time", { projectId: row.projectId, taskId: row.taskId, date, minutes: m, description, billable: row.billable, ...(ctx.forOther ? { userId: ctx.userId } : {}) });
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

  return (
    <td className={`${s.dayCell} ${off ? s.offDay : ""}`}>
      <input
        className={`${s.cellInput} ${saving ? s.saving : ""}`}
        aria-label={`${row.projectLabel} ${row.description} ${dayName(date)} ${date}`}
        inputMode="decimal"
        placeholder="–"
        value={val}
        disabled={!ctx.editable || saving}
        title={list[0] ? `${list[0].startTime && list[0].endTime ? `${list[0].startTime}–${list[0].endTime} · ` : ""}${list[0].description}` : undefined}
        onFocus={(e) => { focused.current = true; e.target.select(); }}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") { setVal(shown); focused.current = false; (e.target as HTMLInputElement).blur(); }
        }}
      />
    </td>
  );
}

/** A day with several entries for the row: show the sum and list them in a popover. */
function MultiCell({ entries, row, date, ctx }: { entries: TimeEntry[]; row: Row; date: string; ctx: GridCtx }) {
  const shell = useShell();
  const sum = entries.reduce((a, e) => a + e.minutes, 0);
  const remove = async (e: TimeEntry) => {
    try { guard(ctx); await del(`/time/${e.id}${reasonQs(ctx)}`); toast.success("Entry deleted"); ctx.onChanged(); } catch (err) { toast.error(err); }
  };
  return (
    <Popover
      placement="bottom-start"
      trigger={<button type="button" className={s.cellMulti} aria-label={`${entries.length} entries on ${date}, ${hm(sum)}`}>{hm(sum, true)}<sup>{entries.length}</sup></button>}
    >
      {(close) => (
        <div className={s.popList}>
          <div className="row between" style={{ padding: "0 4px 6px" }}>
            <span className="small strong">{dayName(date)} {Number(date.slice(8))} · {row.projectLabel}</span>
            <span className="small num muted">{hm(sum)}</span>
          </div>
          {entries.map((e) => (
            <div key={e.id} className={s.popRow}>
              <span className="mono faint" style={{ width: 84 }}>{e.startTime && e.endTime ? `${e.startTime}–${e.endTime}` : "—"}</span>
              <span className="grow ellipsis small">{e.description}</span>
              <span className="num medium">{hm(e.minutes, true)}</span>
              {ctx.editable && (
                <>
                  <IconButton size="sm" label="Edit entry" icon={<Pencil size={12} />} onClick={() => { close(); shell.editEntry(e.id, ctx.onChanged); }} />
                  <IconButton size="sm" label="Delete entry" icon={<Trash2 size={12} />} onClick={() => remove(e)} />
                </>
              )}
            </div>
          ))}
          {ctx.editable && (
            <div style={{ paddingTop: 6 }}>
              <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={() => { close(); shell.logTime({ date, projectId: row.projectId, taskId: row.taskId ?? undefined, userId: ctx.forOther ? ctx.userId : undefined }, ctx.onChanged); }}>Add entry</Button>
            </div>
          )}
        </div>
      )}
    </Popover>
  );
}

function AddRow({ ctx }: { ctx: GridCtx }) {
  return (
    <tr className={s.addRow}>
      <td colSpan={ctx.days.length + 4} style={{ paddingLeft: 4 }}>
        <ProjectTaskPicker
          options={ctx.options}
          value={{ projectId: null, taskId: null }}
          onChange={(v) => v.projectId && ctx.onAddDraft(v)}
          placeholder="Add row: select a project, sub-project or task"
          autoOpenLabel="Add row"
          placeholderIcon={<Plus size={14} className="faint" />}
          width={420}
        />
      </td>
    </tr>
  );
}
