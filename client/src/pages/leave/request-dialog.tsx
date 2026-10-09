import { useState } from "react";
import { Button, Checkbox, DatePicker, Dialog, Field, Select, Textarea, toast } from "@/components/ui";
import { post } from "@/lib/api";
import { daysBetween, range, today, weekday } from "@/lib/format";
import s from "./leave.module.css";

export const LEAVE_TYPES = [
  { value: "VACATION", label: "Vacation" }, { value: "SICK", label: "Sick leave" }, { value: "PERSONAL", label: "Personal" }, { value: "OTHER", label: "Other" },
];

export function RequestLeaveDialog({ open, onClose, onSaved, workWeek, holidays }: { open: boolean; onClose: () => void; onSaved: () => void; workWeek: Set<number>; holidays: Set<string> }) {
  const [type, setType] = useState("VACATION");
  const [from, setFrom] = useState<string>(today());
  const [to, setTo] = useState<string>(today());
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = to >= from;
  const working = valid && daysBetween(from, to) < 400 ? range(from, to).filter((d) => workWeek.has(weekday(d)) && !holidays.has(d)).length : 0;
  const days = working * (halfDay ? 0.5 : 1);

  const submit = async () => {
    setError(null);
    if (!valid) return setError("The end date must be on or after the start date.");
    if (!working) return setError("That range has no working days (weekends and company holidays don't count).");
    setBusy(true);
    try {
      await post("/leave", { type, from, to, halfDay, reason: reason.trim() || null });
      toast.success("Leave requested", { description: "Your manager will review it." });
      onSaved();
      onClose();
      setReason(""); setHalfDay(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't request leave.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open} onClose={onClose} title="Request leave" size="sm" onSubmit={submit}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Send request</Button></>}
    >
      <div className="form-grid">
        <Field label="Type" className="full"><Select value={type} onChange={setType} options={LEAVE_TYPES} aria-label="Leave type" /></Field>
        <Field label="From"><DatePicker value={from} onChange={(v) => { if (!v) return; setFrom(v); if (to < v) setTo(v); }} clearable={false} fullWidth aria-label="From" /></Field>
        <Field label="To"><DatePicker value={to} onChange={(v) => v && setTo(v)} clearable={false} fullWidth aria-label="To" /></Field>
        <div className="full">
          <Checkbox checked={halfDay} onChange={setHalfDay} label={from === to ? "Half day" : "Half days (counts each day as half)"} />
        </div>
        <Field label="Reason" className="full"><Textarea rows={2} placeholder="Optional note for your manager" value={reason} onChange={(e) => setReason(e.target.value)} style={{ minHeight: 56 }} /></Field>
        <div className={`full ${s.preview}`}>{valid ? <>{days} working {days === 1 ? "day" : "days"}. Weekends and company holidays aren't counted.</> : "Pick an end date after the start date."}</div>
        {error && <div className="full field-error" role="alert">{error}</div>}
      </div>
    </Dialog>
  );
}
