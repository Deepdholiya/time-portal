import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { useApp } from "../state";
import { Modal } from "../components/Modal";
import { Icon } from "../components/Icons";
import { initials, ROLE_LABEL } from "../App";

type Person = { id: number; name: string; email: string; role: string; title: string | null; weeklyCapacity: number; allProjects: boolean; active: boolean; team: { id: number; name: string } | null; projectIds: number[] };
type Invite = { id: number; email: string; name: string; role: string; teamId: number | null; token: string; status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED"; expiresAt: string; createdAt: string; acceptedAt: string | null; invitedBy: { name: string } | null; projectIds: number[]; allProjects: boolean };
const INV_TONE: Record<string, string> = { PENDING: "warn", ACCEPTED: "good", REVOKED: "", EXPIRED: "bad" };
const INV_LABEL: Record<string, string> = { PENDING: "Pending", ACCEPTED: "Accepted", REVOKED: "Revoked", EXPIRED: "Expired" };
const inviteLink = (token: string) => `${window.location.origin}/invite/${token}`;

// Members and invitations (Time2book / Gamma / Supabase team settings pattern).
export function People() {
  const { me, options, refreshOptions, toast } = useApp();
  const [tab, setTab] = useState<"members" | "invites" | "teams">("members");
  const [people, setPeople] = useState<Person[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [editing, setEditing] = useState<Person | null>(null);
  const [inviting, setInviting] = useState(false);
  const [link, setLink] = useState<{ name: string; email: string; url: string } | null>(null);
  const [secret, setSecret] = useState<{ name: string; email: string; password: string } | null>(null);
  const [q, setQ] = useState("");
  const [newTeam, setNewTeam] = useState("");
  const load = () => Promise.all([api<Person[]>("/people").then(setPeople), api<Invite[]>("/people/invitations").then(setInvites)]);
  useEffect(() => { load(); }, []);
  const projectName = new Map((options?.allProjects ?? []).map((p) => [p.id, p.name]));
  const pendingCount = invites.filter((i) => i.status === "PENDING").length;

  async function setRole(p: Person, role: string) {
    try { await api(`/people/${p.id}`, { method: "PUT", body: { role } }); toast(`${p.name} is now ${ROLE_LABEL[role]}`); load(); } catch (e) { toast((e as Error).message, "error"); }
  }
  async function resetPw(p: Person) {
    if (!confirm(`Reset ${p.name}'s password? Their current password stops working.`)) return;
    const r = await api<{ tempPassword: string }>(`/people/${p.id}/reset-password`, { method: "POST" });
    setSecret({ name: p.name, email: p.email, password: r.tempPassword });
  }
  async function resend(i: Invite) {
    try { const r = await api<Invite>(`/people/invitations/${i.id}/resend`, { method: "POST" }); setLink({ name: i.name, email: i.email, url: inviteLink(r.token) }); load(); } catch (e) { toast((e as Error).message, "error"); }
  }
  async function revoke(i: Invite) {
    if (!confirm(`Revoke the invitation for ${i.email}? The link stops working.`)) return;
    try { await api(`/people/invitations/${i.id}/revoke`, { method: "POST" }); toast("Invitation revoked"); load(); } catch (e) { toast((e as Error).message, "error"); }
  }
  async function addTeam(e: FormEvent) {
    e.preventDefault();
    try { await api("/people/teams", { body: { name: newTeam } }); setNewTeam(""); await refreshOptions(); toast("Team added"); } catch (err) { toast((err as Error).message, "error"); }
  }

  const shown = (people ?? []).filter((p) => !q || `${p.name} ${p.email} ${p.team?.name ?? ""} ${p.title ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <header className="page-head">
        <div><h1>People</h1><p>Invite employees, set their role and team, and choose which projects they can log time on.</p></div>
        <button className="btn primary" onClick={() => setInviting(true)}><Icon name="plus" /> Invite</button>
      </header>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "members"} className={tab === "members" ? "on" : ""} onClick={() => setTab("members")}>Members <span className="count">{people?.filter((p) => p.active).length ?? 0}</span></button>
        <button role="tab" aria-selected={tab === "invites"} className={tab === "invites" ? "on" : ""} onClick={() => setTab("invites")}>Invitations {pendingCount > 0 && <span className="count">{pendingCount} pending</span>}</button>
        <button role="tab" aria-selected={tab === "teams"} className={tab === "teams" ? "on" : ""} onClick={() => setTab("teams")}>Teams <span className="count">{options?.teams.length ?? 0}</span></button>
      </div>

      {tab === "members" && (
        <>
          <div className="filters"><input type="search" placeholder="Filter members…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter members" style={{ height: 32, minHeight: 32 }} /></div>
          <div className="card flush table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Role</th><th>Team</th><th>Project access</th><th className="num">Capacity</th><th>Status</th><th /></tr></thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id} className={`hoverable ${p.active ? "" : "inactive"}`}>
                    <td><div className="row"><span className="avatar">{initials(p.name)}</span><div><strong>{p.name}</strong>{p.id === me!.id && <span className="pill sm" style={{ marginLeft: 6 }}>You</span>}<div className="muted small">{p.email}{p.title ? ` · ${p.title}` : ""}</div></div></div></td>
                    <td>
                      <select className="status-select" style={{ height: 30, fontSize: 13, minWidth: 110 }} value={p.role} disabled={p.id === me!.id} onChange={(e) => setRole(p, e.target.value)} aria-label={`Role of ${p.name}`}>
                        {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td className="small">{p.team?.name ?? <span className="muted">—</span>}</td>
                    <td className="small" style={{ maxWidth: 260 }}>{p.allProjects || p.role === "ADMIN" ? "All projects" : p.projectIds.length ? p.projectIds.map((id) => projectName.get(id)).filter(Boolean).join(", ") : <span className="muted">None</span>}</td>
                    <td className="num small">{p.weeklyCapacity}h/wk</td>
                    <td>{p.active ? <span className="pill good">Active</span> : <span className="pill">Disabled</span>}</td>
                    <td className="nowrap" style={{ textAlign: "right" }}>
                      <button className="btn sm ghost" onClick={() => setEditing(p)}>Manage access</button>
                      <button className="icon-btn" title="Reset password" aria-label="Reset password" onClick={() => resetPw(p)}><Icon name="link" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "invites" && (
        <div className="card flush table-wrap">
          <table>
            <thead><tr><th>Invitee</th><th>Role</th><th>Status</th><th>Sent</th><th>Expires</th><th /></tr></thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.id} className="hoverable">
                  <td><strong>{i.name}</strong><div className="muted small">{i.email}</div></td>
                  <td className="small">{ROLE_LABEL[i.role]}{i.teamId ? ` · ${options?.teams.find((t) => t.id === i.teamId)?.name ?? ""}` : ""}</td>
                  <td><span className={`pill ${INV_TONE[i.status]}`}>{INV_LABEL[i.status]}</span></td>
                  <td className="small">{new Date(i.createdAt).toLocaleDateString()}<div className="muted">{i.invitedBy?.name}</div></td>
                  <td className="small">{i.status === "ACCEPTED" ? <span className="muted">Joined {new Date(i.acceptedAt!).toLocaleDateString()}</span> : new Date(i.expiresAt).toLocaleDateString()}</td>
                  <td className="nowrap" style={{ textAlign: "right" }}>
                    {i.status === "PENDING" && <button className="btn sm ghost" onClick={() => setLink({ name: i.name, email: i.email, url: inviteLink(i.token) })}><Icon name="link" /> Copy link</button>}
                    {(i.status === "PENDING" || i.status === "EXPIRED" || i.status === "REVOKED") && <button className="btn sm ghost" onClick={() => resend(i)}>Resend</button>}
                    {i.status === "PENDING" && <button className="btn sm danger ghost" onClick={() => revoke(i)}>Revoke</button>}
                  </td>
                </tr>
              ))}
              {!invites.length && <tr><td colSpan={6} className="empty">No invitations yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === "teams" && (
        <div className="card">
          <ul className="mini-list">
            {options?.teams.map((t) => {
              const ms = people?.filter((p) => p.team?.id === t.id && p.active) ?? [];
              return <li key={t.id}><strong className="grow">{t.name}</strong><span className="avatars">{ms.slice(0, 8).map((m) => <span key={m.id} className="avatar sm" title={m.name}>{initials(m.name)}</span>)}</span><span className="muted small" style={{ width: 80, textAlign: "right" }}>{ms.length} member{ms.length === 1 ? "" : "s"}</span></li>;
            })}
          </ul>
          <form onSubmit={addTeam} className="row" style={{ marginTop: 14 }}><input required placeholder="New team name" value={newTeam} onChange={(e) => setNewTeam(e.target.value)} /><button className="btn">Add team</button></form>
        </div>
      )}

      {inviting && <AccessForm mode="invite" onClose={() => setInviting(false)} onSaved={async (r) => { setInviting(false); await load(); if (r) setLink(r); setTab("invites"); }} />}
      {editing && <AccessForm mode="edit" person={editing} isSelf={editing.id === me!.id} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await Promise.all([load(), refreshOptions()]); toast("Saved"); }} />}
      {link && (
        <Modal title="Invitation link" onClose={() => setLink(null)}>
          <p style={{ marginTop: 0 }}>Send this link to <strong>{link.name}</strong> ({link.email}). It works once and expires in 7 days.</p>
          <div className="secret"><code>{link.url}</code></div>
          <div className="row end">
            <button className="btn" onClick={() => { navigator.clipboard?.writeText(link.url); toast("Link copied"); }}><Icon name="copy" /> Copy link</button>
            <button className="btn primary" onClick={() => setLink(null)}>Done</button>
          </div>
        </Modal>
      )}
      {secret && (
        <Modal title="New temporary password" onClose={() => setSecret(null)}>
          <p style={{ marginTop: 0 }}>Share this with {secret.name}. It's shown only once, and they can change it from their profile.</p>
          <div className="secret"><div><span className="muted">Email</span> {secret.email}</div><div><span className="muted">Password</span> <code>{secret.password}</code></div></div>
          <div className="row end"><button className="btn" onClick={() => { navigator.clipboard?.writeText(`Email: ${secret.email}\nPassword: ${secret.password}`); toast("Copied"); }}><Icon name="copy" /> Copy</button><button className="btn primary" onClick={() => setSecret(null)}>Done</button></div>
        </Modal>
      )}
    </>
  );
}

function AccessForm({ mode, person, isSelf, onClose, onSaved }: { mode: "invite" | "edit"; person?: Person; isSelf?: boolean; onClose: () => void; onSaved: (r?: { name: string; email: string; url: string }) => void }) {
  const { options, toast } = useApp();
  const [d, setD] = useState({
    name: person?.name ?? "", email: person?.email ?? "", role: person?.role ?? "EMPLOYEE", title: person?.title ?? "",
    teamId: person?.team?.id ?? null as number | null, weeklyCapacity: person?.weeklyCapacity ?? 40, allProjects: person?.allProjects ?? false,
    projectIds: new Set(person?.projectIds ?? []), active: person?.active ?? true,
  });
  const tops = (options?.allProjects ?? []).filter((p) => !p.parentId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = { ...d, title: d.title || null, projectIds: [...d.projectIds] };
    try {
      if (mode === "edit") { await api(`/people/${person!.id}`, { method: "PUT", body }); onSaved(); }
      else { const { active: _a, ...inv } = body; const r = await api<Invite>("/people/invitations", { body: inv }); onSaved({ name: d.name, email: d.email, url: inviteLink(r.token) }); }
    } catch (err) { toast((err as Error).message, "error"); }
  }

  return (
    <Modal title={mode === "edit" ? `Manage access · ${person!.name}` : "Invite a person"} onClose={onClose} wide>
      <form onSubmit={submit} className="form-grid">
        <label className="field"><span>Full name</span><input required value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></label>
        <label className="field"><span>Work email</span><input type="email" required value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} /></label>
        <label className="field"><span>Job title</span><input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></label>
        <label className="field"><span>Role</span>
          <select value={d.role} disabled={isSelf} onChange={(e) => setD({ ...d, role: e.target.value })}>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label className="field"><span>Team</span>
          <select value={d.teamId ?? ""} onChange={(e) => setD({ ...d, teamId: e.target.value ? Number(e.target.value) : null })}><option value="">No team</option>{options?.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        </label>
        <label className="field"><span>Weekly capacity (h)</span><input type="number" min={0} max={80} value={d.weeklyCapacity} onChange={(e) => setD({ ...d, weeklyCapacity: Number(e.target.value) })} /></label>
        <div className="field span3">
          <span>Project access</span>
          <div className="segmented" style={{ alignSelf: "flex-start" }}>
            <button type="button" className={d.allProjects || d.role === "ADMIN" ? "on" : ""} onClick={() => setD({ ...d, allProjects: true })}>All projects</button>
            <button type="button" className={!d.allProjects && d.role !== "ADMIN" ? "on" : ""} disabled={d.role === "ADMIN"} onClick={() => setD({ ...d, allProjects: false })}>Selected projects</button>
          </div>
          {!d.allProjects && d.role !== "ADMIN" && (
            <div className="checklist">
              {tops.map((p) => (
                <label key={p.id} className="check"><input type="checkbox" checked={d.projectIds.has(p.id)} onChange={(e) => { const n = new Set(d.projectIds); e.target.checked ? n.add(p.id) : n.delete(p.id); setD({ ...d, projectIds: n }); }} /><span className="dot" style={{ background: p.color, margin: 0 }} />{p.name}</label>
              ))}
            </div>
          )}
          <small className="muted">Access to a project includes all its sub-projects. Admins always see every project.</small>
        </div>
        {mode === "edit" && <label className="check span3"><input type="checkbox" checked={d.active} disabled={isSelf} onChange={(e) => setD({ ...d, active: e.target.checked })} /> Account active (turn off to revoke access)</label>}
        <div className="row end span3"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary">{mode === "edit" ? "Save" : "Create invitation"}</button></div>
      </form>
    </Modal>
  );
}
