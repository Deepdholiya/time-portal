import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { useApp } from "../state";
import { AuthLayout } from "./Login";

type Invite = { email: string; name: string; role: string; title: string | null; team: string | null; allProjects: boolean; projects: string[]; expiresAt: string };
const ROLE: Record<string, string> = { ADMIN: "Admin", MANAGER: "Manager", EMPLOYEE: "Employee" };

// Public page an invitee lands on from their invitation link.
export function AcceptInvite({ token }: { token: string }) {
  const { reloadMe } = useApp();
  const [inv, setInv] = useState<Invite | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api<Invite>(`/auth/invite/${token}`).then((i) => { setInv(i); setName(i.name); }).catch((e) => setError(e.message)); }, [token]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError("Passwords don't match");
    setBusy(true); setError("");
    try {
      await api(`/auth/invite/${token}/accept`, { body: { name, password } });
      window.history.replaceState(null, "", "/");
      await reloadMe();
      window.location.assign("/");
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        {!inv && !error && <p className="muted">Checking your invitation…</p>}
        {!inv && error && (<><h1>Invitation unavailable</h1><p className="error">{error}</p><a className="btn" href="/">Go to sign in</a></>)}
        {inv && (
          <form className="stack" onSubmit={submit}>
            <h1>Join Bridge UX</h1>
            <p className="muted" style={{ margin: 0 }}>You've been invited as <strong>{ROLE[inv.role]}</strong>{inv.team ? ` on the ${inv.team} team` : ""}.</p>
            <div className="secret small">
              <div><span className="muted">Email</span> {inv.email}</div>
              <div><span className="muted">Project access</span> {inv.allProjects ? "All projects" : inv.projects.length ? inv.projects.join(", ") : "None yet (your admin can add projects later)"}</div>
            </div>
            <label className="field"><span>Your name</span><input required value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="field"><span>Create a password</span><input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            <label className="field"><span>Confirm password</span><input type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn primary block" disabled={busy}>{busy ? "Creating account…" : "Accept and create account"}</button>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
