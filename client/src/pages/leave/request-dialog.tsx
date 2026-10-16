import { useState } from "react";
import { Avatar, Button, Checkbox, Combobox, DatePicker, Dialog, Field, Input, Select, Textarea, toast } from "@/components/ui";
import { post } from "@/lib/api";
import { invalidate } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import { daysBetween, range, today, weekday } from "@/lib/format";
import { useOptions } from "../time/time-utils";
import s from "./leave.module.css";

export const LEAVE_TYPES = [
  { value: "VACATION", label: "Vacation" }, { value: "SICK", label: "Sick leave" }, { value: "PERSONAL", label: "Personal" },
  { value: "HOLIDAY", label: "Holiday" }, { value: "OTHER", label: "Other" },
];

/** "Everyone" in the employee picker adds company holidays instead of leave. */
const EVERYONE = "everyone";

/**
 * Request leave for yourself (it waits for approval), or, for approvers, add leave or a holiday for someone else, which is
 * approved straight away. Admins can also pick Everyone to add company holidays.
 */
export function RequestLeaveDialog({ open, onClose, onSaved, workWeek, holidays, forOthers = false }: {
  open: boolean; onClose: () => void; onSaved: () => void; workWeek: Set<number>; holidays: Set<string>; forOthers?: boolean;
}) {
  const { me, can } = useMe();
  const { data: options } = useOptions();
  const [who, setWho] = useState<string | null>(null);
  const [type, setType] = useState(forOthers ? "HOLIDAY" : "VACATION");
  const [from, setFrom] = useState<string>(today());
  const [to, setTo] = useState<string>(today());
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const everyone = forOthers && who === EVERYONE;
  const valid = to >= from;
  const span = valid && daysBetween(from, to) < 400 ? range(from, to) : [];
  const working = span.filter((d) => workWeek.has(weekday(d)) && !holidays.has(d)).length;
  const days = working * (halfDay ? 0.5 : 1);
  const userOptions = [
    ...(can("settings", "yes") ? [{ value: EVERYONE, label: "Everyone (company holiday)", group: "Company" }] : []),
    ...(options?.users ?? []).filter((u) => u.id !== me.user.id).map((u) => ({ value: String(u.id), label: u.name, icon: <Avatar name={u.name} size={16} />, keywords: u.email, group: "People" })),
  ];

  const reset = () => { setReason(""); setHalfDay(false); setName(""); setWho(null); };
  const submit = async () => {
    setError(null);
    if (forOthers && !who) return setError("Pick who the leave is for.");
    if (!valid) return setError("The end date must be on or after the start date.");
    setBusy(true);
    try {
      if (everyone) {
        if (!name.trim()) { setBusy(false); return setError("Name the holiday, like Diwali or Team offsite."); }
        const fresh = span.filter((d) => !holidays.has(d));
        for (const d of fresh) await post("/settings/holidays", { date: d, name: name.trim() });
        toast.success(fresh.length === 1 ? `Added ${name.trim()} as a company holiday` : `Added ${fresh.length} company holidays`);
        invalidate("/settings/holidays");
      } else {
        if (!working) { setBusy(false); return setError("That range has no working days (weekends and company holidays don't count)."); }
        await post("/leave", { type, from, to, halfDay, reason: reason.trim() || null, ...(forOthers ? { userId: Number(who) } : {}) });
        const person = options?.users.find((u) => String(u.id) === who)?.name;
        toast.success(forOthers ? `Added ${LEAVE_TYPES.find((t) => t.value === type)?.label.toLowerCase()} for ${person ?? "them"}` : "Leave requested", { description: forOthers ? "It's approved and they've been told." : "Your manager will review it." });
      }
      onSaved();
      onClose();
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the leave.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open} onClose={onClose} title={forOthers ? "Add leave or holiday" : "Request leave"} size="sm" onSubmit={submit}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>{forOthers ? "Add" : "Send request"}</Button></>}
    >
      <div className="form-grid">
        {forOthers && (
          <Field label="For" className="full" required>
            <Combobox options={userOptions} value={who} onChange={setWho} placeholder="Pick a person or everyone" searchPlaceholder="Search people…" aria-label="For" />
          </Field>
        )}
        {everyone ? (
          <Field label="Holiday name" className="full" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diwali" aria-label="Holiday name" /></Field>
        ) : (
          <Field label="Type" className="full"><Select value={type} onChange={setType} options={LEAVE_TYPES} aria-label="Leave type" /></Field>
        )}
        <Field label="From"><DatePicker value={from} onChange={(v) => { if (!v) return; setFrom(v); if (to < v) setTo(v); }} clearable={false} fullWidth aria-label="From" /></Field>
        <Field label="To"><DatePicker value={to} onChange={(v) => v && setTo(v)} clearable={false} fullWidth aria-label="To" /></Field>
        {!everyone && (
          <>
            <div className="full">
              <Checkbox checked={halfDay} onChange={setHalfDay} label={from === to ? "Half day" : "Half days (counts each day as half)"} />
            </div>
            <Field label={forOthers ? "Note" : "Reason"} className="full"><Textarea rows={2} placeholder={forOthers ? "Optional note they'll see" : "Optional note for your manager"} value={reason} onChange={(e) => setReason(e.target.value)} style={{ minHeight: 56 }} /></Field>
          </>
        )}
        <div className={`full ${s.preview}`}>
          {!valid ? "Pick an end date after the start date."
            : everyone ? <>{span.length} {span.length === 1 ? "day" : "days"} off for everyone. Nobody is expected to log time on {span.length === 1 ? "it" : "them"}.</>
            : <>{days} working {days === 1 ? "day" : "days"}. Weekends and company holidays aren't counted.{forOthers ? " It's approved straight away." : ""}</>}
        </div>
        {error && <div className="full field-error" role="alert">{error}</div>}
      </div>
    </Dialog>
  );
}
