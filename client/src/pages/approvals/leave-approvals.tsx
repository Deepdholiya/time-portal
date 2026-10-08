import { useState } from "react";
import { Check, X } from "lucide-react";
import { Avatar, Badge, Button, Dialog, EmptyState, Field, SegmentedControl, SkeletonRows, Textarea, toast } from "@/components/arc";
import { refreshCounts } from "@/components/app/sidebar";
import { post } from "@/lib/api";
import { invalidate, useApi } from "@/lib/hooks";
import { fmtDate, relTime, titleCase } from "@/lib/format";
import { LoadError } from "../analytics/entries";
import s from "./approvals.module.css";

type Status = "PENDING" | "APPROVED" | "REJECTED";
interface Leave {
  id: number; type: string; from: string; to: string; halfDay: boolean; reason: string | null; status: Status; reviewNote: string | null; createdAt: string;
  user: { id: number; name: string }; reviewedBy: { name: string } | null; days: number;
}
const TYPE_TONE: Record<string, "blue" | "red" | "purple" | "gray"> = { VACATION: "blue", SICK: "red", PERSONAL: "purple", OTHER: "gray" };

export function LeaveApprovals() {
  const [status, setStatus] = useState<Status>("PENDING");
  const { data, error, loading, reload } = useApi<Leave[]>("/leave/approvals", { status });
  const [busy, setBusy] = useState<number | null>(null);
  const [reject, setReject] = useState<Leave | null>(null);
  const [note, setNote] = useState("");

  const review = async (l: Leave, st: "APPROVED" | "REJECTED", n?: string) => {
    setBusy(l.id);
    try {
      await post(`/leave/${l.id}/review`, { status: st, note: n });
      toast.success(st === "APPROVED" ? `Approved ${l.user.name}'s leave` : `Declined ${l.user.name}'s leave`);
      reload(); refreshCounts(); invalidate("/calendar"); invalidate("/analytics/workload");
      setReject(null); setNote("");
    } catch (e) { toast.error(e); } finally { setBusy(null); }
  };

  return (
    <div>
      <div className={s.bar}>
        <SegmentedControl aria-label="Status" value={status} onChange={setStatus}
          options={[{ value: "PENDING", label: "Pending" }, { value: "APPROVED", label: "Approved" }, { value: "REJECTED", label: "Declined" }]} />
      </div>
      {error ? <LoadError error={error} onRetry={reload} what="leave approvals" /> : loading && !data ? <SkeletonRows rows={5} /> : !data?.length ? (
        <EmptyState title={status === "PENDING" ? "No leave requests waiting" : "Nothing here"} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th className="num">Days</th><th>Reason</th><th>{status === "PENDING" ? "Requested" : "Reviewed by"}</th><th /></tr></thead>
            <tbody>
              {data.map((l) => (
                <tr key={l.id}>
                  <td><div className="row"><Avatar name={l.user.name} size={20} /><span className="medium">{l.user.name}</span></div></td>
                  <td><Badge size="sm" tone={TYPE_TONE[l.type] ?? "gray"}>{titleCase(l.type)}</Badge></td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{l.from === l.to ? fmtDate(l.from, true) : `${fmtDate(l.from)} – ${fmtDate(l.to, true)}`}{l.halfDay && <span className="faint"> · half day</span>}</td>
                  <td className="num">{l.days}</td>
                  <td className="wrap-cell muted" style={{ maxWidth: 320 }}>{l.reason || <span className="faint">—</span>}{l.reviewNote && <div className="small faint">Note: {l.reviewNote}</div>}</td>
                  <td className="muted small">{status === "PENDING" ? relTime(l.createdAt) : l.reviewedBy?.name ?? "—"}</td>
                  <td className="right">
                    {status === "PENDING" && (
                      <div className="row end gap-4">
                        <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={() => { setNote(""); setReject(l); }}>Decline</Button>
                        <Button size="sm" variant="secondary" icon={<Check size={13} />} loading={busy === l.id} onClick={() => review(l, "APPROVED")}>Approve</Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={!!reject} onClose={() => setReject(null)} size="sm" title="Decline leave"
        description={reject ? `${reject.user.name} · ${fmtDate(reject.from)} – ${fmtDate(reject.to, true)}` : undefined}
        onSubmit={() => reject && note.trim() && review(reject, "REJECTED", note.trim())}
        footer={<><div className="grow" /><Button variant="ghost" onClick={() => setReject(null)}>Cancel</Button><Button type="submit" variant="danger" disabled={!note.trim()} loading={busy === reject?.id}>Decline</Button></>}>
        <Field label="Reason" required><Textarea autoFocus rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Release week, can we move this by a week?" /></Field>
      </Dialog>
    </div>
  );
}
