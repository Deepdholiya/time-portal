import { Fragment, useState } from "react";
import { Check, ChevronDown, ChevronRight, LockOpen, Undo2 } from "lucide-react";
import { Avatar, Badge, Button, Checkbox, Dialog, EmptyState, Field, SegmentedControl, SkeletonRows, Textarea, Tooltip, toast } from "@/components/ui";
import { ProjectDot } from "@/components/app/icons";
import { refreshCounts } from "@/components/app/sidebar";
import { post } from "@/lib/api";
import { invalidate, useApi } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { addDays, dayName, fmtDate, fmtDateTime, hm, range, relTime } from "@/lib/format";
import { EntriesTable, LoadError } from "../analytics/entries";
import s from "./approvals.module.css";

type Status = "SUBMITTED" | "APPROVED" | "REJECTED";
interface Period {
  key: string; userId: number; weekStart: string; dates: string[]; status: Status; note: string | null; submittedAt: string; reviewedAt: string | null;
  user: { id: number; name: string; weeklyCapacity: number; team: { name: string } | null }; reviewedBy: { name: string } | null;
  minutes: number; billableMinutes: number; projects: { name: string; color: string; minutes: number }[]; byDay: Record<string, number>;
}

const daysLabel = (p: Period) => (p.dates.length === 1 ? fmtDate(p.dates[0]) : `${p.dates.length} days, ${fmtDate(p.dates[0])} – ${fmtDate(p.dates[p.dates.length - 1])}`);

export function TimesheetApprovals() {
  const { isAdmin } = useSession();
  const [status, setStatus] = useState<Status>("SUBMITTED");
  const { data, error, loading, reload } = useApi<Period[]>("/timesheets/approvals", { status });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [reject, setReject] = useState<Period | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const after = () => { reload(); refreshCounts(); invalidate("/timesheets"); };
  const approve = async (p: Period) => {
    setBusy(p.key);
    try { await post("/timesheets/approve", { userId: p.userId, dates: p.dates }); toast.success(`Approved ${p.user.name}'s ${daysLabel(p)}`); after(); }
    catch (e) { toast.error(e); } finally { setBusy(null); }
  };
  const bulk = async () => {
    setBusy("bulk");
    try {
      const r = await post<{ approved: number }>("/timesheets/bulk-approve", { groups: rows.filter((x) => selected.has(x.key)).map((x) => ({ userId: x.userId, dates: x.dates })) });
      toast.success(`Approved ${r.approved} of ${selected.size} timesheets`);
      setSelected(new Set()); after();
    } catch (e) { toast.error(e); } finally { setBusy(null); }
  };
  const toggleOpen = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const rows = data ?? [];
  const allSel = rows.length > 0 && rows.every((r) => selected.has(r.key));

  return (
    <div>
      <div className={s.bar}>
        <SegmentedControl aria-label="Status" value={status} onChange={(v) => { setStatus(v); setSelected(new Set()); setOpen(new Set()); }}
          options={[{ value: "SUBMITTED", label: "Waiting" }, { value: "APPROVED", label: "Approved" }, { value: "REJECTED", label: "Sent back" }]} />
        <div className="grow" />
        {status === "SUBMITTED" && selected.size > 0 && (
          <Button size="sm" variant="primary" icon={<Check size={14} />} loading={busy === "bulk"} onClick={bulk}>Approve {selected.size}</Button>
        )}
      </div>
      {error ? <LoadError error={error} onRetry={reload} what="timesheet approvals" /> : loading && !data ? <SkeletonRows rows={6} /> : !rows.length ? (
        <EmptyState title={status === "SUBMITTED" ? "Nothing waiting for approval" : status === "APPROVED" ? "No approved days" : "No days sent back"}
          description={status === "SUBMITTED" ? "Days submitted by your team show up here, grouped by person and week." : undefined} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {status === "SUBMITTED" && <th style={{ width: 36 }}><Checkbox aria-label="Select all" checked={allSel} indeterminate={!allSel && selected.size > 0} onChange={(v) => setSelected(v ? new Set(rows.map((r) => r.key)) : new Set())} /></th>}
                <th style={{ width: 28 }} />
                <th>Employee</th><th>Week</th><th className="num">Hours</th><th className="num">Billable</th><th>Days</th><th>Projects</th>
                <th>{status === "SUBMITTED" ? "Submitted" : "Reviewed"}</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const isOpen = open.has(p.key);
                const days = range(p.weekStart, addDays(p.weekStart, 6));
                const max = Math.max(480, ...Object.values(p.byDay));
                const cap = p.user.weeklyCapacity * 60;
                return (
                  <Fragment key={p.key}>
                    <tr className="clickable" onClick={() => toggleOpen(p.key)}>
                      {status === "SUBMITTED" && (
                        <td onClick={(e) => e.stopPropagation()}>
                          <Checkbox aria-label={`Select ${p.user.name}`} checked={selected.has(p.key)} onChange={(v) => setSelected((cur) => { const n = new Set(cur); if (v) n.add(p.key); else n.delete(p.key); return n; })} />
                        </td>
                      )}
                      <td>{isOpen ? <ChevronDown size={14} className="faint" /> : <ChevronRight size={14} className="faint" />}</td>
                      <td><div className="row"><Avatar name={p.user.name} size={20} /><span className="medium">{p.user.name}</span><span className="faint small">{p.user.team?.name}</span></div></td>
                      <td style={{ whiteSpace: "nowrap" }}>{fmtDate(p.weekStart)} – {fmtDate(addDays(p.weekStart, 6))}<div className="tiny faint">{p.dates.length} {p.dates.length === 1 ? "day" : "days"}</div></td>
                      <td className="num"><span className={p.minutes < cap * 0.9 ? "warn" : ""}>{hm(p.minutes)}</span><span className="faint"> / {p.user.weeklyCapacity}h</span></td>
                      <td className="num muted">{hm(p.billableMinutes)}</td>
                      <td>
                        <div className={s.days}>
                          {days.map((d) => (
                            <Tooltip key={d} content={`${dayName(d)} ${fmtDate(d)}: ${p.dates.includes(d) ? hm(p.byDay[d] ?? 0) : "not in this group"}`}>
                              <span className={s.dayCol} style={{ opacity: p.dates.includes(d) ? 1 : 0.25 }}><span className={s.dayBar} style={{ height: `${Math.max(p.byDay[d] ? 8 : 0, ((p.byDay[d] ?? 0) / max) * 100)}%` }} /></span>
                            </Tooltip>
                          ))}
                        </div>
                      </td>
                      <td>
                        <Tooltip content={p.projects.map((x) => `${x.name}: ${hm(x.minutes)}`).join(" · ") || "No projects"}>
                          <span className="row gap-4">{p.projects.slice(0, 4).map((x) => <ProjectDot key={x.name} color={x.color} />)}<span className="faint small ellipsis" style={{ maxWidth: 160 }}>{p.projects[0]?.name}{p.projects.length > 1 ? ` +${p.projects.length - 1}` : ""}</span></span>
                        </Tooltip>
                      </td>
                      <td className="muted small">
                        {status === "SUBMITTED"
                          ? <Tooltip content={fmtDateTime(p.submittedAt)}><span>{relTime(p.submittedAt)}</span></Tooltip>
                          : <span>{p.reviewedBy?.name ?? "—"} <span className="faint">{relTime(p.reviewedAt)}</span></span>}
                      </td>
                      <td className="right" onClick={(e) => e.stopPropagation()}>
                        <div className="row end gap-4">
                          {status === "SUBMITTED" && (
                            <>
                              <Button size="sm" variant="ghost" icon={<Undo2 size={13} />} onClick={() => setReject(p)}>Send back</Button>
                              <Button size="sm" variant="secondary" icon={<Check size={13} />} loading={busy === p.key} onClick={() => approve(p)}>Approve</Button>
                            </>
                          )}
                          {status === "APPROVED" && isAdmin && <Button size="sm" variant="ghost" icon={<LockOpen size={13} />} onClick={() => setReject(p)}>Unlock</Button>}
                          {status === "REJECTED" && p.note && <Tooltip content={p.note}><Badge size="sm" tone="red">Note</Badge></Tooltip>}
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className={s.detailRow}>
                        <td colSpan={status === "SUBMITTED" ? 10 : 9} style={{ padding: 0 }}>
                          <div className={s.detail}>
                            {p.note && <div className={s.note}><span className="faint">Note:</span> {p.note}</div>}
                            <EntriesTable query={{ from: p.dates[0], to: p.dates[p.dates.length - 1], userId: String(p.user.id) }} showUser={false} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <RejectDialog period={reject} onClose={() => setReject(null)} onDone={after} />
    </div>
  );
}

function RejectDialog({ period, onClose, onDone }: { period: Period | null; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const unlock = period?.status === "APPROVED";
  const submit = async () => {
    if (!period || !note.trim()) return;
    setBusy(true);
    try {
      await post("/timesheets/reject", { userId: period.userId, dates: period.dates, note: note.trim() });
      toast.success(unlock ? "Unlocked" : "Sent back", { description: `${period.user.name} has been notified.` });
      setNote(""); onDone(); onClose();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <Dialog open={!!period} onClose={onClose} size="sm" onSubmit={submit}
      title={unlock ? "Unlock approved days" : "Send back for changes"}
      description={period ? `${period.user.name} · ${daysLabel(period)}. They'll be notified with your note.` : undefined}
      footer={<><div className="grow" /><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant={unlock ? "primary" : "danger"} loading={busy} disabled={!note.trim()}>{unlock ? "Unlock" : "Send back"}</Button></>}>
      <Field label={unlock ? "Reason for unlocking" : "What needs fixing?"} required>
        <Textarea autoFocus rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder={unlock ? "e.g. Client asked to re-split hours between projects" : "e.g. Wednesday is missing descriptions"} />
      </Field>
    </Dialog>
  );
}
