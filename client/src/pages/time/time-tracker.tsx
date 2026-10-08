import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, Clock, Plus, Timer } from "lucide-react";
import { Button, EmptyState, ErrorState, SkeletonRows } from "@/components/ui";
import { Page } from "@/components/app/page";
import { useShell } from "@/components/app/shell-context";
import { useRunningTimer } from "@/components/app/timer-widget";
import { useApi } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import { addDays, hm, today, weekStart } from "@/lib/format";
import type { TimeEntry } from "@/lib/types";
import { EntryList, afterTimeChange } from "./entry-list";
import { TrackerBar, type TrackerBarHandle } from "./tracker-bar";
import { projectPath, useOptions } from "./time-utils";
import s from "./time.module.css";

export default function TimeTracker() {
  const { me } = useMe();
  const shell = useShell();
  const [params, setParams] = useSearchParams();
  const startsOn = me.company.weekStartsOn || 1;
  const thisWeek = weekStart(today(), startsOn);
  const [weekCount, setWeekCount] = useState(1);
  const from = addDays(thisWeek, -7 * (weekCount - 1));
  const to = addDays(thisWeek, 6);
  const q = useApi<TimeEntry[]>("/time", { from, to });
  const { data: options } = useOptions();
  const { data: running } = useRunningTimer();
  const bar = useRef<TrackerBarHandle>(null);

  // /time?start=1 (from the command menu or sidebar) focuses the start bar.
  useEffect(() => {
    if (params.get("start")) {
      const t = setTimeout(() => bar.current?.focus(), 50);
      params.delete("start");
      setParams(params, { replace: true });
      return () => clearTimeout(t);
    }
  }, [params, setParams]);

  const weeks = useMemo(() => Array.from({ length: weekCount }, (_, i) => addDays(thisWeek, -7 * i)), [weekCount, thisWeek]);
  // Keep showing the loaded weeks while an extra week loads.
  const last = useRef<TimeEntry[] | undefined>(undefined);
  if (q.data) last.current = q.data;
  const data = q.data ?? last.current;
  const entries = data ?? [];
  const thisWeekEntries = entries.filter((e) => e.date >= thisWeek);
  const todayMin = entries.filter((e) => e.date === today()).reduce((a, e) => a + e.minutes, 0);
  const weekMin = thisWeekEntries.reduce((a, e) => a + e.minutes, 0);
  const billMin = thisWeekEntries.reduce((a, e) => a + (e.billable ? e.minutes : 0), 0);
  const byProject = useMemo(() => {
    const m = new Map<string, { name: string; color: string; minutes: number }>();
    for (const e of thisWeekEntries) {
      const top = e.project?.parent ?? e.project;
      const k = String(top?.id);
      const g = m.get(k) ?? { name: top?.name ?? "", color: top?.color ?? "", minutes: 0 };
      g.minutes += e.minutes;
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 4);
  }, [thisWeekEntries]);
  const maxProj = byProject[0]?.minutes ?? 1;
  const capacity = me.user.weeklyCapacity * 60;

  return (
    <Page
      title="Time tracker"
      icon={<Timer size={15} className="faint" />}
      actions={<Button size="sm" icon={<Plus size={14} />} onClick={() => shell.logTime({ date: today() }, () => { afterTimeChange(); q.reload(); })}>Log time manually</Button>}
    >
      <TrackerBar ref={bar} options={options} running={running} />
      {running && <div className="small faint" style={{ margin: "6px 22px 0" }}>Tracking {projectPath(running.project)}{running.task ? ` · ${running.task.title}` : ""}. The timer keeps running while you move around the app.</div>}

      <div className={s.summary}>
        <div><div className={s.sumLabel}>Today</div><div className={s.sumValue}>{hm(todayMin)}</div></div>
        <div>
          <div className={s.sumLabel}>This week</div>
          <div className={s.sumValue}>{hm(weekMin)}</div>
          {capacity > 0 && <div className="tiny faint">of {hm(capacity)} capacity</div>}
        </div>
        <div>
          <div className={s.sumLabel}>Billable</div>
          <div className={s.sumValue}>{hm(billMin)}</div>
          {weekMin > 0 && <div className="tiny faint">{Math.round((billMin / weekMin) * 100)}% of the week</div>}
        </div>
        <div>
          <div className={s.sumLabel} style={{ marginBottom: 6 }}>By project this week</div>
          {byProject.length === 0 && <div className="small faint">Nothing tracked yet this week.</div>}
          <div className={s.projBars}>
            {byProject.map((p) => (
              <div key={p.name} className={s.projBar}>
                <span className="ellipsis">{p.name}</span>
                <span className={s.projTrack}><span style={{ width: `${(p.minutes / maxProj) * 100}%`, background: p.color }} /></span>
                <span className="num right muted">{hm(p.minutes)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={s.list}>
        {q.error ? <ErrorState error={q.error} onRetry={q.reload} />
          : !data ? <SkeletonRows rows={8} />
          : entries.length === 0 && weekCount === 1 ? (
            <EmptyState
              icon={<Clock size={26} />}
              title="No time tracked this week"
              description="Start the timer above, or log time you've already spent."
              action={<Button icon={<Plus size={14} />} onClick={() => shell.logTime({ date: today() }, () => q.reload())}>Log time</Button>}
            />
          ) : (
            <EntryList entries={entries} weeks={weeks} weekStartOf={(d) => weekStart(d, startsOn)} options={options} running={running} onChanged={q.reload} />
          )}
        {data && (
          <div className={s.loadMore}>
            <Button variant="ghost" size="sm" icon={<ChevronDown size={14} />} loading={q.loading} onClick={() => setWeekCount((n) => n + 1)}>Load previous week</Button>
          </div>
        )}
      </div>
    </Page>
  );
}
