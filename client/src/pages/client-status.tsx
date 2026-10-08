import { useParams } from "react-router-dom";
import { CheckCircle2, Diamond, Link2Off } from "lucide-react";
import { Badge, EmptyState, Loading, type BadgeTone } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { dueLabel, fmtDate, titleCase } from "@/lib/format";
import s from "./client-status.module.css";

interface PublicStatus {
  company: { name: string; color: string };
  project: { name: string; description?: string | null; status: string; startDate?: string | null; endDate?: string | null; client?: string | null };
  progress: number;
  health: string;
  milestones: { name: string; date: string; done: boolean }[];
  recentlyCompleted: { title: string; at?: string | null }[];
}

const HEALTH_TONE: Record<string, BadgeTone> = { "On track": "green", "Watching closely": "yellow", "Needs attention": "red" };

/** Public, read-only project status for clients. Shows progress and delivery only: never hours or money. */
export default function ClientStatus() {
  const { token = "" } = useParams();
  const { data, error, loading } = useApi<PublicStatus>(`/public/client/${encodeURIComponent(token)}`);

  if (loading) return <div className={s.screen}><Loading label="Loading project status…" /></div>;
  if (error || !data) {
    return (
      <div className={s.screen}>
        <div className={s.wrap}>
          <div className={s.card}>
            <EmptyState icon={<Link2Off size={28} />} title="This link isn't active" description={error?.message ?? "Ask your project contact for a new status link."} />
          </div>
        </div>
      </div>
    );
  }

  const { company, project, milestones, recentlyCompleted } = data;
  const pct = Math.round(Math.max(0, Math.min(1, data.progress)) * 100);
  const nextMs = milestones.find((m) => !m.done);

  return (
    <div className={s.screen}>
      <div className={s.wrap}>
        <div className={s.brand}>
          <span className={s.logo} style={{ background: company.color }}>{company.name[0]}</span>
          {company.name}
          <span className="faint" style={{ fontWeight: 400 }}>· Project status</span>
        </div>

        <section className={`${s.card} ${s.hero}`}>
          <div className="row between wrap" style={{ alignItems: "flex-start" }}>
            <div className="col" style={{ gap: 2 }}>
              {project.client && <span className="small faint">{project.client}</span>}
              <h1 className={s.title}>{project.name}</h1>
            </div>
            <div className="row gap-4">
              <Badge tone="gray">{titleCase(project.status)}</Badge>
              <Badge tone={HEALTH_TONE[data.health] ?? "gray"} dot>{data.health}</Badge>
            </div>
          </div>
          {project.description && <p className={s.desc}>{project.description}</p>}
          <div className={s.progressRow} aria-label={`${pct}% complete`}>
            <div className={s.bar}><span style={{ width: `${pct}%` }} /></div>
            <span className={s.pct}>{pct}%</span>
          </div>
          <div className={s.meta}>
            {project.startDate && <span>Started <b>{fmtDate(project.startDate, true)}</b></span>}
            {project.endDate && <span>Target <b>{fmtDate(project.endDate, true)}</b></span>}
            {nextMs && <span>Next milestone <b>{nextMs.name}</b> · {fmtDate(nextMs.date)}</span>}
          </div>
        </section>

        <section className={s.card}>
          <div className={s.sectionHead}>Milestones</div>
          {milestones.length === 0 && <EmptyState compact title="No milestones yet" />}
          {milestones.map((m) => {
            const late = !m.done && dueLabel(m.date).includes("overdue");
            return (
              <div key={m.name + m.date} className={s.row}>
                <span className={s.ms}>
                  {m.done ? <CheckCircle2 size={14} color="var(--accent)" /> : <Diamond size={12} color={late ? "var(--red)" : "var(--text-3)"} strokeWidth={2} />}
                </span>
                <span className={`grow ${m.done ? "muted" : ""}`}>{m.name}</span>
                <span className={`small num ${late ? "danger" : "faint"}`}>{m.done ? "Done" : late ? "Running late" : ""}</span>
                <span className="small num muted" style={{ width: 90, textAlign: "right" }}>{fmtDate(m.date, true)}</span>
              </div>
            );
          })}
        </section>

        <section className={s.card}>
          <div className={s.sectionHead}>Recently completed</div>
          {recentlyCompleted.length === 0 && <EmptyState compact title="Nothing completed yet" description="Completed work will appear here." />}
          {recentlyCompleted.map((t, i) => (
            <div key={i} className={s.row}>
              <CheckCircle2 size={14} color="var(--green)" style={{ flexShrink: 0 }} />
              <span className="grow ellipsis">{t.title}</span>
              {t.at && <span className="small faint num">{fmtDate(t.at.slice(0, 10), true)}</span>}
            </div>
          ))}
        </section>

        <p className={s.foot}>Shared by {company.name}. This page updates automatically as work is completed.</p>
      </div>
    </div>
  );
}
