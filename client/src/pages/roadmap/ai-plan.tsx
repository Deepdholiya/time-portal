import { useEffect, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button, Checkbox, Dialog, Field, Select, toast } from "@/components/ui";
import { ProjectDot } from "@/components/app/icons";
import { patch, post } from "@/lib/api";
import { invalidate } from "@/lib/hooks";
import { fmtDate } from "@/lib/format";
import type { RProject } from "./types";
import s from "@/components/app/ai-plan.module.css";

interface Proposal { id: number; key: string; title: string; assignee: string | null; days: number; from: { startDate: string | null; dueDate: string | null }; startDate: string; dueDate: string; reason: string }
interface Plan { project: { id: number; name: string; endDate: string | null }; proposals: Proposal[]; summary: string; source: "claude" | "template"; late: boolean }

/**
 * "Plan with AI" on the roadmap: schedules a project's open tasks that have no date, are overdue, or start before their blocker
 * is due. Blockers go first, one task at a time per person, sized from the estimate. The person picks which dates to apply.
 */
export function AiPlanDialog({ open, projects, initialProjectId, onClose, onApplied }: { open: boolean; projects: RProject[]; initialProjectId?: number; onClose: () => void; onApplied: () => void }) {
  const [projectId, setProjectId] = useState<number | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [keep, setKeep] = useState<boolean[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setPlan(null); setProjectId(initialProjectId ?? projects[0]?.id ?? null); } }, [open, initialProjectId, projects]);
  useEffect(() => {
    if (!open || !projectId) return;
    let alive = true;
    setBusy(true); setPlan(null);
    post<Plan>("/ai/roadmap-plan", { projectId })
      .then((r) => { if (alive) { setPlan(r); setKeep(r.proposals.map(() => true)); } })
      .catch((e) => toast.error(e))
      .finally(() => alive && setBusy(false));
    return () => { alive = false; };
  }, [open, projectId]);

  const picked = plan?.proposals.filter((_, i) => keep[i]) ?? [];
  const apply = async () => {
    setSaving(true);
    let ok = 0;
    for (const p of picked) {
      try { await patch(`/tasks/${p.id}`, { startDate: p.startDate, dueDate: p.dueDate }); ok++; } catch (e) { toast.error(e); }
    }
    setSaving(false);
    if (ok) toast.success(`Scheduled ${ok} ${ok === 1 ? "task" : "tasks"}`, { description: plan?.project.name });
    invalidate("/tasks"); invalidate("/calendar"); invalidate("/my-tasks");
    onApplied();
    onClose();
  };

  return (
    <Dialog
      open={open} onClose={onClose} size="lg" title="Plan with AI"
      description="Dates for open tasks that have none, are overdue, or start before what blocks them. Nothing changes until you apply."
      footer={plan?.proposals.length ? (
        <>
          <span className="small muted grow">{picked.length} of {plan.proposals.length} selected</span>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} disabled={!picked.length} onClick={apply}>Apply {picked.length} {picked.length === 1 ? "date" : "dates"}</Button>
        </>
      ) : <Button variant="secondary" onClick={onClose}>Close</Button>}
    >
      <Field label="Project">
        <Select value={projectId ?? ""} onChange={(v) => setProjectId(Number(v))} options={projects.map((p) => ({ value: p.id, label: p.name }))} />
      </Field>
      <div style={{ height: 14 }} />
      {busy || !plan ? (
        <>
          <div className={s.thinking}><Sparkles size={14} /> Working out an order and dates…</div>
          <div className={s.loading}>{[0, 1, 2].map((i) => <div key={i} className={s.shimmer} style={{ animationDelay: `${i * 0.1}s` }} />)}</div>
        </>
      ) : (
        <>
          <div className={s.summary}><Sparkles size={14} /><div>{plan.summary}<span className={s.source}>{plan.source === "claude" ? "Review written by Claude" : "Built-in planner"}</span></div></div>
          {plan.proposals.length > 0 && (
            <div className={s.list}>
              {plan.proposals.map((p, i) => (
                <div key={p.id} className={`${s.item} ${keep[i] ? "" : s.off}`} style={{ "--i": i } as React.CSSProperties}>
                  <Checkbox checked={!!keep[i]} onChange={(v) => setKeep((k) => k.map((y, j) => (j === i ? v : y)))} aria-label={`Apply dates to ${p.key}`} />
                  <div className={s.main}>
                    <div className={s.title}><ProjectDot color={projects.find((x) => x.id === plan.project.id)?.color} /><span className="faint">{p.key}</span><span>{p.title}</span></div>
                    <div className={s.meta}>{p.assignee ?? "Unassigned"} · {p.reason}</div>
                  </div>
                  <div className={`${s.right} ${s.change}`}>
                    <span>{fmtDate(p.startDate)} <ArrowRight size={11} style={{ verticalAlign: -1 }} /> {fmtDate(p.dueDate)}</span>
                    {(p.from.startDate || p.from.dueDate) && <span className={s.was}>{p.from.startDate ? `${fmtDate(p.from.startDate)} → ` : "Due "}{fmtDate(p.from.dueDate)}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}
