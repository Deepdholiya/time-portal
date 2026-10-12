import { useEffect, useMemo, useState } from "react";
import { Button, Combobox, DatePicker, Dialog, Field, Input, Select, Textarea, toast, type BadgeTone } from "@/components/ui";
import { AiButton, aiSourceNote, type AiSource } from "@/components/app/ai-button";
import { patch, post } from "@/lib/api";
import { useMe } from "@/lib/session";
import { today } from "@/lib/format";
import { useOptions, projectPath } from "../time/time-utils";

export type ReimbursementStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export interface Reimbursement {
  id: number; date: string; amount: number; currency: string; category: string; description: string; receiptUrl: string | null;
  status: ReimbursementStatus; reviewNote: string | null; reviewedAt: string | null; createdAt: string;
  user: { id: number; name: string }; project: { id: number; name: string; color: string } | null; reviewer: { id: number; name: string } | null;
}

export const CATEGORIES = [
  { value: "TRAVEL", label: "Travel" }, { value: "MEALS", label: "Meals" }, { value: "SUPPLIES", label: "Supplies" },
  { value: "SOFTWARE", label: "Software" }, { value: "OTHER", label: "Other" },
];
export const categoryLabel = (c: string) => CATEGORIES.find((x) => x.value === c)?.label ?? c;
export const CATEGORY_TONE: Record<string, BadgeTone> = { TRAVEL: "blue", MEALS: "orange", SUPPLIES: "purple", SOFTWARE: "accent", OTHER: "gray" };
export const STATUS: Record<ReimbursementStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: "Pending", tone: "yellow" }, APPROVED: { label: "Approved", tone: "green" }, REJECTED: { label: "Declined", tone: "red" }, CANCELLED: { label: "Cancelled", tone: "gray" },
};

/** Ask to be paid back for an expense, or edit a request that's still pending. Approvers and the project's manager are notified. */
export function ReimbursementDialog({ open, onClose, onSaved, editing }: { open: boolean; onClose: () => void; onSaved: () => void; editing?: Reimbursement | null }) {
  const { currency } = useMe();
  const { data: options } = useOptions();
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("TRAVEL");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSource, setAiSource] = useState<AiSource | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDate(editing?.date ?? today());
    setAmount(editing ? String(editing.amount) : "");
    setCategory(editing?.category ?? "TRAVEL");
    setProjectId(editing?.project ? String(editing.project.id) : null);
    setDescription(editing?.description ?? "");
    setReceiptUrl(editing?.receiptUrl ?? "");
    setAiSource(null);
  }, [open, editing]);

  const tidyWithAi = async () => {
    if (description.trim().length < 3) return setError("Write a few words about the expense first, then AI can tidy it.");
    setError(null);
    setAiBusy(true);
    try {
      const n = Number(amount);
      const r = await post<{ description: string; category: string; source: AiSource }>("/ai/reimbursement-tidy", { description: description.trim(), amount: Number.isFinite(n) && n > 0 ? n : undefined, projectId: projectId ? Number(projectId) : null });
      setDescription(r.description);
      setCategory(r.category);
      setAiSource(r.source);
    } catch (e) { toast.error(e); } finally { setAiBusy(false); }
  };

  const projectOptions = useMemo(() => (options?.projects ?? []).filter((p) => p.canLog && p.status !== "COMPLETED").map((p) => {
    const parent = p.parentId ? options?.projects.find((x) => x.id === p.parentId) : null;
    return { value: String(p.id), label: projectPath({ name: p.name, parent }), icon: <span className="dot" style={{ background: p.color, width: 8, height: 8, borderRadius: 999, display: "inline-block" }} /> };
  }), [options]);

  const submit = async () => {
    setError(null);
    const n = Number(amount);
    if (!amount || !Number.isFinite(n) || n <= 0) return setError("Enter an amount more than zero.");
    if (!description.trim()) return setError("Describe what the expense was for.");
    setBusy(true);
    const body = { date, amount: n, category, projectId: projectId ? Number(projectId) : null, description: description.trim(), receiptUrl: receiptUrl.trim() || null };
    try {
      if (editing) await patch(`/reimbursements/${editing.id}`, body);
      else await post("/reimbursements", body);
      toast.success(editing ? "Request updated" : "Reimbursement requested", editing ? undefined : { description: "Your approver will review it." });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open} onClose={onClose} size="sm" onSubmit={submit}
      title={editing ? "Edit reimbursement" : "New reimbursement request"}
      description={editing ? undefined : "Claim back something you paid for on the company's behalf."}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>{editing ? "Save changes" : "Send request"}</Button></>}
    >
      <div className="form-grid">
        <Field label="Date" required><DatePicker value={date} onChange={(v) => v && setDate(v)} max={today()} clearable={false} fullWidth aria-label="Date" /></Field>
        <Field label={`Amount (${currency})`} required>
          <Input type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" aria-label="Amount" style={{ fontVariantNumeric: "tabular-nums" }} />
        </Field>
        <Field label="Category" className="full"><Select value={category} onChange={setCategory} options={CATEGORIES} aria-label="Category" /></Field>
        <Field label="Project" className="full" hint="Optional. The project's manager is asked to review it too.">
          <Combobox options={projectOptions} value={projectId} onChange={setProjectId} clearable placeholder="No project" searchPlaceholder="Search projects…" aria-label="Project" />
        </Field>
        <Field label="Description" className="full" required hint={aiSource ? `${aiSourceNote(aiSource)} Category set to ${categoryLabel(category)}.` : undefined}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}><Textarea rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Cab to the client office for the design review" style={{ minHeight: 72 }} aria-label="Description" /></div>
            <AiButton label="Tidy description and suggest a category" loading={aiBusy} onClick={tidyWithAi} />
          </div>
        </Field>
        <Field label="Receipt link" className="full" hint="Optional. A link to the receipt in Drive, Dropbox or similar.">
          <Input type="url" value={receiptUrl} onChange={(e) => setReceiptUrl(e.target.value)} placeholder="https://" aria-label="Receipt link" />
        </Field>
        {error && <div className="full field-error" role="alert">{error}</div>}
      </div>
    </Dialog>
  );
}
