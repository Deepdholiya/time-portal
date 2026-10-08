import { useState } from "react";
import { AlertTriangle, ArrowRightLeft } from "lucide-react";
import { Button, Dialog, toast } from "@/components/ui";
import { post } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import type { Impact, RTask } from "./types";
import s from "./roadmap.module.css";

/** After a task moves: lists dependents that now start before it is due and offers to shift them (AT-08). */
export function ImpactDialog({ value, onClose, onShifted }: { value: { task: RTask; items: Impact[] } | null; onClose: () => void; onShifted: () => void }) {
  const [busy, setBusy] = useState(false);
  const shift = async () => {
    if (!value) return;
    setBusy(true);
    try {
      const r = await post<{ moved: number }>(`/tasks/${value.task.id}/shift-dependents`);
      toast.success(`Shifted ${r.moved} dependent task${r.moved === 1 ? "" : "s"}`, { description: "Each now starts the day after its blocker is due." });
      onShifted();
      onClose();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <Dialog open={!!value} onClose={onClose} size="md"
      title={<span className="row"><AlertTriangle size={15} className="danger" />This move affects later work</span>}
      description={value ? `${value.task.key} "${value.task.title}" now ends after ${value.items.length} dependent task${value.items.length === 1 ? "" : "s"} start.` : undefined}
      footer={<><div className="grow" /><Button variant="ghost" onClick={onClose}>Keep dates</Button><Button variant="primary" icon={<ArrowRightLeft size={14} />} loading={busy} onClick={shift}>Shift dependents</Button></>}>
      <div className={s.impactList}>
        {value?.items.map((i) => (
          <div key={i.id} className={s.impactRow}>
            <span className="faint tiny num" style={{ width: 56 }}>{i.key}</span>
            <div className="grow">
              <div className="medium">{i.title}</div>
              <div className="small danger">{i.reason}</div>
            </div>
            <span className="small muted num">{i.startDate ? fmtDate(i.startDate) : "—"} → {fmtDate(i.dueDate)}</span>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
