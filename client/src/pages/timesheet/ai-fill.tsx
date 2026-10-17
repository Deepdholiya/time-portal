import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button, Checkbox, Dialog, toast } from "@/components/ui";
import { ProjectDot } from "@/components/app/icons";
import { AiPromptBar } from "@/components/app/ai-button";
import { post } from "@/lib/api";
import { dayName, fmtDate, hm } from "@/lib/format";
import s from "@/components/app/ai-plan.module.css";

interface Suggestion { date: string; projectId: number; taskId: number | null; project: string; color: string; task: string | null; minutes: number; billable: boolean; description: string }
interface Fill { suggestions: Suggestion[]; summary: string; source: "claude" | "template"; target: number }

/**
 * "Fill with AI" for the timesheet: proposes entries for the open working days in the range that are short of the daily target,
 * based on recent work and tasks in progress. The person unticks what they didn't do, edits descriptions, and adds the rest.
 */
export function AiFillDialog({ open, range, onClose, onAdded }: { open: boolean; range: { from: string; to: string }; onClose: () => void; onAdded: () => void }) {
  const [data, setData] = useState<Fill | null>(null);
  const [keep, setKeep] = useState<boolean[]>([]);
  const [saving, setSaving] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  const run = (instructions?: string) => {
    setBusy(true);
    post<Fill>("/ai/timesheet-fill", { ...range, instructions: instructions?.trim() || undefined })
      .then((r) => { setData(r); setKeep(r.suggestions.map(() => true)); })
      .catch((e) => { toast.error(e); if (!data) onClose(); })
      .finally(() => setBusy(false));
  };
  useEffect(() => {
    if (!open) return;
    setData(null); setPrompt("");
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, range.from, range.to]);

  const edit = (i: number, description: string) => setData((d) => d && { ...d, suggestions: d.suggestions.map((x, k) => (k === i ? { ...x, description } : x)) });
  const picked = data?.suggestions.filter((_, i) => keep[i]) ?? [];
  const total = picked.reduce((a, x) => a + x.minutes, 0);

  const add = async () => {
    setSaving(true);
    let ok = 0;
    const failed: string[] = [];
    for (const x of picked) {
      try {
        await post("/time", { date: x.date, projectId: x.projectId, taskId: x.taskId, minutes: x.minutes, description: x.description.trim() || (x.task ?? x.project), billable: x.billable });
        ok++;
      } catch (e) { failed.push(`${fmtDate(x.date)}: ${e instanceof Error ? e.message : "couldn't save"}`); }
    }
    setSaving(false);
    if (ok) toast.success(`Added ${ok} ${ok === 1 ? "entry" : "entries"}`, { description: failed.length ? `${failed.length} skipped. ${failed[0]}` : `${hm(total)} logged` });
    else if (failed.length) toast.error(failed[0]);
    onAdded();
    onClose();
  };

  let lastDate = "";
  return (
    <Dialog
      open={open} onClose={onClose} size="lg" title="Fill timesheet with AI"
      description="Suggestions for the working days that are short of your daily target. Untick anything you didn't do."
      footer={data?.suggestions.length ? (
        <>
          <span className="small muted grow">{picked.length} of {data.suggestions.length} selected · <span className="num">{hm(total)}</span></span>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} disabled={!picked.length} onClick={add}>Add {picked.length} {picked.length === 1 ? "entry" : "entries"}</Button>
        </>
      ) : <Button variant="secondary" onClick={onClose}>Close</Button>}
    >
      <AiPromptBar
        value={prompt} onChange={setPrompt} onRun={() => run(prompt)} busy={busy}
        placeholder="e.g. Only Bridge UX, 6 hours a day, skip Friday"
        suggestions={["Only billable work", "6 hours a day", "Mostly my tasks in progress", "Skip Friday"]}
      />
      {!data || busy ? (
        <>
          <div className={s.thinking}><Sparkles size={14} /> Looking at your recent work…</div>
          <div className={s.loading}>{[0, 1, 2, 3].map((i) => <div key={i} className={s.shimmer} style={{ animationDelay: `${i * 0.1}s` }} />)}</div>
        </>
      ) : (
        <>
          <div className={s.summary}><Sparkles size={14} /><div>{data.summary}<span className={s.source}>{data.source === "claude" ? "Descriptions written by Claude" : "Built from your recent entries"}</span></div></div>
          {data.suggestions.length > 0 && (
            <div className={s.list}>
              {data.suggestions.map((x, i) => {
                const head = x.date !== lastDate ? <div className={s.group}>{dayName(x.date)} {fmtDate(x.date)}</div> : null;
                lastDate = x.date;
                return (
                  <div key={i}>
                    {head}
                    <div className={`${s.item} ${keep[i] ? "" : s.off}`} style={{ "--i": i } as React.CSSProperties}>
                      <Checkbox checked={!!keep[i]} onChange={(v) => setKeep((k) => k.map((y, j) => (j === i ? v : y)))} aria-label={`Keep ${x.task ?? x.project} on ${x.date}`} />
                      <div className={s.main}>
                        <div className={s.title}><ProjectDot color={x.color} /><span>{x.task ?? x.project}</span></div>
                        {x.task && <div className={s.meta}>{x.project}</div>}
                        <input className={s.desc} value={x.description} onChange={(e) => edit(i, e.target.value)} aria-label="Description" />
                      </div>
                      <div className={s.right}>{hm(x.minutes)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}
