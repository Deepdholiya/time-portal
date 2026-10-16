import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button, Combobox, Dialog, Field, Input, Select, Switch, Textarea, toast } from "@/components/arc";
import { post } from "@/lib/api";
import { invalidate, useApi } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import { fmtDateTime, titleCase } from "@/lib/format";
import type { Options } from "@/lib/types";
import { copyText, SecretOnce } from "./shared";

type InviteResult = { invitation: { email: string; name: string; role: string; expiresAt: string }; tempPassword: string | null; existing: boolean };

export function InviteDialog({ onClose }: { onClose: () => void }) {
  const { isAdmin, me } = useMe();
  const opts = useApi<Options>("/options");
  const [f, setF] = useState({ name: "", email: "", role: "EMPLOYEE", title: "", teamId: "", weeklyCapacity: "40", allProjects: false, projectIds: [] as string[] });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<InviteResult | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: "" })); };

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!f.name.trim()) errs.name = "Enter a name";
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) errs.email = "Enter a valid email";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setBusy(true);
    try {
      const r = await post<InviteResult>("/people/invitations", {
        name: f.name.trim(), email: f.email.trim(), role: f.role, title: f.title.trim() || null, teamId: f.teamId ? Number(f.teamId) : null,
        weeklyCapacity: Number(f.weeklyCapacity) || 0, allProjects: f.allProjects, projectIds: f.allProjects ? [] : f.projectIds.map(Number),
      });
      setResult(r);
      invalidate("/people");
      if (r.existing) toast.success(`${r.invitation.name} already had an account and was added to ${me.company.name}`);
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  const again = () => { setResult(null); setF((x) => ({ ...x, name: "", email: "", title: "" })); };

  if (result) {
    return (
      <Dialog open onClose={onClose} title={result.existing ? "Added to company" : "Invitation sent"} size="md"
        footer={<><Button variant="ghost" onClick={again}>Invite another</Button><Button variant="primary" onClick={onClose}>Done</Button></>}>
        <div className="col gap-12">
          {result.existing ? (
            <p>{result.invitation.name} already has a Time Portal account, so they can sign in with their existing password and switch to {me.company.name}.</p>
          ) : (
            <>
              <p>
                An invitation email to <span className="medium">{result.invitation.email}</span> was queued with the sign-in link, the company and first-login instructions.
                They join as <span className="medium">{titleCase(result.invitation.role)}</span>.
              </p>
              {result.tempPassword && (
                <SecretOnce value={result.tempPassword}>
                  <div className="row">
                    <Button size="sm" variant="ghost" onClick={() => copyText(`Sign in at ${location.origin}/login\nEmail: ${result.invitation.email}\nTemporary password: ${result.tempPassword}`, "Sign-in details copied")}>Copy sign-in details</Button>
                    <span className="tiny faint">Expires {fmtDateTime(result.invitation.expiresAt)}</span>
                  </div>
                </SecretOnce>
              )}
              <p className="small faint">Without a mail server the email only lands in the Email log, so share the password yourself.</p>
            </>
          )}
        </div>
      </Dialog>
    );
  }

  const projects = (opts.data?.projects ?? []).filter((p) => !p.parentId);
  return (
    <Dialog open onClose={onClose} title="Invite people" description={`They'll get an email with a temporary password for ${me.company.name}.`} size="lg" onSubmit={submit} dismissable={false}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Send invitation</Button></>}>
      <div className="form-grid">
        <Field label="Full name" required error={errors.name}><Input autoFocus value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Jane Doe" name="name" /></Field>
        <Field label="Email" required error={errors.email}><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="jane@company.com" name="email" /></Field>
        <Field label="Role" hint={!isAdmin ? "Only admins can invite admins." : undefined}>
          <Select value={f.role} onChange={(v) => set("role", v)} aria-label="Role"
            options={[{ value: "EMPLOYEE", label: "Employee" }, { value: "MANAGER", label: "Manager" }, ...(isAdmin ? [{ value: "ADMIN", label: "Admin" }] : [])]} />
        </Field>
        <Field label="Title"><Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Frontend Developer" /></Field>
        <Field label="Team"><Select value={f.teamId} onChange={(v) => set("teamId", v)} options={[{ value: "", label: "No team" }, ...(opts.data?.teams ?? []).map((t) => ({ value: String(t.id), label: t.name }))]} /></Field>
        <Field label="Weekly capacity"><Input type="number" min={0} max={80} value={f.weeklyCapacity} onChange={(e) => set("weeklyCapacity", e.target.value)} suffix="h" /></Field>
        <Field label="Project access" className="full">
          <div className="col">
            <Switch checked={f.allProjects} onChange={(v) => set("allProjects", v)} label="All projects in this company" />
            {!f.allProjects && <Combobox multiple value={f.projectIds} onChange={(v) => set("projectIds", v)} placeholder="Pick projects they can log time to" options={projects.map((p) => ({ value: String(p.id), label: p.name, icon: <span className="dot" style={{ background: p.color }} /> }))} />}
          </div>
        </Field>
      </div>
    </Dialog>
  );
}

type BulkRow = { row: number; email: string; ok: boolean; message: string; tempPassword?: string | null };
const SAMPLE = "name,email,role,team,title\nJane Doe,jane@company.com,employee,Design,Product Designer\nSam Lee,sam@company.com,manager,Engineering,Engineering Lead";

export function BulkInviteDialog({ onClose }: { onClose: () => void }) {
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<BulkRow[] | null>(null);

  const submit = async () => {
    if (!csv.trim()) { toast.error("Paste at least one row"); return; }
    setBusy(true);
    try {
      const r = await post<BulkRow[]>("/people/invitations/bulk", { csv });
      setRows(r);
      invalidate("/people");
      const ok = r.filter((x) => x.ok).length;
      toast.success(`${ok} of ${r.length} invited`);
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  const onFile = async (file?: File) => { if (file) setCsv(await file.text()); };
  const passwords = (rows ?? []).filter((r) => r.tempPassword).map((r) => `${r.email},${r.tempPassword}`).join("\n");

  return (
    <Dialog open onClose={onClose} size="lg" title="Bulk invite" dismissable={false}
      description="Paste CSV rows: name, email, role (employee/manager), team name, title. A header row is optional. Up to 200 people."
      onSubmit={rows ? undefined : submit}
      footer={rows
        ? <>{passwords && <Button variant="ghost" onClick={() => copyText(passwords, "Passwords copied")}>Copy emails + passwords</Button>}<Button variant="primary" onClick={onClose}>Done</Button></>
        : <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Send invitations</Button></>}>
      {!rows ? (
        <div className="col gap-12">
          <Textarea rows={9} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={SAMPLE} className="mono" aria-label="CSV" />
          <div className="row small muted">
            <label className="link">Upload a .csv file<input type="file" accept=".csv,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} /></label>
            <span className="faint">·</span>
            <span className="link" onClick={() => setCsv(SAMPLE)}>Use the example</span>
          </div>
        </div>
      ) : (
        <div className="col gap-12">
          <div className="table-wrap" style={{ maxHeight: 360 }}>
            <table className="table">
              <thead><tr><th>#</th><th>Email</th><th>Result</th><th>Temporary password</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.row}>
                    <td className="faint num">{r.row}</td>
                    <td>{r.email || <span className="faint">—</span>}</td>
                    <td><span className={`row gap-4 ${r.ok ? "success" : "danger"}`}>{r.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}{r.message}</span></td>
                    <td className="mono">{r.tempPassword ?? <span className="faint">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {passwords && <p className="small faint">Passwords are shown only now. Invitation emails were queued for each invited person.</p>}
        </div>
      )}
    </Dialog>
  );
}
