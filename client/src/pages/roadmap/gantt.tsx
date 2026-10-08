import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronDown, ChevronRight, Diamond, Layers } from "lucide-react";
import { Avatar, Badge, Tooltip } from "@/components/arc";
import { HEALTH_META, ProjectDot, StatusIcon } from "@/components/app/icons";
import { addDays, daysBetween, fmtDate, today } from "@/lib/format";
import { headerTicks, PX_PER_DAY, type Zoom } from "./scale";
import type { RTask, Row } from "./types";
import s from "./roadmap.module.css";

export const LEFT = 320;
export const ROW_H = 34;

export type Target = { kind: "project" | "sub"; id: number; start: string | null; end: string | null } | { kind: "task"; id: number; start: string | null; end: string | null };
type Mode = "move" | "start" | "end";
interface Drag { key: string; target: Target; mode: Mode; x0: number; s0: string; e0: string; delta: number; moved: boolean }

/** Bar extent for an item; single-date items become one-day bars. */
const span = (a: string | null, b: string | null): [string, string] | null => (a || b ? [a ?? b!, b ?? a!] : null);

export function Gantt({ rows, zoom, start, end, canEdit, deps, onToggle, onCommit, onOpenTask, scrollToToday }: {
  rows: Row[]; zoom: Zoom; start: string; end: string; canEdit: boolean;
  deps: { from: number; to: number; conflict: boolean }[];
  onToggle: (key: string) => void; onCommit: (t: Target, start: string | null, end: string | null) => void; onOpenTask: (id: number) => void; scrollToToday: number;
}) {
  const nav = useNavigate();
  const ppd = PX_PER_DAY[zoom];
  const total = daysBetween(start, end) + 1;
  const W = Math.ceil(total * ppd);
  const x = (d: string) => daysBetween(start, d) * ppd;
  const ticks = useMemo(() => headerTicks(zoom, start, end), [zoom, start, end]);
  const scroller = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const t0 = today();

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, x(t0) - (el.clientWidth - LEFT) / 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, start, scrollToToday]);

  // Live extent while dragging.
  const extent = (key: string, a: string | null, b: string | null): [string, string] | null => {
    const sp = span(a, b);
    if (!sp || !drag || drag.key !== key) return sp;
    const d = drag.delta;
    if (drag.mode === "move") return [addDays(sp[0], d), addDays(sp[1], d)];
    if (drag.mode === "start") { const ns = addDays(sp[0], d); return [ns > sp[1] ? sp[1] : ns, sp[1]]; }
    const ne = addDays(sp[1], d); return [sp[0], ne < sp[0] ? sp[0] : ne];
  };

  const down = (e: React.PointerEvent, key: string, target: Target, mode: Mode) => {
    if (!canEdit || e.button !== 0) return;
    const sp = span(target.start, target.end);
    if (!sp) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ key, target, mode, x0: e.clientX, s0: sp[0], e0: sp[1], delta: 0, moved: false });
  };
  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.x0;
    const delta = Math.round(dx / ppd);
    if (delta !== drag.delta || (!drag.moved && Math.abs(dx) > 3)) setDrag({ ...drag, delta, moved: drag.moved || Math.abs(dx) > 3 });
  };
  const up = () => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (!d.moved || d.delta === 0) {
      if (d.target.kind === "task" && !d.moved) onOpenTask(d.target.id);
      return;
    }
    const t = d.target;
    if (t.kind === "task") {
      // Tasks with only a due date keep startDate empty when moved; a left-edge drag gives them one.
      const startD = d.mode === "end" ? t.start : t.start || d.mode === "start" ? addDays(d.s0, d.delta) : null;
      const endD = d.mode === "start" ? t.end : addDays(d.e0, d.delta);
      const sFix = startD && endD && startD > endD ? endD : startD;
      onCommit(t, sFix, endD);
    } else {
      const ns = d.mode === "end" ? t.start ?? d.s0 : addDays(d.s0, d.delta);
      const ne = d.mode === "start" ? t.end ?? d.e0 : addDays(d.e0, d.delta);
      onCommit(t, ns > ne ? ne : ns, ne);
    }
  };
  const handlers = { onPointerMove: move, onPointerUp: up, onPointerCancel: () => setDrag(null) };

  const bar = (key: string, target: Target, cls: string, style: React.CSSProperties, content: ReactNode, tip: string) => {
    const ex = extent(key, target.start, target.end);
    if (!ex) return null;
    const left = x(ex[0]), width = Math.max(ppd, (daysBetween(ex[0], ex[1]) + 1) * ppd);
    const editing = drag?.key === key && drag.moved;
    return (
      <div className={`${s.barWrap} ${editing ? s.dragging : ""}`} style={{ left, width }}>
        <Tooltip content={editing ? `${fmtDate(ex[0], true)} → ${fmtDate(ex[1], true)}` : tip} delay={editing ? 0 : 400}>
          <div data-bar={key} className={`${cls} ${canEdit ? s.editable : ""}`} style={style} onPointerDown={(e) => down(e, key, target, "move")} {...handlers}>
            {content}
          </div>
        </Tooltip>
        {canEdit && (
          <>
            <span className={`${s.handle} ${s.handleL}`} onPointerDown={(e) => down(e, key, target, "start")} {...handlers} aria-label="Change start date" />
            <span className={`${s.handle} ${s.handleR}`} onPointerDown={(e) => down(e, key, target, "end")} {...handlers} aria-label="Change end date" />
          </>
        )}
        {editing && <span className={s.dragLabel}>{fmtDate(ex[0])} – {fmtDate(ex[1])}</span>}
      </div>
    );
  };

  // Rows by task id for dependency lines.
  const taskRow = new Map<number, { i: number; t: RTask }>();
  rows.forEach((r, i) => { if (r.kind === "task") taskRow.set(r.task.id, { i, t: r.task }); });
  const lines = deps.flatMap((d) => {
    const a = taskRow.get(d.from), b = taskRow.get(d.to);
    if (!a || !b) return [];
    const ea = extent(`t${a.t.id}`, a.t.startDate, a.t.dueDate), eb = extent(`t${b.t.id}`, b.t.startDate, b.t.dueDate);
    if (!ea || !eb) return [];
    const x1 = x(ea[1]) + ppd, y1 = a.i * ROW_H + ROW_H / 2;
    const x2 = x(eb[0]), y2 = b.i * ROW_H + ROW_H / 2;
    const mid = y1 + (y2 > y1 ? ROW_H / 2 : -ROW_H / 2);
    const path = x2 - 8 >= x1 + 8
      ? `M${x1},${y1} H${x1 + 8} V${y2} H${x2 - 2}`
      : `M${x1},${y1} H${x1 + 8} V${mid} H${x2 - 10} V${y2} H${x2 - 2}`;
    const live = drag && (drag.key === `t${a.t.id}` || drag.key === `t${b.t.id}`);
    const conflict = live ? ea[1] >= eb[0] : d.conflict;
    return [{ key: `${d.from}-${d.to}`, path, conflict }];
  });

  return (
    <div className={s.scroller} ref={scroller}>
      <div className={s.canvas} style={{ width: LEFT + W }}>
        <div className={s.head}>
          <div className={s.corner}><Layers size={13} className="faint" /> Initiative / project / task</div>
          <div className={s.ticks} style={{ width: W }}>
            <div className={s.tierTop}>{ticks.top.map((t) => <div key={t.x} className={s.tickTop} style={{ left: t.x, width: t.w }}><span>{t.label}</span></div>)}</div>
            <div className={s.tierBottom}>{ticks.bottom.map((t) => <div key={t.x} className={`${s.tick} ${t.weekend ? s.weekend : ""} ${t.strong ? s.tickStrong : ""}`} style={{ left: t.x, width: t.w }}>{t.w >= 18 ? t.label : ""}</div>)}</div>
          </div>
        </div>
        <div className={s.body} style={{ height: rows.length * ROW_H }}>
          <div className={s.grid} style={{ left: LEFT, width: W }}>
            {ticks.bottom.map((t) => <div key={t.x} className={`${s.gridLine} ${t.weekend ? s.weekendCol : ""}`} style={{ left: t.x, width: t.w }} />)}
          </div>
          {t0 >= start && t0 <= end && <div className={s.today} style={{ left: LEFT + x(t0) + ppd / 2 }}><span>Today</span></div>}
          <svg className={s.deps} style={{ left: LEFT }} width={W} height={rows.length * ROW_H} aria-hidden>
            <defs>
              <marker id="rm-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="var(--text-3)" /></marker>
              <marker id="rm-arrow-red" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="var(--red)" /></marker>
            </defs>
            {lines.map((l) => <path key={l.key} d={l.path} fill="none" stroke={l.conflict ? "var(--red)" : "var(--text-3)"} strokeWidth={l.conflict ? 1.6 : 1.2} strokeDasharray={l.conflict ? "0" : "0"} markerEnd={`url(#${l.conflict ? "rm-arrow-red" : "rm-arrow"})`} opacity={l.conflict ? 1 : 0.7} />)}
          </svg>
          {rows.map((r) => (
            <div key={r.key} className={`${s.row} ${r.kind === "initiative" ? s.rowInit : ""} ${r.kind === "project" ? s.rowProject : ""}`} style={{ height: ROW_H }}>
              <div className={s.left} style={{ width: LEFT }}>{leftCell(r, onToggle, nav, onOpenTask)}</div>
              <div className={s.lane} style={{ width: W }}>
                {r.kind === "initiative" && r.start && r.end && (
                  <div className={s.initLine} style={{ left: x(r.start), width: Math.max(2, (daysBetween(r.start, r.end) + 1) * ppd), background: r.color }} />
                )}
                {r.kind === "project" && (() => {
                  const p = r.project;
                  const target: Target = { kind: "project", id: p.id, start: p.startDate, end: p.endDate };
                  return (
                    <>
                      {bar(`p${p.id}`, target, s.projectBar, { borderColor: p.color, ["--c" as string]: p.color },
                        <><span className={s.progress} style={{ width: `${Math.round(p.progress * 100)}%` }} /><span className={s.barText}>{p.name}</span></>,
                        `${p.name} · ${fmtDate(p.startDate, true)} → ${fmtDate(p.endDate, true)} · ${Math.round(p.progress * 100)}% done`)}
                      {!r.open && p.milestones.map((m) => <MilestoneMark key={m.id} left={x(m.date)} ppd={ppd} color={p.color} m={m} />)}
                    </>
                  );
                })()}
                {r.kind === "sub" && bar(`s${r.sub.id}`, { kind: "sub", id: r.sub.id, start: r.sub.startDate, end: r.sub.endDate }, s.subBar,
                  { borderColor: r.parent.color, ["--c" as string]: r.parent.color }, <span className={s.barText}>{r.sub.name}</span>,
                  `${r.sub.name} · ${fmtDate(r.sub.startDate, true)} → ${fmtDate(r.sub.endDate, true)}`)}
                {r.kind === "milestones" && r.project.milestones.map((m, i, all) => {
                  // Label only when it fits before the next marker.
                  const next = all[i + 1];
                  const room = next ? x(next.date) - x(m.date) : Infinity;
                  return <MilestoneMark key={m.id} left={x(m.date)} ppd={ppd} color={r.project.color} m={m} label={room > m.name.length * 6.2 + 18} />;
                })}
                {r.kind === "task" && (() => {
                  const t = r.task;
                  const ex = extent(`t${t.id}`, t.startDate, t.dueDate);
                  return (
                    <>
                      {bar(`t${t.id}`, { kind: "task", id: t.id, start: t.startDate, end: t.dueDate },
                        `${s.taskBar} ${t.status === "DONE" ? s.done : ""} ${t.conflict ? s.conflict : ""}`, { ["--c" as string]: r.color }, null,
                        `${t.key} ${t.title} · ${t.startDate ? fmtDate(t.startDate) + " → " : "due "}${fmtDate(t.dueDate)}${t.conflict ? " · dependency conflict" : ""}`)}
                      {ex && <span className={`${s.taskLabel} ${t.overdue ? "danger" : ""}`} style={{ left: x(ex[1]) + Math.max(ppd, 1) + 6 }}>{t.title}</span>}
                    </>
                  );
                })()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MilestoneMark({ left, ppd, color, m, label }: { left: number; ppd: number; color: string; m: { name: string; date: string; done: boolean }; label?: boolean }) {
  return (
    <Tooltip content={`${m.name} · ${fmtDate(m.date, true)}${m.done ? " · done" : ""}`}>
      <div className={s.milestone} style={{ left: left + ppd / 2 }}>
        <span className={s.diamond} style={{ borderColor: color, background: m.done ? color : "var(--bg)" }} />
        {label && <span className={s.msLabel}>{m.name}</span>}
      </div>
    </Tooltip>
  );
}

function leftCell(r: Row, onToggle: (k: string) => void, nav: (p: string) => void, openTask: (id: number) => void) {
  const chev = (open: boolean, key: string) => (
    <button className={s.chev} onClick={(e) => { e.stopPropagation(); onToggle(key); }} aria-label={open ? "Collapse" : "Expand"}>
      {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
    </button>
  );
  switch (r.kind) {
    case "initiative":
      return <div className={s.cell} onClick={() => onToggle(r.key)}>{chev(r.open, r.key)}<span className="swatch" style={{ background: r.color }} /><span className="medium ellipsis">{r.name}</span><span className="faint small">{r.count}</span></div>;
    case "project": {
      const p = r.project, h = HEALTH_META[p.health] ?? HEALTH_META.NONE;
      return (
        <div className={s.cell} style={{ paddingLeft: 14 }}>
          {chev(r.open, r.key)}<ProjectDot color={p.color} />
          <span className={`medium ellipsis ${s.linky}`} onClick={() => nav(`/projects/${p.id}`)}>{p.name}</span>
          <div className="grow" />
          {p.reasons.some((x) => x.includes("dependency")) && <Tooltip content={p.reasons.join(" · ")}><AlertTriangle size={13} className="danger" /></Tooltip>}
          <Tooltip content={p.reasons.length ? p.reasons.join(" · ") : "No issues"}><span><Badge size="sm" tone={h.tone} dot>{h.label}</Badge></span></Tooltip>
        </div>
      );
    }
    case "sub":
      return <div className={s.cell} style={{ paddingLeft: 32 }}>{chev(r.open, r.key)}<span className={s.subDot} style={{ borderColor: r.parent.color }} /><span className="ellipsis">{r.sub.name}</span><span className="faint small">{r.count}</span></div>;
    case "milestones":
      return <div className={s.cell} style={{ paddingLeft: 52 }}><Diamond size={12} className="faint" /><span className="muted small">Milestones</span><span className="faint small">{r.project.milestones.filter((m) => m.done).length}/{r.project.milestones.length} reached</span></div>;
    case "task": {
      const t = r.task;
      return (
        <div className={`${s.cell} ${s.taskCell}`} style={{ paddingLeft: 30 + r.depth * 18 }} onClick={() => openTask(t.id)}>
          <StatusIcon status={t.status} size={13} />
          <span className="faint tiny num" style={{ width: 52, flexShrink: 0 }}>{t.key}</span>
          <span className={`ellipsis ${t.status === "DONE" ? "faint" : ""}`}>{t.title}</span>
          <div className="grow" />
          {t.conflict && <Tooltip content="Starts before a blocking task is due"><AlertTriangle size={12} className="danger" /></Tooltip>}
          {t.assignee && <Avatar name={t.assignee.name} size={16} title={t.assignee.name} />}
        </div>
      );
    }
  }
}
