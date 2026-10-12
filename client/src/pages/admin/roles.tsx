import { useMemo, useState } from "react";
import { Info, Lock, MoreHorizontal, Pencil, Plus, ShieldCheck, Trash2, UserCog, Users } from "lucide-react";
import { Page } from "@/components/app/page";
import { SearchField } from "@/components/app/search-field";
import { Avatar, Button, Dialog, EmptyState, ErrorState, Field, IconButton, Input, Menu, Select, SkeletonRows, Tabs, Textarea, Tooltip, toast } from "@/components/ui";
import { del, patch, post, put } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import { titleCase } from "@/lib/format";
import { PermissionsDialog, type FeatureDef } from "./user-dialogs";
import type { AdminUser } from "./users-members";
import { RoleBadge, useRoleOptions } from "./shared";
import s from "./roles.module.css";

type Matrix = Record<string, Record<string, string>>;
type RoleInfo = { key: string; name: string; builtIn: boolean; description: string; members: number };
type Resp = { features: Record<string, FeatureDef>; roles: string[]; roleList: RoleInfo[]; matrix: Matrix };

/**
 * Roles & permissions. "Roles" is the matrix: Admin is locked to full access, every other role (built-in or one the admin
 * added) is edited cell by cell. "People" sets one person's role and their own access on top of it, feature by feature.
 */
export default function Roles() {
  const { data, error, loading, reload, mutate } = useApi<Resp>("/settings/permissions");
  const { refresh } = useMe();
  const [tab, setTab] = useState<"roles" | "people">("roles");
  const [saving, setSaving] = useState<string | null>(null);
  const [form, setForm] = useState<RoleInfo | "new" | null>(null);
  const [removing, setRemoving] = useState<RoleInfo | null>(null);

  const editable = (data?.roleList ?? []).filter((r) => r.key !== "ADMIN");
  const change = async (role: RoleInfo, feature: string, level: string) => {
    if (!data) return;
    const prev = data.matrix;
    mutate({ ...data, matrix: { ...prev, [role.key]: { ...prev[role.key], [feature]: level } } });
    setSaving(`${role.key}:${feature}`);
    try {
      const matrix = await put<Matrix>("/settings/permissions", { role: role.key, feature, level });
      mutate({ ...data, matrix });
      toast.success(`${role.name}: ${data.features[feature].label} → ${titleCase(level)}`);
      refresh();
    } catch (e) {
      mutate({ ...data, matrix: prev });
      toast.error(e);
    } finally { setSaving(null); }
  };

  const groups = data ? [...new Set(Object.values(data.features).map((f) => f.group))] : [];
  const admin = data?.roleList.find((r) => r.key === "ADMIN");

  const roleHead = (r: RoleInfo) => (
    <div className={s.roleHead}>
      <span className="ellipsis">{r.name}</span>
      <Tooltip content={`${r.members} ${r.members === 1 ? "person" : "people"}`}><span className={s.members}><Users size={12} />{r.members}</span></Tooltip>
      {!r.builtIn && (
        <Menu placement="bottom-end" trigger={<IconButton size="sm" label={`${r.name} actions`} icon={<MoreHorizontal size={14} />} />} items={[
          { label: "Rename", icon: <Pencil size={14} />, onSelect: () => setForm(r) },
          { type: "separator" },
          { label: "Delete role", icon: <Trash2 size={14} />, danger: true, onSelect: () => setRemoving(r) },
        ]} />
      )}
    </div>
  );

  return (
    <Page
      title="Roles & permissions"
      icon={<ShieldCheck size={15} />}
      actions={tab === "roles" ? <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setForm("new")}>New role</Button> : undefined}
      tabs={<Tabs value={tab} onChange={(v) => setTab(v as "roles" | "people")} items={[{ value: "roles", label: "Roles" }, { value: "people", label: "People" }]} />}
      toolbar={<span className="small muted">{tab === "roles" ? "What each role can do. Changes save immediately and are written to the audit log." : "Give one person a different role, or more or less access than their role, feature by feature."}</span>}
    >
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <SkeletonRows /> : data && (tab === "people" ? <PeopleAccess roles={data.roleList} onChanged={reload} /> : (
        <div className={s.wrap}>
          <div className={s.scroller}>
            <table className={`table ${s.matrix}`}>
              <thead>
                <tr>
                  <th className={s.featureCol}>Feature</th>
                  {admin && <th className={s.roleCol}><span className="row gap-4"><Lock size={12} />{roleHead(admin)}</span></th>}
                  {editable.map((r) => <th key={r.key} className={s.roleCol}>{roleHead(r)}</th>)}
                </tr>
              </thead>
              {groups.map((g) => (
                <tbody key={g}>
                  <tr className={s.group}><td colSpan={editable.length + 2}>{g}</td></tr>
                  {Object.entries(data.features).filter(([, f]) => f.group === g).map(([k, f]) => (
                    <tr key={k}>
                      <td className={s.featureCol}>
                        <Tooltip content={f.help}>
                          <span className="row gap-4">{f.label}<Info size={12} className="faint" /></span>
                        </Tooltip>
                      </td>
                      <td className={s.roleCol}><span className={s.locked}>{titleCase(data.matrix.ADMIN?.[k] ?? "")}</span></td>
                      {editable.map((role) => {
                        const blocked = role.key !== "EMPLOYEE" && k === "companies";
                        return (
                          <td key={role.key} className={s.roleCol}>
                            <Select
                              size="sm" value={data.matrix[role.key]?.[k] ?? f.levels[0]} onChange={(v) => change(role, k, v)} aria-label={`${role.name} ${f.label}`}
                              disabled={saving === `${role.key}:${k}` || (blocked && role.key === "MANAGER")}
                              options={f.levels.map((l) => ({ value: l, label: titleCase(l) }))}
                              title={blocked && role.key === "MANAGER" ? "Managers can't be given company management" : undefined}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </div>
      ))}
      {form && data && (
        <RoleDialog
          role={form === "new" ? null : form} roles={data.roleList}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); reload(); refresh(); }}
        />
      )}
      {removing && (
        <Dialog open onClose={() => setRemoving(null)} title={`Delete “${removing.name}”?`}
          description={removing.members ? `${removing.members} ${removing.members === 1 ? "person has" : "people have"} this role and will become Employees. Their personal overrides stay.` : "Nobody has this role yet."}
          footer={<>
            <Button variant="secondary" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="danger" onClick={async () => {
              try { await del(`/settings/roles/${removing.key}`); toast.success(`Deleted ${removing.name}`); setRemoving(null); reload(); refresh(); } catch (e) { toast.error(e); }
            }}>Delete role</Button>
          </>}
        >{null}</Dialog>
      )}
    </Page>
  );
}

function RoleDialog({ role, roles, onClose, onSaved }: { role: RoleInfo | null; roles: RoleInfo[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [copyFrom, setCopyFrom] = useState("EMPLOYEE");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    if (name.trim().length < 2) { setErr("Give the role a name"); return; }
    setBusy(true);
    try {
      if (role) await patch(`/settings/roles/${role.key}`, { name, description: description || null });
      else await post("/settings/roles", { name, description: description || undefined, copyFrom });
      toast.success(role ? "Role updated" : `Added ${name.trim()}`);
      onSaved();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title={role ? "Rename role" : "New role"} description={role ? undefined : "It starts with the permissions of the role you copy, then you can change any of them in the matrix."}
      onSubmit={save} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>{role ? "Save" : "Create role"}</Button></>}>
      <div className="col" style={{ gap: 12 }}>
        <Field label="Name" required error={err ?? undefined}><Input autoFocus value={name} onChange={(e) => { setName(e.target.value); setErr(null); }} placeholder="e.g. Team lead" maxLength={40} /></Field>
        <Field label="Description"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={200} placeholder="What this role is for" /></Field>
        {!role && (
          <Field label="Start from">
            <Select value={copyFrom} onChange={setCopyFrom} options={roles.filter((r) => r.key !== "ADMIN").map((r) => ({ value: r.key, label: r.name }))} />
          </Field>
        )}
      </div>
    </Dialog>
  );
}

/** One row per person: their role, and a shortcut to their own feature-by-feature access. */
function PeopleAccess({ roles, onChanged }: { roles: RoleInfo[]; onChanged: () => void }) {
  const { me, refresh } = useMe();
  const users = useApi<AdminUser[]>("/people/users");
  const [q, setQ] = useState("");
  const [perms, setPerms] = useState<AdminUser | null>(null);
  const options = useRoleOptions(true);
  const list = useMemo(() => (users.data ?? []).filter((u) => u.status !== "DEACTIVATED" && (!q || `${u.name} ${u.email} ${u.title ?? ""}`.toLowerCase().includes(q.toLowerCase()))), [users.data, q]);
  const setRole = async (u: AdminUser, role: string) => {
    try {
      await put(`/people/${u.id}`, { role });
      toast.success(`${u.name} is now ${roles.find((r) => r.key === role)?.name ?? titleCase(role)}`);
      users.reload(); onChanged(); refresh();
    } catch (e) { toast.error(e); }
  };
  if (users.error) return <ErrorState error={users.error} onRetry={users.reload} />;
  if (!users.data) return <SkeletonRows />;
  return (
    <>
      <div className={s.peopleBar}><SearchField value={q} onChange={setQ} placeholder="Search people" /></div>
      {!list.length ? <EmptyState icon={<UserCog size={26} />} title="Nobody matches" description="Try another name or email." /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Person</th><th style={{ width: 220 }}>Role</th><th style={{ width: 160 }}>Access</th></tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id}>
                  <td><span className="row gap-8"><Avatar name={u.name} size={24} /><span className="col" style={{ gap: 0 }}><span className="medium">{u.name}</span><span className="small muted">{u.title ?? u.email}</span></span></span></td>
                  <td>
                    {u.id === me.user.id ? <RoleBadge role={u.role} /> : (
                      <Select size="sm" value={u.role} onChange={(v) => setRole(u, v)} options={options} aria-label={`${u.name}'s role`} />
                    )}
                  </td>
                  <td>
                    {u.role === "ADMIN" ? <span className="small faint">Full access</span> : (
                      <Button size="sm" variant="secondary" icon={<ShieldCheck size={14} />} onClick={() => setPerms(u)}>Edit access</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {perms && <PermissionsDialog user={perms} onClose={() => { setPerms(null); users.reload(); }} />}
    </>
  );
}
