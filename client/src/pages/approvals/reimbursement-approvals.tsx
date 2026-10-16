import { useState } from "react";
import { Check, ExternalLink, Receipt, X } from "lucide-react";
import { Avatar, Badge, Button, Dialog, EmptyState, Field, IconButton, SkeletonRows, Textarea, Tooltip, toast } from "@/components/ui";
import { refreshCounts } from "@/components/app/sidebar";
import { post } from "@/lib/api";
import { invalidate, useApi } from "@/lib/hooks";
import { fmtDate, money, relTime } from "@/lib/format";
import { LoadError } from "../analytics/entries";
import { CATEGORY_TONE, categoryLabel, type Reimbursement } from "../reimbursements/request-dialog";
import type { ApprovalStatus } from "./leave-approvals";

/** Expense claims for one status, for approvers and project managers. Declining asks for a note the requester sees. */
export function ReimbursementApprovals({ status }: { status: ApprovalStatus }) {
  const { data, error, loading, reload } = useApi<Reimbursement[]>("/reimbursements", { scope: "approvals", status });
  const [busy, setBusy] = useState<number | null>(null);
  const [reject, setReject] = useState<Reimbursement | null>(null);
  const [note, setNote] = useState("");

  const review = async (r: Reimbursement, action: "approve" | "reject", n?: string) => {
    setBusy(r.id);
    try {
      await post(`/reimbursements/${r.id}/${action}`, { note: n });
      toast.success(action === "approve" ? `Approved ${r.user.name}'s ${money(r.amount, r.currency)}` : `Declined ${r.user.name}'s request`);
      reload(); refreshCounts(); invalidate("/reimbursements");
      setReject(null); setNote("");
    } catch (e) { toast.error(e); } finally { setBusy(null); }
  };

  return (
    <div>
      {error ? <LoadError error={error} onRetry={reload} what="reimbursement approvals" /> : loading && !data ? <SkeletonRows rows={5} /> : !data?.length ? (
        <EmptyState icon={<Receipt size={22} />} title={status === "PENDING" ? "No reimbursements waiting" : "Nothing here"} description={status === "PENDING" ? "Expense claims from your team show up here." : undefined} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Employee</th><th>Date</th><th>Category</th><th>Project</th><th>Description</th><th className="num">Amount</th><th>{status === "PENDING" ? "Requested" : "Reviewed by"}</th><th /></tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td><div className="row"><Avatar name={r.user.name} size={20} /><span className="medium">{r.user.name}</span></div></td>
                  <td className="mono" style={{ whiteSpace: "nowrap" }}>{fmtDate(r.date, true)}</td>
                  <td><Badge size="sm" tone={CATEGORY_TONE[r.category] ?? "gray"}>{categoryLabel(r.category)}</Badge></td>
                  <td>{r.project ? <span className="row" style={{ gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: r.project.color, flex: "none" }} /><span className="ellipsis" style={{ maxWidth: 180 }}>{r.project.name}</span></span> : <span className="faint">—</span>}</td>
                  <td className="wrap-cell muted" style={{ maxWidth: 320 }}>
                    <span className="row" style={{ gap: 4, alignItems: "flex-start" }}>
                      <span>{r.description}</span>
                      {r.receiptUrl && <Tooltip content="Open receipt"><IconButton size="sm" variant="ghost" label="Open receipt" icon={<ExternalLink size={13} />} onClick={() => window.open(r.receiptUrl!, "_blank", "noopener")} /></Tooltip>}
                    </span>
                    {r.reviewNote && <div className="small faint">Note: {r.reviewNote}</div>}
                  </td>
                  <td className="num medium">{money(r.amount, r.currency)}</td>
                  <td className="muted small">{status === "PENDING" ? relTime(r.createdAt) : r.reviewer?.name ?? "—"}</td>
                  <td className="right">
                    {status === "PENDING" && (
                      <div className="row end gap-4">
                        <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={() => { setNote(""); setReject(r); }}>Decline</Button>
                        <Button size="sm" variant="secondary" icon={<Check size={13} />} loading={busy === r.id} onClick={() => review(r, "approve")}>Approve</Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={!!reject} onClose={() => setReject(null)} size="sm" title="Decline reimbursement"
        description={reject ? `${reject.user.name} · ${money(reject.amount, reject.currency)} · ${fmtDate(reject.date, true)}` : undefined}
        onSubmit={() => reject && note.trim() && review(reject, "reject", note.trim())}
        footer={<><div className="grow" /><Button variant="secondary" onClick={() => setReject(null)}>Cancel</Button><Button type="submit" variant="danger" disabled={!note.trim()} loading={busy === reject?.id}>Decline</Button></>}>
        <Field label="Reason" required><Textarea autoFocus rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Please attach the receipt and resubmit" /></Field>
      </Dialog>
    </div>
  );
}
