// Small pieces shared by the people, teams, clients and admin pages.
import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { Badge, IconButton, toast, type BadgeTone } from "@/components/arc";
import { titleCase } from "@/lib/format";
import s from "./shared.module.css";

export const ROLE_TONE: Record<string, BadgeTone> = { ADMIN: "purple", MANAGER: "blue", EMPLOYEE: "gray" };
export function RoleBadge({ role }: { role?: string | null }) {
  if (!role) return null;
  return <Badge tone={ROLE_TONE[role] ?? "gray"} size="sm">{titleCase(role)}</Badge>;
}

const STATUS_TONE: Record<string, BadgeTone> = {
  ACTIVE: "green", INVITED: "yellow", DEACTIVATED: "gray", PENDING: "yellow", ACCEPTED: "green", EXPIRED: "orange", REVOKED: "red", ARCHIVED: "gray",
};
export function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return null;
  return <Badge tone={STATUS_TONE[status] ?? "gray"} size="sm" dot>{titleCase(status)}</Badge>;
}

export async function copyText(text: string, what = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(what);
    return true;
  } catch {
    toast.error("Couldn't copy. Select the text and copy it manually.");
    return false;
  }
}

/** A secret shown exactly once (temporary passwords), with a copy button. */
export function SecretOnce({ label = "Temporary password", value, children }: { label?: string; value: string; children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={s.secret}>
      <div className="tiny faint">{label}</div>
      <div className="row">
        <code className={s.secretValue} data-testid="temp-password">{value}</code>
        <IconButton
          label={copied ? "Copied" : "Copy"}
          icon={copied ? <Check size={14} /> : <Copy size={14} />}
          onClick={async () => { if (await copyText(value, "Password copied")) setCopied(true); }}
        />
      </div>
      <div className="tiny faint">This is the only time it is shown. Share it privately; it must be replaced at first sign-in.</div>
      {children}
    </div>
  );
}

/** Colour picker limited to a quiet palette plus a custom value. */
export const PALETTE = ["#5e6ad2", "#26b5ce", "#4cb782", "#e0b400", "#f2994a", "#eb5757", "#bb87fc", "#d96ba4", "#4ea7fc", "#95a2b3"];
export function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="row wrap gap-4">
      {PALETTE.map((c) => (
        <button
          key={c} type="button" aria-label={`Colour ${c}`} className={s.colorBtn} data-active={c.toLowerCase() === value.toLowerCase() || undefined}
          style={{ background: c }} onClick={() => onChange(c)}
        />
      ))}
      <label className={s.colorCustom} title="Custom colour">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Custom colour" />
      </label>
    </div>
  );
}

/** Two-column property line used in detail panels and dialogs. */
export function Prop({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="prop-row">
      <span className="prop-label">{label}</span>
      <span className="ellipsis">{children ?? <span className="faint">—</span>}</span>
    </div>
  );
}

export const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

export const DAYS = [
  { value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" }, { value: 4, label: "Thu" },
  { value: 5, label: "Fri" }, { value: 6, label: "Sat" }, { value: 7, label: "Sun" },
];
export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AUD", "CAD", "SGD", "AED", "JPY"];
export const TIMEZONES = [
  "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo", "Europe/London", "Europe/Berlin", "Europe/Paris",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Australia/Sydney", "UTC",
];

/** Toggle buttons for working days, stored as "1,2,3,4,5". */
export function WorkWeekPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const set = new Set(value.split(",").filter(Boolean).map(Number));
  return (
    <div className="row gap-4">
      {DAYS.map((d) => (
        <button
          key={d.value} type="button" className={s.dayBtn} data-active={set.has(d.value) || undefined} aria-pressed={set.has(d.value)}
          onClick={() => {
            const next = new Set(set);
            if (next.has(d.value)) next.delete(d.value); else next.add(d.value);
            onChange([...next].sort().join(","));
          }}
        >
          {d.label}
        </button>
      ))}
    </div>
  );
}
