import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Avatar, Button, Combobox, ErrorState, IconButton, Loading, SegmentedControl, Sheet, toast } from "@/components/arc";
import { Page } from "@/components/app/page";
import { useShell } from "@/components/app/shell-context";
import { patch } from "@/lib/api";
import { invalidate, useApi, useLocal } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import { addDays, fmtDate, fmtDay, hm, monthEnd, monthName, monthStart, range, today, weekStart } from "@/lib/format";
import { useOptions } from "../time/time-utils";
import { bucketize, type CalData, type Layers } from "./calendar-data";
import { CalendarGrid } from "./calendar-grid";
import { DayDetail } from "./day-detail";
import s from "./calendar.module.css";

type View = "month" | "week" | "day";
const LAYERS: { key: keyof Layers; label: string; swatch: string }[] = [
  { key: "time", label: "Time", swatch: "var(--accent)" },
  { key: "tasks", label: "Tasks", swatch: "var(--text-3)" },
  { key: "milestones", label: "Milestones", swatch: "var(--purple)" },
  { key: "leave", label: "Leave & holidays", swatch: "var(--green)" },
];

export default function CalendarPage() {
  const { me, can } = useMe();
  const shell = useShell();
  const [params, setParams] = useSearchParams();
  const view = (["month", "week", "day"].includes(params.get("view") ?? "") ? params.get("view") : "month") as View;
  const date = params.get("date") || today();
  const startsOn = me.company.weekStartsOn || 1;
  const viewAll = can("timesheetsView", "all");
  const who = viewAll ? params.get("user") ?? String(me.user.id) : String(me.user.id);
  const isMe = who === String(me.user.id);
  const [layers, setLayers] = useLocal<Layers>("calendar.layers", { time: true, tasks: true, milestones: true, leave: true });
  const [openDay, setOpenDay] = useState<string | null>(null);
  const { data: options } = useOptions();

  const days = useMemo(() => {
    if (view === "day") return [date];
    if (view === "week") { const w = weekStart(date, startsOn); return range(w, addDays(w, 6)); }
    const first = weekStart(monthStart(date), startsOn);
    const last = addDays(weekStart(monthEnd(date), startsOn), 6);
    return range(first, last);
  }, [view, date, startsOn]);

  const q = useApi<CalData>("/calendar", { from: days[0], to: days[days.length - 1], userId: isMe ? undefined : who });
  const buckets = useMemo(() => bucketize(q.data, days), [q.data, days]);
  const workDays = useMemo(() => new Set(me.company.workWeek.split(",").map(Number)), [me.company.workWeek]);
  const canReschedule = !!q.data?.canReschedule;
  const showUser = who === "all";
  const canLog = isMe;

  const set = (patchQ: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patchQ)) { if (v === null) p.delete(k); else p.set(k, v); }
    setParams(p, { replace: true });
  };
  const step = (dir: number) => {
    if (view === "day") set({ date: addDays(date, dir) });
    else if (view === "week") set({ date: addDays(date, 7 * dir) });
    else { const d = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1 + dir, 1); set({ date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01` }); }
  };
  const reload = () => { q.reload(); invalidate("/tasks"); };

  const moveTask = async (id: number, d: string) => {
    const t = q.data?.tasks.find((x) => x.id === id);
    if (!t || t.dueDate === d) return;
    try {
      await patch(`/tasks/${id}`, { dueDate: d });
      toast.success(`Moved ${t.key} to ${fmtDate(d)}`, { action: t.dueDate ? { label: "Undo", onClick: () => { patch(`/tasks/${id}`, { dueDate: t.dueDate }).then(reload).catch(toast.error); } } : undefined });
      reload();
    } catch (e) { toast.error(e); }
  };

  const title = view === "month" ? monthName(date) : view === "week" ? `${fmtDate(days[0])} – ${fmtDate(days[6], true)}` : `${fmtDay(date)}, ${monthName(date)}`;
  const totalMin = days.reduce((a, d) => a + (view === "month" && d.slice(0, 7) !== date.slice(0, 7) ? 0 : buckets[d].minutes), 0);
  const userOptions = [
    ...(viewAll ? [{ value: "all", label: "Everyone" }] : []),
    ...(options?.users ?? []).map((u) => ({ value: String(u.id), label: u.id === me.user.id ? `${u.name} (you)` : u.name, icon: <Avatar name={u.name} size={16} />, keywords: u.email })),
  ];

  return (
    <Page
      title="Calendar"
      icon={<CalendarDays size={15} className="faint" />}
      actions={canLog ? <Button size="sm" icon={<Plus size={14} />} onClick={() => shell.logTime({ date: view === "day" ? date : today() }, reload)}>Log time</Button> : undefined}
      toolbar={
        <>
          <IconButton size="sm" variant="secondary" label="Previous" icon={<ChevronLeft size={14} />} onClick={() => step(-1)} />
          <IconButton size="sm" variant="secondary" label="Next" icon={<ChevronRight size={14} />} onClick={() => step(1)} />
          <Button size="sm" variant="ghost" onClick={() => set({ date: null })}>Today</Button>
          <span className={s.title}>{title}</span>
          <span className="small muted num">{totalMin ? `${hm(totalMin)} logged` : ""}</span>
          <span className="grow" />
          <div className={s.legend}>
            {LAYERS.map((l) => (
              <button key={l.key} type="button" aria-pressed={layers[l.key]} className={`${s.toggle} ${layers[l.key] ? s.on : ""}`} onClick={() => setLayers({ ...layers, [l.key]: !layers[l.key] })}>
                <span className="dot" style={{ background: layers[l.key] ? l.swatch : "var(--border-strong)", width: 6, height: 6 }} />{l.label}
              </button>
            ))}
          </div>
          {viewAll && <div style={{ width: 190 }}><Combobox size="sm" options={userOptions} value={who} onChange={(v) => set({ user: v && v !== String(me.user.id) ? v : null })} aria-label="Whose calendar" searchPlaceholder="Search people…" /></div>}
          <SegmentedControl<View> aria-label="Calendar view" value={view} onChange={(v) => set({ view: v === "month" ? null : v })} options={[{ value: "month", label: "Month" }, { value: "week", label: "Week" }, { value: "day", label: "Day" }]} />
        </>
      }
    >
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} />
        : !q.data ? <Loading />
        : view === "day" ? (
          <div className={s.dayList}>
            <DayDetail date={date} bucket={buckets[date]} canReschedule={canReschedule} showUser={showUser} canLog={canLog} onChanged={reload} />
          </div>
        ) : (
          <CalendarGrid
            days={days} view={view} month={view === "month" ? date.slice(0, 7) : undefined} buckets={buckets} layers={layers} workDays={workDays}
            canReschedule={canReschedule} showUser={showUser} onOpenDay={setOpenDay} onMoveTask={moveTask}
          />
        )}
      <Sheet
        open={!!openDay} onClose={() => setOpenDay(null)} width={520}
        title={openDay ? `${fmtDay(openDay)}, ${monthName(openDay)}` : ""}
        actions={openDay ? <Button size="sm" variant="ghost" onClick={() => { set({ view: "day", date: openDay }); setOpenDay(null); }}>Open day view</Button> : undefined}
      >
        {openDay && buckets[openDay] && (
          <div style={{ padding: "4px 0" }}>
            <DayDetail date={openDay} bucket={buckets[openDay]} canReschedule={canReschedule} showUser={showUser} canLog={canLog} onChanged={reload} />
          </div>
        )}
      </Sheet>
    </Page>
  );
}
