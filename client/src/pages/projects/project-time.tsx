import { useState } from "react";
import { Plus } from "lucide-react";
import { Avatar, Button, DateRangePicker, EmptyState, ErrorState, SkeletonRows, type DateRange } from "@/components/ui";
import { useShell } from "@/components/app/shell-context";
import { invalidate, useApi } from "@/lib/hooks";
import { addDays, fmtDate, hm, today } from "@/lib/format";
import { useMe } from "@/lib/session";
import type { ProjectDetail } from "./lib";
import s from "./projects.module.css";

type Group = { key: string; id: number | string | null; name: string; sub?: string; minutes: number; billableMinutes: number; entries: number; estimateHours?: number | null };
type Entry = { id: number; date: string; minutes: number; description: string; billable: boolean; user: { id: number; name: string }; task: string | null; taskId: number | null; subProject: string | null };

function GroupTable({ title, rows, onRow }: { title: string; rows: Group[]; onRow?: (g: Group) => void }) {
  const max = Math.max(1, ...rows.map((r) => r.minutes));
  return (
    <section>
      <div className="section-title">{title}</div>
      {!rows.length ? <p className="small faint">No time in this range.</p> : (
        <table className="table">
          <tbody>
            {rows.slice(0, 12).map((g) => (
              <tr key={g.key} className={onRow && g.id ? "clickable" : ""} onClick={() => onRow && g.id && onRow(g)}>
                <td style={{ maxWidth: 260 }}><span className="row" style={{ minWidth: 0 }}>{title.includes("person") && <Avatar name={g.name} size={18} />}<span className="ellipsis">{g.name}</span></span></td>
                <td style={{ width: "35%" }}><div className={s.bar} style={{ width: `${(g.minutes / max) * 100}%` }} /></td>
                <td className="num">{hm(g.minutes)}{g.estimateHours ? <span className="faint"> / {g.estimateHours}h</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Project time: hours by person and by task plus the exact entries, from the analytics drill-down API. */
export function ProjectTime({ p }: { p: ProjectDetail }) {
  const { can } = useMe();
  const shell = useShell();
  const [range, setRange] = useState<DateRange>({ from: p.startDate && p.startDate < today() ? p.startDate : addDays(today(), -90), to: today() });
  const scope = p.parentId ? { subProjectId: p.id } : { projectId: p.id };
  const q = { from: range.from, to: range.to, ...scope };
  const people = useApi<Group[]>("/analytics/group", { ...q, groupBy: "employee" });
  const tasks = useApi<Group[]>("/analytics/group", { ...q, groupBy: "task" });
  const entries = useApi<{ total: number; minutes: number; rows: Entry[] }>("/analytics/entries", { ...q, limit: 200 });
  const total = entries.data?.minutes ?? 0;
  const err = people.error ?? tasks.error ?? entries.error;
  const reload = () => { invalidate("/analytics"); invalidate("/projects"); };

  return (
    <div>
      <div className="page-toolbar">
        <DateRangePicker size="sm" value={range} onChange={setRange} />
        <span className="small muted num">{hm(total)} in {entries.data?.total ?? 0} entries{can("timesheetsView", "all") ? "" : " (your time)"}</span>
        <span className="grow" />
        <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => shell.logTime({ projectId: p.id }, reload)}>Log time</Button>
      </div>
      {err ? <ErrorState error={err} onRetry={reload} /> : !entries.data || !people.data || !tasks.data ? <SkeletonRows rows={8} /> : !entries.data.total ? (
        <EmptyState title="No time logged in this range" description="Pick a wider date range or log time against this project." />
      ) : (
        <div className="page-pad col" style={{ gap: 24 }}>
          <div className={s.split}>
            <GroupTable title="By person" rows={people.data} />
            <GroupTable title="By task" rows={tasks.data} onRow={(g) => shell.openTask(Number(g.id))} />
          </div>
          <section>
            <div className="section-title">Entries</div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Date</th><th>Person</th><th>Task</th><th>Description</th><th className="num">Duration</th></tr></thead>
                <tbody>
                  {entries.data.rows.map((e) => (
                    <tr key={e.id} className="clickable" onClick={() => shell.editEntry(e.id, reload)}>
                      <td className="muted">{fmtDate(e.date)}</td>
                      <td><span className="row"><Avatar name={e.user.name} size={18} />{e.user.name}</span></td>
                      <td style={{ maxWidth: 220 }}>{e.taskId ? <button type="button" className="link ellipsis" style={{ background: "none", border: 0, padding: 0, maxWidth: 220, display: "inline-block" }} onClick={(ev) => { ev.stopPropagation(); shell.openTask(e.taskId!); }}>{e.task}</button> : <span className="faint">No task</span>}</td>
                      <td className="ellipsis" style={{ maxWidth: 360 }} title={e.description}>{e.description}</td>
                      <td className="num">{hm(e.minutes)}{!e.billable && <span className="faint small"> NB</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {entries.data.total > entries.data.rows.length && <p className="small faint" style={{ marginTop: 8 }}>Showing the latest {entries.data.rows.length} of {entries.data.total} entries. Use Reports for the full export.</p>}
          </section>
        </div>
      )}
    </div>
  );
}
