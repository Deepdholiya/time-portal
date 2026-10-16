import { useMemo, useState } from "react";
import { BadgeCheck, Ban, ExternalLink, Hourglass, MoreHorizontal, Pencil, Plus, Receipt } from "lucide-react";
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, IconButton, Menu, SegmentedControl, SkeletonRows, toast } from "@/components/ui";
import { Page } from "@/components/app/page";
import { MetricLabel } from "@/components/app/metric";
import { post } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import { fmtDate, money, plural, today } from "@/lib/format";
import { CATEGORY_TONE, ReimbursementDialog, STATUS, categoryLabel, type Reimbursement } from "./request-dialog";
import s from "./reimbursements.module.css";

type Filter = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

/** Your expense claims: what's waiting, what's been paid back, and what was declined. */
export default function Reimbursements() {
  const { currency } = useMe();
  const q = useApi<Reimbursement[]>("/reimbursements", { scope: "mine" });
  const [filter, setFilter] = useState<Filter>("ALL");
  const [dialog, setDialog] = useState<{ editing: Reimbursement | null } | null>(null);
  const [cancel, setCancel] = useState<Reimbursement | null>(null);
  const [busy, setBusy] = useState(false);

  const all = useMemo(() => q.data ?? [], [q.data]);
  const rows = filter === "ALL" ? all : all.filter((r) => r.status === filter);
  const month = today().slice(0, 7);
  const sum = (list: Reimbursement[]) => list.reduce((a, r) => a + r.amount, 0);
  const pending = all.filter((r) => r.status === "PENDING");
  const approvedMonth = all.filter((r) => r.status === "APPROVED" && (r.reviewedAt ?? r.createdAt).slice(0, 7) === month);
  const rejected = all.filter((r) => r.status === "REJECTED");
  const cur = all[0]?.currency ?? currency;

  const doCancel = async () => {
    if (!cancel) return;
    setBusy(true);
    try {
      await post(`/reimbursements/${cancel.id}/cancel`);
      toast.success("Request cancelled");
      setCancel(null);
      q.reload();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  const metric = (icon: React.ReactNode, label: string, value: number, count: number) => (
    <div>
      <MetricLabel icon={icon}>{label}</MetricLabel>
      <div className={`stat-value ${s.value}`}>{money(value, cur)}<span className={s.sub}>{plural(count, "request")}</span></div>
    </div>
  );

  return (
    <Page
      title="Reimbursements" icon={<Receipt size={15} className="faint" />}
      actions={<Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setDialog({ editing: null })}>New request</Button>}
      toolbar={
        <SegmentedControl<Filter> aria-label="Status" value={filter} onChange={setFilter}
          options={[{ value: "ALL", label: "All" }, { value: "PENDING", label: "Pending" }, { value: "APPROVED", label: "Approved" }, { value: "REJECTED", label: "Declined" }]} />
      }
    >
      <div className={s.top}>
        <div className={s.stats}>
          {metric(<Hourglass />, "Pending", sum(pending), pending.length)}
          {metric(<BadgeCheck />, "Approved this month", sum(approvedMonth), approvedMonth.length)}
          {metric(<Ban />, "Declined", sum(rejected), rejected.length)}
        </div>
      </div>
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !q.data ? <SkeletonRows rows={5} /> : rows.length === 0 ? (
        <EmptyState
          icon={<Receipt size={22} />}
          title={filter === "ALL" ? "No reimbursement requests yet" : `No ${STATUS[filter].label.toLowerCase()} requests`}
          description={filter === "ALL" ? "Paid for travel, meals or software for work? Claim it back and your approver is notified." : undefined}
          action={filter === "ALL" ? <Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={() => setDialog({ editing: null })}>New request</Button> : undefined}
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Date</th><th>Category</th><th>Project</th><th>Description</th><th className="num">Amount</th><th>Status</th><th style={{ width: 48 }} /></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono" style={{ whiteSpace: "nowrap" }}>{fmtDate(r.date, true)}</td>
                  <td><Badge size="sm" tone={CATEGORY_TONE[r.category] ?? "gray"}>{categoryLabel(r.category)}</Badge></td>
                  <td>{r.project ? <span className={s.project}><span className={s.swatch} style={{ background: r.project.color }} /><span className="ellipsis">{r.project.name}</span></span> : <span className="faint">—</span>}</td>
                  <td className={`wrap-cell ${s.desc}`}>
                    {r.description}
                    {r.reviewNote && <div className={s.note}>{r.reviewer?.name ?? "Reviewer"}: “{r.reviewNote}”</div>}
                  </td>
                  <td className="num medium">{money(r.amount, r.currency)}</td>
                  <td><Badge size="sm" tone={STATUS[r.status].tone} dot>{STATUS[r.status].label}</Badge></td>
                  <td className="right">
                    {(r.status === "PENDING" || r.receiptUrl) && (
                      <Menu placement="bottom-end" trigger={<IconButton size="sm" variant="ghost" label={`Actions for ${r.description}`} icon={<MoreHorizontal size={14} />} />} items={[
                        !!r.receiptUrl && { label: "Open receipt", icon: <ExternalLink size={14} />, onSelect: () => { window.open(r.receiptUrl!, "_blank", "noopener"); } },
                        r.status === "PENDING" && { label: "Edit", icon: <Pencil size={14} />, onSelect: () => setDialog({ editing: r }) },
                        r.status === "PENDING" && { type: "separator" },
                        r.status === "PENDING" && { label: "Cancel request", icon: <Ban size={14} />, danger: true, onSelect: () => setCancel(r) },
                      ]} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ReimbursementDialog open={!!dialog} editing={dialog?.editing} onClose={() => setDialog(null)} onSaved={q.reload} />
      <ConfirmDialog
        open={!!cancel} onClose={() => setCancel(null)} onConfirm={doCancel} danger loading={busy} confirmLabel="Cancel request"
        title="Cancel this reimbursement request?"
        description={cancel ? `${categoryLabel(cancel.category)}, ${money(cancel.amount, cancel.currency)} on ${fmtDate(cancel.date, true)}. Your approver is no longer asked to review it.` : undefined}
      />
    </Page>
  );
}
