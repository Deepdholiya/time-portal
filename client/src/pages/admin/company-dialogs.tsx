import { useEffect, useMemo, useState } from "react";
import { UserMinus, UserPlus } from "lucide-react";
import { Avatar, Button, Combobox, ConfirmDialog, Dialog, ErrorState, Field, Input, Select, Sheet, SkeletonRows, Textarea, toast } from "@/components/arc";
import { del, get, post, put } from "@/lib/api";
import { invalidate, useApi } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { ColorPicker, CURRENCIES, DAYS, RoleBadge, StatusBadge, TIMEZONES, WorkWeekPicker } from "./shared";
import type { CompanyRow } from "./companies";

type Brief = { id: number; name: string; color: string };

export function CompanyDialog({ company, onClose, onCreated }: { company: CompanyRow | null; onClose: () => void; onCreated?: (c: CompanyRow) => void }) {
  const { refresh } = useSession();
  const [f, setF] = useState({
    name: company?.name ?? "", color: company?.color ?? "#5e6ad2", logoUrl: company?.logoUrl ?? "", country: company?.country ?? "India", timezone: company?.timezone ?? "Asia/Kolkata",
    currency: company?.currency ?? "INR", workWeek: company?.workWeek ?? "1,2,3,4,5", weekStartsOn: String(company?.weekStartsOn ?? 1), hoursPerDay: String(company?.hoursPerDay ?? 8),
    billingNotes: company?.billingNotes ?? "", taskKey: company?.settings.taskKey ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF((x) => ({ ...x, [k]: v })); setErr((e) => ({ ...e, [k]: "" })); };
  const slug = f.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

  const save = async () => {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = "Name the company";
    if (!f.workWeek) e.workWeek = "Pick at least one working day";
    if (f.taskKey && !/^[A-Z]{2,5}$/.test(f.taskKey)) e.taskKey = "Use 2 to 5 capital letters";
    if (Object.keys(e).length) { setErr(e); return; }
    setBusy(true);
    try {
      const body = {
        name: f.name.trim(), color: f.color, logoUrl: f.logoUrl.trim() || null, country: f.country.trim(), timezone: f.timezone, currency: f.currency,
        workWeek: f.workWeek, weekStartsOn: Number(f.weekStartsOn), hoursPerDay: Number(f.hoursPerDay) || 8, billingNotes: f.billingNotes.trim() || null,
        ...(f.taskKey ? { taskKey: f.taskKey } : {}),
      };
      if (company) {
        await put(`/companies/${company.id}`, body);
        toast.success("Company updated");
      } else {
        const c = await post<CompanyRow>("/companies", body);
        toast.success(`Created ${c.name}. Add people to it next.`);
        onCreated?.(c);
      }
      invalidate("/companies");
      refresh();
      onClose();
    } catch (x) { toast.error(x); } finally { setBusy(false); }
  };

  return (
    <Dialog open onClose={onClose} size="lg" title={company ? `Edit ${company.name}` : "New company"} dismissable={false}
      description={company ? undefined : "Each company is a separate workspace: its own clients, projects, time, settings and members. You'll be added as a member."}
      onSubmit={save} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>{company ? "Save" : "Create company"}</Button></>}>
      <div className="form-grid">
        <Field label="Name" required error={err.name} hint={!company && slug ? `Slug: ${slug}` : company ? `Slug: ${company.slug}` : undefined}>
          <Input autoFocus value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Acme Studio" name="company-name" />
        </Field>
        <Field label="Task key" error={err.taskKey} hint="Prefix for task ids, e.g. ACME-12. Leave empty to derive it.">
          <Input value={f.taskKey} onChange={(e) => set("taskKey", e.target.value.toUpperCase())} placeholder="ACM" maxLength={5} />
        </Field>
        <Field label="Country"><Input value={f.country} onChange={(e) => set("country", e.target.value)} /></Field>
        <Field label="Timezone"><Select value={f.timezone} onChange={(v) => set("timezone", v)} options={[...new Set([f.timezone, ...TIMEZONES])].map((t) => ({ value: t, label: t }))} /></Field>
        <Field label="Currency"><Select value={f.currency} onChange={(v) => set("currency", v)} options={[...new Set([f.currency, ...CURRENCIES])].map((c) => ({ value: c, label: c }))} /></Field>
        <Field label="Hours per day"><Input type="number" min={1} max={24} step="0.5" value={f.hoursPerDay} onChange={(e) => set("hoursPerDay", e.target.value)} suffix="h" /></Field>
        <Field label="Work week" error={err.workWeek}><WorkWeekPicker value={f.workWeek} onChange={(v) => set("workWeek", v)} /></Field>
        <Field label="Week starts on"><Select value={f.weekStartsOn} onChange={(v) => set("weekStartsOn", v)} options={DAYS.map((d) => ({ value: String(d.value), label: d.label }))} /></Field>
        <Field label="Colour" className="full"><ColorPicker value={f.color} onChange={(v) => set("color", v)} /></Field>
        <Field label="Logo URL" className="full"><Input value={f.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://…" /></Field>
        <Field label="Billing notes" className="full"><Textarea rows={2} value={f.billingNotes} onChange={(e) => set("billingNotes", e.target.value)} placeholder="Invoice terms, tax ids…" /></Field>
      </div>
    </Dialog>
  );
}

type Member = { id: number; name: string; email: string; role: string; status: string };

export function MembersSheet({ company, companies, onClose }: { company: Brief; companies: Brief[]; onClose: () => void }) {
  const { data, error, loading, reload } = useApi<Member[]>(`/companies/${company.id}/members`);
  const [everyone, setEveryone] = useState<Member[]>([]);
  const [pick, setPick] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);

  // There is no global user list endpoint, so gather people from every company's member list.
  useEffect(() => {
    let alive = true;
    Promise.all(companies.map((c) => get<Member[]>(`/companies/${c.id}/members`).catch(() => [] as Member[]))).then((lists) => {
      if (!alive) return;
      const m = new Map<number, Member>();
      lists.flat().forEach((u) => m.set(u.id, u));
      setEveryone([...m.values()].sort((a, b) => a.name.localeCompare(b.name)));
    });
    return () => { alive = false; };
  }, [companies]);

  const inCompany = useMemo(() => new Set((data ?? []).map((m) => m.id)), [data]);
  const candidates = everyone.filter((u) => !inCompany.has(u.id) && u.status !== "DEACTIVATED");

  const add = async () => {
    if (!pick.length) return;
    setBusy(true);
    try {
      await post(`/companies/${company.id}/members`, { userIds: pick.map(Number) });
      toast.success(`Added ${pick.length} ${pick.length === 1 ? "person" : "people"} to ${company.name}`);
      setPick([]);
      reload();
      invalidate("/companies");
      invalidate("/people");
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const remove = async () => {
    const m = removing;
    if (!m) return;
    setRemoving(null);
    try {
      await del(`/companies/${company.id}/members/${m.id}`);
      toast.success(`Removed ${m.name} from ${company.name}`);
      reload();
      invalidate("/companies");
      invalidate("/people");
    } catch (e) { toast.error(e); }
  };

  return (
    <Sheet open onClose={onClose} width={520} title={<span className="row"><span className="swatch" style={{ background: company.color }} />{company.name} members</span>}>
      <div className="col gap-16" style={{ padding: 20 }}>
        <Field label="Add existing people" hint="They keep their role and can switch into this company. New people are invited from Users while in this company.">
          <div className="row">
            <div className="grow">
              <Combobox multiple value={pick} onChange={setPick} placeholder="Pick people" options={candidates.map((u) => ({ value: String(u.id), label: u.name, hint: u.email, icon: <Avatar name={u.name} size={16} /> }))} />
            </div>
            <Button variant="primary" icon={<UserPlus size={14} />} loading={busy} disabled={!pick.length} onClick={add}>Add</Button>
          </div>
        </Field>
        <div>
          <div className="section-title">{data ? `${data.length} members` : "Members"}</div>
          {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <SkeletonRows rows={5} /> : (data ?? []).map((m) => (
            <div key={m.id} className="row" style={{ minHeight: 40, borderBottom: "1px solid var(--border)" }}>
              <Avatar name={m.name} size={22} />
              <span className="grow col" style={{ gap: 0 }}>
                <span className="medium">{m.name}</span>
                <span className="tiny faint">{m.email}</span>
              </span>
              {m.status !== "ACTIVE" && <StatusBadge status={m.status} />}
              <RoleBadge role={m.role} />
              <Button size="sm" variant="ghost" icon={<UserMinus size={13} />} onClick={() => setRemoving(m)} aria-label={`Remove ${m.name}`}>Remove</Button>
            </div>
          ))}
        </div>
      </div>
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} onConfirm={remove} danger confirmLabel="Remove"
        title={`Remove ${removing?.name} from ${company.name}?`} description="They lose access to this company. Their past time and tasks stay in its reports." />
    </Sheet>
  );
}
