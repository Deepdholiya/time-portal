import { useEffect, useState } from "react";
import { LogOut, MonitorSmartphone, RotateCcw } from "lucide-react";
import { Badge, Button, Combobox, Dialog, Field, Input, Select, SkeletonRows, Switch, Tooltip, toast, ErrorState } from "@/components/arc";
import { get, post, put } from "@/lib/api";
import { invalidate, useApi } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import { fmtDateTime, relTime, titleCase } from "@/lib/format";
import type { Options } from "@/lib/types";
import { numOrNull } from "./shared";
import type { AdminUser } from "./users-members";

export type FeatureDef = { label: string; group: string; levels: string[]; help: string };
// Mirrors server/src/permissions.ts FEATURES; used when the full matrix endpoint isn't available to the caller.
export const FEATURE_LABELS: Record<string, FeatureDef> = {
  timesheetsView: { label: "View timesheets", group: "Time", levels: ["own", "all"], help: "See other people's time entries and descriptions" },
  editOthersTime: { label: "Edit others' time", group: "Time", levels: ["no", "yes"], help: "Add, edit and delete time for other people" },
  approveTimesheets: { label: "Approve timesheets", group: "Time", levels: ["no", "yes"], help: "Approve or send back weekly timesheets, unlock approved weeks" },
  leaveApprove: { label: "Approve leave", group: "Time", levels: ["no", "yes"], help: "Approve or reject leave requests" },
  analytics: { label: "Analytics", group: "Insights", levels: ["none", "own", "all"], help: "Dashboards, reports and drill-down" },
  financials: { label: "Financials", group: "Insights", levels: ["none", "view"], help: "Rates, revenue, cost, profit and budgets" },
  export: { label: "Export", group: "Insights", levels: ["none", "own", "all"], help: "Excel, CSV and PDF exports" },
  roadmap: { label: "Roadmap", group: "Planning", levels: ["none", "view", "edit"], help: "View or edit roadmaps, drag timeline bars" },
  projects: { label: "Projects", group: "Planning", levels: ["view", "manage"], help: "Create, edit, archive projects, clients, milestones" },
  tasks: { label: "Tasks", group: "Planning", levels: ["own", "create", "manage"], help: "own: update your tasks · create: add tasks and subtasks · manage: assign, reassign, dependencies, bulk edit" },
  directory: { label: "Employee directory", group: "People", levels: ["limited", "full"], help: "Limited hides confidential fields like phone and rates" },
  people: { label: "User management", group: "People", levels: ["none", "invite", "manage"], help: "Invite people, deactivate, reset passwords, revoke sessions" },
  aiAssist: { label: "AI assistant", group: "AI", levels: ["no", "yes"], help: "AI task summaries" },
  clientEmail: { label: "Client emails", group: "AI", levels: ["no", "yes"], help: "Draft and send client update emails" },
  audit: { label: "Audit logs", group: "Admin", levels: ["no", "yes"], help: "View and export the audit log" },
  settings: { label: "Company settings", group: "Admin", levels: ["no", "yes"], help: "Company settings, roles & permissions, integrations, automation" },
  companies: { label: "Companies", group: "Admin", levels: ["no", "yes"], help: "Create, switch and archive companies" },
};
export const levelLabel = (l: string) => titleCase(l);

export function EditUserDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const { me, can, isAdmin, currency } = useMe();
  const opts = useApi<Options>("/options");
  const fin = can("financials", "view");
  const [f, setF] = useState({
    name: user.name, role: user.role, title: user.title ?? "", phone: user.phone ?? "", teamId: user.team ? String(user.team.id) : "",
    weeklyCapacity: String(user.weeklyCapacity), costRate: user.costRate != null ? String(user.costRate) : "", billRate: user.billRate != null ? String(user.billRate) : "",
    allProjects: user.allProjects, projectIds: user.projectIds.map(String), companyIds: user.companies.map((c) => String(c.id)),
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const self = user.id === me.user.id;

  const save = async () => {
    setBusy(true);
    try {
      await put(`/people/${user.id}`, {
        name: f.name.trim(), title: f.title.trim() || null, phone: f.phone.trim() || null, teamId: f.teamId ? Number(f.teamId) : null,
        weeklyCapacity: Number(f.weeklyCapacity) || 0, allProjects: f.allProjects, projectIds: f.projectIds.map(Number),
        ...(isAdmin && !self ? { role: f.role } : {}),
        ...(isAdmin ? { costRate: numOrNull(f.costRate), companyIds: f.companyIds.map(Number) } : {}),
        ...(fin ? { billRate: numOrNull(f.billRate) } : {}),
      });
      toast.success(`Saved ${f.name}`);
      invalidate("/people");
      onClose();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  const projects = (opts.data?.projects ?? []).filter((p) => !p.parentId);
  return (
    <Dialog open onClose={onClose} title={`Edit ${user.name}`} description={user.email} size="lg" onSubmit={save} dismissable={false}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Save changes</Button></>}>
      <div className="form-grid">
        <Field label="Name"><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Role" hint={self ? "You can't change your own role." : !isAdmin ? "Only admins can change roles." : undefined}>
          <Select value={f.role} onChange={(v) => set("role", v)} disabled={self || !isAdmin} options={[{ value: "EMPLOYEE", label: "Employee" }, { value: "MANAGER", label: "Manager" }, { value: "ADMIN", label: "Admin" }]} />
        </Field>
        <Field label="Title"><Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Product Designer" /></Field>
        <Field label="Team"><Select value={f.teamId} onChange={(v) => set("teamId", v)} options={[{ value: "", label: "No team" }, ...(opts.data?.teams ?? []).map((t) => ({ value: String(t.id), label: t.name }))]} /></Field>
        <Field label="Weekly capacity"><Input type="number" min={0} max={80} value={f.weeklyCapacity} onChange={(e) => set("weeklyCapacity", e.target.value)} suffix="h" /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        {isAdmin && <Field label="Cost rate" hint="Visible to admins only."><Input type="number" min={0} step="any" value={f.costRate} onChange={(e) => set("costRate", e.target.value)} suffix={`${currency}/h`} /></Field>}
        {fin && <Field label="Bill rate"><Input type="number" min={0} step="any" value={f.billRate} onChange={(e) => set("billRate", e.target.value)} suffix={`${currency}/h`} /></Field>}
        <Field label="Project access" className="full">
          <div className="col">
            <Switch checked={f.allProjects} onChange={(v) => set("allProjects", v)} label="All projects in this company" />
            {!f.allProjects && <Combobox multiple value={f.projectIds} onChange={(v) => set("projectIds", v)} placeholder="Pick projects" options={projects.map((p) => ({ value: String(p.id), label: p.name, icon: <span className="dot" style={{ background: p.color }} /> }))} />}
          </div>
        </Field>
        {isAdmin && (
          <Field label="Companies" className="full" hint="They can switch between these companies. The current company can't be removed here.">
            <Combobox multiple value={f.companyIds} onChange={(v) => set("companyIds", v.includes(String(me.company.id)) || !f.companyIds.includes(String(me.company.id)) ? v : [...v, String(me.company.id)])}
              options={me.companies.map((c) => ({ value: String(c.id), label: c.name, icon: <span className="swatch" style={{ background: c.color }} /> }))} />
          </Field>
        )}
      </div>
    </Dialog>
  );
}

type PermResp = { role: Record<string, string>; effective: Record<string, string>; overrides: Record<string, string> };
export function PermissionsDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [data, setData] = useState<PermResp | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [draft, setDraft] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { get<PermResp>(`/people/${user.id}/permissions`).then(setData, setError); }, [user.id]);

  const value = (k: string) => (k in draft ? draft[k] : data?.overrides[k] ?? null);
  const save = async () => {
    setBusy(true);
    try {
      await put(`/people/${user.id}/permissions`, draft);
      toast.success(`Access updated for ${user.name}`);
      onClose();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const groups = [...new Set(Object.values(FEATURE_LABELS).map((f) => f.group))];

  return (
    <Dialog open onClose={onClose} size="lg" title={`Access for ${user.name}`} description={`Overrides apply on top of the ${titleCase(user.role)} role in this company. Leave a feature on "Role default" to follow the role.`}
      onSubmit={save} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy} disabled={!Object.keys(draft).length}>Save overrides</Button></>}>
      {error ? <ErrorState error={error} /> : !data ? <SkeletonRows rows={6} /> : (
        <div className="col" style={{ gap: 0 }}>
          {groups.map((g) => (
            <div key={g}>
              <div className="section-title" style={{ marginTop: 12 }}>{g}</div>
              {Object.entries(FEATURE_LABELS).filter(([, f]) => f.group === g).map(([k, f]) => {
                const v = value(k);
                return (
                  <div key={k} className="row" style={{ minHeight: 36, borderBottom: "1px solid var(--border)" }}>
                    <Tooltip content={f.help}><span className="grow">{f.label}</span></Tooltip>
                    <span className="small faint" style={{ width: 120 }}>Role: {levelLabel(data.role[k])}</span>
                    {v !== null && v !== data.role[k] && <Badge tone="accent" size="sm">Override</Badge>}
                    <Select size="sm" fullWidth={false} style={{ width: 170 }} value={v ?? ""} onChange={(nv) => setDraft((d) => ({ ...d, [k]: nv === "" ? null : nv }))}
                      options={[{ value: "", label: `Role default (${levelLabel(data.role[k])})` }, ...f.levels.map((l) => ({ value: l, label: levelLabel(l) }))]} aria-label={f.label} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

type Sess = { id: string; ip: string | null; userAgent: string | null; createdAt: string; lastSeenAt: string };
export function SessionsDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const { data, error, loading, reload } = useApi<Sess[]>(`/people/${user.id}/sessions`);
  const [busy, setBusy] = useState(false);
  const revoke = async () => {
    setBusy(true);
    try {
      const r = await post<{ revoked: number }>(`/people/${user.id}/revoke-sessions`);
      toast.success(`Signed ${user.name} out of ${r.revoked} ${r.revoked === 1 ? "session" : "sessions"}`);
      reload();
      invalidate("/people/users");
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} size="lg" title={`${user.name}'s sessions`} description="Devices currently signed in."
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button><Button variant="danger" icon={<LogOut size={14} />} loading={busy} disabled={!data?.length} onClick={revoke}>Revoke all sessions</Button></>}>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <SkeletonRows rows={3} /> : !data?.length ? <p className="muted">No active sessions.</p> : <SessionList rows={data} />}
    </Dialog>
  );
}

export function describeAgent(ua?: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /HeadlessChrome/.test(ua) ? "Headless Chrome" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : /curl/.test(ua) ? "curl" : ua.split(" ")[0];
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export function SessionList({ rows, onRevoke }: { rows: (Sess & { current?: boolean })[]; onRevoke?: (id: string) => void }) {
  return (
    <div className="col" style={{ gap: 0 }}>
      {rows.map((s) => (
        <div key={s.id} className="row" style={{ minHeight: 44, borderBottom: "1px solid var(--border)" }}>
          <MonitorSmartphone size={16} className="faint" />
          <div className="grow col" style={{ gap: 0 }}>
            <span className="row">{describeAgent(s.userAgent)}{s.current && <Badge tone="green" size="sm">This device</Badge>}</span>
            <span className="tiny faint">{s.ip ?? "Unknown IP"} · signed in {fmtDateTime(s.createdAt)} · active {relTime(s.lastSeenAt)}</span>
          </div>
          {onRevoke && !s.current && <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} onClick={() => onRevoke(s.id)}>Revoke</Button>}
        </div>
      ))}
    </div>
  );
}

