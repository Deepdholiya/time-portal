import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail } from "lucide-react";
import { Badge, Button, EmptyState } from "@/components/arc";
import { HEALTH_META, ProjectDot } from "@/components/app/icons";
import { useSession } from "@/lib/session";
import { fmtDate, pct } from "@/lib/format";
import ClientEmailDialog from "../reports/client-email-dialog";
import type { HealthRow } from "./types";
import s from "./analytics.module.css";

/** Project health (green/yellow/red) with the reasons behind it and a client update action. */
export function HealthTable({ rows, onFocus }: { rows: HealthRow[]; onFocus: (id: number) => void }) {
  const { can } = useSession();
  const nav = useNavigate();
  const [email, setEmail] = useState<HealthRow | null>(null);
  if (!rows.length) return <EmptyState compact title="No projects" description="No projects with time in this range." />;
  return (
    <div className={s.panel}>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Project</th><th>Health</th><th>Signals</th><th className="num">Progress</th><th className="num">Tracked / est.</th>
              <th className="num">Overdue</th><th className="num">Blocked</th><th>Next milestone</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const h = HEALTH_META[p.health] ?? HEALTH_META.NONE;
              return (
                <tr key={p.id} className="clickable" onClick={() => onFocus(p.id)}>
                  <td>
                    <div className="row"><ProjectDot color={p.color} /><span className="medium">{p.name}</span></div>
                    {p.manager && <div className="faint tiny">{p.manager}</div>}
                  </td>
                  <td><Badge tone={h.tone} dot>{h.label}</Badge></td>
                  <td className="wrap-cell" style={{ maxWidth: 280 }}>
                    <div className={s.reasons}>{p.reasons.length ? p.reasons.slice(0, 3).map((r) => <Badge key={r} size="sm" variant="outline">{r}</Badge>) : <span className="faint small">No issues</span>}</div>
                  </td>
                  <td className="num">{pct(p.progress)}</td>
                  <td className="num">{Math.round(p.trackedHours)}h{p.estimatedHours ? <span className="faint"> / {p.estimatedHours}h</span> : ""}</td>
                  <td className={`num ${p.overdue ? "danger" : "faint"}`}>{p.overdue}</td>
                  <td className={`num ${p.blocked ? "warn" : "faint"}`}>{p.blocked}</td>
                  <td>{p.nextMilestone ? <span>{p.nextMilestone.name} <span className="faint">{fmtDate(p.nextMilestone.date)}</span></span> : <span className="faint">—</span>}</td>
                  <td className="right" onClick={(e) => e.stopPropagation()}>
                    <div className="row end gap-4">
                      <Button size="sm" variant="ghost" onClick={() => nav(`/projects/${p.id}`)}>Open</Button>
                      {can("clientEmail", "yes") && <Button size="sm" variant="secondary" icon={<Mail size={13} />} onClick={() => setEmail(p)}>Draft client update</Button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ClientEmailDialog open={!!email} onClose={() => setEmail(null)} projectId={email?.id ?? null} projectName={email?.name} />
    </div>
  );
}
