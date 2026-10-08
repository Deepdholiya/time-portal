import { useEffect, useState } from "react";
import { ChevronRight, ListTree } from "lucide-react";
import { Button, EmptyState, SegmentedControl, SkeletonRows } from "@/components/arc";
import { ProjectDot } from "@/components/app/icons";
import { useApi } from "@/lib/hooks";
import { hm, hours } from "@/lib/format";
import { EntriesTable, LoadError } from "./entries";
import type { Group } from "./types";
import s from "./analytics.module.css";

type Dim = "employee" | "project" | "subProject" | "task";
const FILTER_KEY: Record<Dim, string> = { employee: "userId", project: "projectId", subProject: "subProjectId", task: "taskId" };
const DIM_LABEL: Record<Dim, string> = { employee: "Employee", project: "Project", subProject: "Sub-project", task: "Task" };
const ORDERS: Record<string, Dim[]> = {
  employee: ["employee", "project", "subProject", "task"],
  project: ["project", "employee", "subProject", "task"],
};

interface Step { dim: Dim; id: string; name: string }

/**
 * Drill-down: Total → Employee → Project → Sub-project → Task → exact entries.
 * Each step adds the chosen row's id as a filter and groups by the next dimension.
 */
export function Explore({ base, ownOnly }: { base: Record<string, string>; ownOnly: boolean }) {
  const [order, setOrder] = useState<"employee" | "project">(ownOnly ? "project" : "employee");
  const [path, setPathRaw] = useState<Step[]>([]);
  const [entriesOnly, setEntriesOnly] = useState(false);
  const setPath = (p: Step[], entries = false) => { setPathRaw(p); setEntriesOnly(entries); };
  const dims = ownOnly ? ORDERS.project.filter((d) => d !== "employee") : ORDERS[order];
  const baseKey = JSON.stringify(base);
  useEffect(() => { setPathRaw([]); setEntriesOnly(false); }, [baseKey, order]);

  const query: Record<string, string> = { ...base };
  for (const st of path) query[FILTER_KEY[st.dim]] = st.id;
  const level = path.length;
  const dim = entriesOnly ? undefined : (dims[level] as Dim | undefined);
  const { data, error, loading, reload } = useApi<Group[]>(dim ? "/analytics/group" : null, { ...query, groupBy: dim });

  const total = data?.reduce((a, g) => a + g.minutes, 0) ?? 0;
  return (
    <div className={s.panel}>
      <div className={s.panelHead}>
        <ListTree size={14} className="faint" />
        <nav className={s.crumbs} aria-label="Drill-down path">
          <button className={level ? s.crumb : s.crumbCurrent} onClick={() => setPath([])}>Total time</button>
          {path.map((st, i) => (
            <span key={i} className="row gap-4">
              <ChevronRight size={13} className="faint" />
              <span className="faint small">{DIM_LABEL[st.dim]}</span>
              <button className={i === path.length - 1 ? s.crumbCurrent : s.crumb} onClick={() => setPath(path.slice(0, i + 1))}>{st.name}</button>
            </span>
          ))}
          {dim && <><ChevronRight size={13} className="faint" /><span className="faint">by {DIM_LABEL[dim].toLowerCase()}</span></>}
          {!dim && <><ChevronRight size={13} className="faint" /><span className="faint">time entries</span></>}
        </nav>
        <div className="grow" />
        {!ownOnly && (
          <SegmentedControl aria-label="Drill order" value={order} onChange={setOrder}
            options={[{ value: "employee", label: "Employee first" }, { value: "project", label: "Project first" }]} />
        )}
      </div>
      {!dim ? (
        <EntriesTable query={query} showUser={!ownOnly} />
      ) : error ? (
        <LoadError error={error} onRetry={reload} />
      ) : loading && !data ? (
        <SkeletonRows rows={6} />
      ) : !data?.length ? (
        <EmptyState compact title="No time here" description="Try a wider date range or fewer filters." />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{DIM_LABEL[dim]}</th>
                <th className="num">Hours</th>
                <th className="num">Billable</th>
                <th className="num">Non-billable</th>
                <th className="num">Share</th>
                {(dim === "task" || dim === "project" || dim === "subProject") && <><th className="num">Estimate</th><th className="num">Variance</th></>}
                <th className="num">Entries</th>
                <th style={{ width: 120 }} />
              </tr>
            </thead>
            <tbody>
              {data.map((g) => {
                const drillable = g.id !== null;
                const est = g.estimateHours ?? null;
                const varH = est != null ? g.minutes / 60 - est : null;
                return (
                  <tr key={g.key} className={drillable ? "clickable" : ""} onClick={drillable ? () => setPath([...path, { dim, id: String(g.id), name: g.name }]) : undefined}>
                    <td>
                      <div className="row">
                        {g.color && <ProjectDot color={g.color} />}
                        <span className={drillable ? "medium" : "faint"}>{g.name}</span>
                        {g.sub && <span className="faint small ellipsis">{g.sub}</span>}
                      </div>
                    </td>
                    <td className="num medium">{hm(g.minutes)}</td>
                    <td className="num">{hm(g.billableMinutes)}</td>
                    <td className="num muted">{hm(g.minutes - g.billableMinutes)}</td>
                    <td className="num muted">{total ? Math.round((g.minutes / total) * 100) : 0}%</td>
                    {(dim === "task" || dim === "project" || dim === "subProject") && (
                      <>
                        <td className="num muted">{est != null ? `${hours(est * 60)}h` : "—"}</td>
                        <td className={`num ${varH != null && varH > 0 ? "danger" : "muted"}`}>{varH != null ? `${varH > 0 ? "+" : ""}${varH.toFixed(1)}h` : "—"}</td>
                      </>
                    )}
                    <td className="num muted">{g.entries}</td>
                    <td className="right">
                      {drillable && (
                        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setPath([...path, { dim, id: String(g.id), name: g.name }], true); }}>
                          Entries
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr><td>Total</td><td className="num">{hm(total)}</td><td className="num">{hm(data.reduce((a, g) => a + g.billableMinutes, 0))}</td><td className="num">{hm(data.reduce((a, g) => a + g.minutes - g.billableMinutes, 0))}</td><td /><td colSpan={(dim === "task" || dim === "project" || dim === "subProject") ? 4 : 2} /></tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
