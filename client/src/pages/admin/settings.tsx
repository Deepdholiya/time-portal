import { useEffect, useMemo, useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { Page } from "@/components/app/page";
import { Button, ErrorState, Field, Input, Select, SkeletonRows, Switch, Tabs, Textarea, toast } from "@/components/ui";
import { put } from "@/lib/api";
import { invalidate, useApi } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import type { Company, CompanySettings } from "@/lib/types";
import { ColorPicker, CURRENCIES, DAYS, TIMEZONES, WorkWeekPicker } from "./shared";
import { CustomFields, Holidays, Section, Templates } from "./settings-lists";
import s from "./settings.module.css";

type Resp = Company & { mailConfigured: boolean; aiConfigured: boolean };
type Form = {
  name: string; color: string; country: string; timezone: string; currency: string; workWeek: string; weekStartsOn: string; hoursPerDay: string; billingNotes: string;
  settings: CompanySettings;
};
const TABS = [
  { value: "general", label: "General" }, { value: "workload", label: "Workload" }, { value: "security", label: "Security" }, { value: "time", label: "Time & AI" },
  { value: "holidays", label: "Holidays" }, { value: "fields", label: "Custom fields" }, { value: "templates", label: "Templates" },
];

export default function Settings() {
  const { can, refresh } = useMe();
  const { data, error, loading, reload } = useApi<Resp>("/settings/company");
  const [tab, setTab] = useState("general");
  const [f, setF] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);

  const initial = useMemo<Form | null>(() => data ? {
    name: data.name, color: data.color, country: data.country ?? "", timezone: data.timezone, currency: data.currency, workWeek: data.workWeek,
    weekStartsOn: String(data.weekStartsOn), hoursPerDay: String(data.hoursPerDay), billingNotes: data.billingNotes ?? "", settings: { ...data.settings },
  } : null, [data]);
  useEffect(() => { setF(initial); }, [initial]);
  const dirty = !!f && !!initial && JSON.stringify(f) !== JSON.stringify(initial);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => (x ? { ...x, [k]: v } : x));
  const setS = <K extends keyof CompanySettings>(k: K, v: CompanySettings[K]) => setF((x) => (x ? { ...x, settings: { ...x.settings, [k]: v } } : x));

  const save = async () => {
    if (!f || !data) return;
    if (!f.workWeek) { toast.error("Pick at least one working day"); return; }
    setBusy(true);
    try {
      const fields = { country: f.country.trim(), timezone: f.timezone, currency: f.currency, workWeek: f.workWeek, weekStartsOn: Number(f.weekStartsOn), hoursPerDay: Number(f.hoursPerDay) || 8, billingNotes: f.billingNotes.trim() || null };
      await put("/settings/company", { ...fields, settings: f.settings });
      // Name and colour live on the company record, which needs company management.
      if ((f.name !== data.name || f.color !== data.color) && can("companies", "yes")) {
        await put(`/companies/${data.id}`, { ...fields, name: f.name.trim(), color: f.color, logoUrl: data.logoUrl || null, taskKey: f.settings.taskKey });
      }
      toast.success("Settings saved");
      invalidate("/settings");
      invalidate("/companies");
      await refresh();
      reload();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  const formTab = ["general", "workload", "security", "time"].includes(tab);
  return (
    <Page
      title="Company settings" icon={<SettingsIcon size={15} />}
      toolbar={<Tabs variant="underline" value={tab} onChange={setTab} items={TABS} />}
      actions={formTab && f && <>
        {dirty && <Button size="sm" variant="ghost" onClick={() => setF(initial)}>Discard</Button>}
        <Button size="sm" variant="primary" disabled={!dirty} loading={busy} onClick={save}>Save changes</Button>
      </>}
    >
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !f ? <SkeletonRows /> : !f || !data ? null : (
        <div className={s.wrap}>
          {tab === "general" && (
            <Section title="General" desc="How this company appears and how its working week is counted.">
              <Row label="Name" hint={can("companies", "yes") ? undefined : "Only people who manage companies can rename it."}><Input value={f.name} disabled={!can("companies", "yes")} onChange={(e) => set("name", e.target.value)} /></Row>
              <Row label="Colour"><ColorPicker value={f.color} onChange={(v) => set("color", v)} /></Row>
              <Row label="Country"><Input value={f.country} onChange={(e) => set("country", e.target.value)} /></Row>
              <Row label="Timezone"><Select value={f.timezone} onChange={(v) => set("timezone", v)} options={[...new Set([f.timezone, ...TIMEZONES])].map((t) => ({ value: t, label: t }))} /></Row>
              <Row label="Currency"><Select value={f.currency} onChange={(v) => set("currency", v)} options={[...new Set([f.currency, ...CURRENCIES])].map((c) => ({ value: c, label: c }))} /></Row>
              <Row label="Working days"><WorkWeekPicker value={f.workWeek} onChange={(v) => set("workWeek", v)} /></Row>
              <Row label="Week starts on"><Select value={f.weekStartsOn} onChange={(v) => set("weekStartsOn", v)} options={DAYS.map((d) => ({ value: String(d.value), label: d.label }))} /></Row>
              <Row label="Hours per day" hint="Used for capacity and utilization."><Input type="number" min={1} max={24} step="0.5" value={f.hoursPerDay} onChange={(e) => set("hoursPerDay", e.target.value)} suffix="h" /></Row>
              <Row label="Task key" hint="Prefix for task ids (2 to 5 capital letters)."><Input value={f.settings.taskKey} maxLength={5} onChange={(e) => setS("taskKey", e.target.value.toUpperCase())} /></Row>
              <Row label="Billing notes"><Textarea rows={3} value={f.billingNotes} onChange={(e) => set("billingNotes", e.target.value)} placeholder="Invoice terms, tax ids…" /></Row>
            </Section>
          )}
          {tab === "workload" && (
            <Section title="Workload thresholds" desc="Utilization (tracked or planned hours ÷ capacity) bands used on the workload and analytics pages.">
              <Row label="Underutilized below"><Input type="number" min={0} max={150} value={f.settings.underPct} onChange={(e) => setS("underPct", Number(e.target.value))} suffix="%" /></Row>
              <Row label="Healthy from"><Input type="number" min={10} max={200} value={f.settings.healthyPct} onChange={(e) => setS("healthyPct", Number(e.target.value))} suffix="%" /></Row>
              <Row label="Overloaded above"><Input type="number" min={50} max={300} value={f.settings.overloadPct} onChange={(e) => setS("overloadPct", Number(e.target.value))} suffix="%" /></Row>
              <div className={s.bands}>
                <span style={{ flex: f.settings.underPct, background: "var(--yellow-soft)", color: "var(--yellow)" }}>Under &lt; {f.settings.underPct}%</span>
                <span style={{ flex: Math.max(1, f.settings.healthyPct - f.settings.underPct), background: "var(--gray-soft)" }} />
                <span style={{ flex: Math.max(1, f.settings.overloadPct - f.settings.healthyPct), background: "var(--green-soft)", color: "var(--green)" }}>Healthy {f.settings.healthyPct}%+</span>
                <span style={{ flex: 30, background: "var(--red-soft)", color: "var(--red)" }}>&gt; {f.settings.overloadPct}%</span>
              </div>
            </Section>
          )}
          {tab === "security" && (
            <Section title="Security" desc="Sign-in, invitation and session rules for this company.">
              <Row label="Session timeout" hint="Signed-in sessions expire after this much inactivity."><Input type="number" min={5} value={f.settings.sessionTimeoutMinutes} onChange={(e) => setS("sessionTimeoutMinutes", Number(e.target.value))} suffix="minutes" /></Row>
              <Row label="Require two-factor for admins" hint="Admins without two-factor must set it up before using the app. Turn it on for yourself first under Account."><Switch checked={f.settings.enforceAdminMfa} onChange={(v) => setS("enforceAdminMfa", v)} aria-label="Require two-factor for admins" /></Row>
              <Row label="Temporary password lifetime" hint="Invitations and password resets stop working after this."><Input type="number" min={1} max={720} value={f.settings.tempPasswordHours} onChange={(e) => setS("tempPasswordHours", Number(e.target.value))} suffix="hours" /></Row>
              <Row label="Invitation validity"><Input type="number" min={1} max={60} value={f.settings.invitationDays} onChange={(e) => setS("invitationDays", Number(e.target.value))} suffix="days" /></Row>
              <Row label="Email delivery"><span className="muted">{data.mailConfigured ? "SMTP is configured; emails are delivered." : "No SMTP server; emails are only stored in the Email log."}</span></Row>
            </Section>
          )}
          {tab === "time" && (
            <Section title="Time & AI" desc="Rules for logging time, and the AI assistant.">
              <Row label="Automatic submission time" hint={`Each day's entries are submitted at this time (${f.timezone}). Days changed after it wait for a manual submit.`}><Input type="time" value={f.settings.autoSubmitTime} onChange={(e) => setS("autoSubmitTime", e.target.value)} /></Row>
              <Row label="Working day starts" hint="A new entry starts here when the day has no earlier entry."><Input type="time" value={f.settings.workdayStart} onChange={(e) => setS("workdayStart", e.target.value)} /></Row>
              <Row label="Lock submitted days" hint="Submitted and approved days can't be edited until they're reopened or sent back."><Switch checked={f.settings.lockApprovedWeeks} onChange={(v) => setS("lockApprovedWeeks", v)} aria-label="Lock submitted days" /></Row>
              <Row label="Allow overlapping entries" hint="Let entries with start and end times overlap for the same person."><Switch checked={f.settings.allowOverlappingTimers} onChange={(v) => setS("allowOverlappingTimers", v)} aria-label="Allow overlapping entries" /></Row>
              <Row label="Require a description" hint="Checked when a day is submitted, so entries can be saved first and described later."><Switch checked={f.settings.requireDescription} onChange={(v) => setS("requireDescription", v)} aria-label="Require a description" /></Row>
              <Row label="Require a tag" hint="Every entry needs at least one tag before its day is submitted. Manage tags under Admin → Time tags."><Switch checked={f.settings.requireTags} onChange={(v) => setS("requireTags", v)} aria-label="Require a tag" /></Row>
              <Row label="Track billable time" hint="Show the billable switch on time entries."><Switch checked={f.settings.billableEnabled} onChange={(v) => setS("billableEnabled", v)} aria-label="Track billable time" /></Row>
              <Row label="AI assistant" hint={data.aiConfigured ? "Uses Claude for task summaries and client email drafts." : "No ANTHROPIC_API_KEY on the server; drafts use a built-in template."}><Switch checked={f.settings.aiEnabled} onChange={(v) => setS("aiEnabled", v)} aria-label="AI enabled" /></Row>
            </Section>
          )}
          {tab === "holidays" && <Holidays />}
          {tab === "fields" && <CustomFields />}
          {tab === "templates" && <Templates />}
        </div>
      )}
    </Page>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className={s.row}>
      <div className={s.label}>
        <div className="medium">{label}</div>
        {hint && <div className="small faint">{hint}</div>}
      </div>
      <div className={s.control}><Field label={label} labelHidden>{children}</Field></div>
    </div>
  );
}
