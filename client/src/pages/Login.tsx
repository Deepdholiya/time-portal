import { useState, type FormEvent, type ReactNode } from "react";
import { api } from "../api";
import { useApp } from "../state";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-side">
        <div className="brand"><span className="logo">B</span><div><strong>Bridge UX</strong><small>Time Portal</small></div></div>
        <div>
          <h2>Know where every hour goes, by project, sub-project and person.</h2>
          <ul>
            <li>Log time with a timer or by hand, with a note on what you did</li>
            <li>Submit your week for approval in one click</li>
            <li>See analytics and the roadmap your role allows</li>
          </ul>
        </div>
        <small className="muted">Bridge UX internal tool</small>
      </div>
      <div className="auth-main">{children}</div>
    </div>
  );
}

export function Login() {
  const { reloadMe } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try { await api("/auth/login", { body: { email, password } }); await reloadMe(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  const demo = (e: string) => { setEmail(e); setPassword("password123"); };

  return (
    <AuthLayout>
      <form className="auth-card" onSubmit={submit}>
        <h1>Sign in</h1>
        <p className="muted" style={{ margin: 0 }}>Use your work email. New here? Ask your admin for an invitation link.</p>
        <label className="field full"><span>Work email</span><input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field full"><span>Password</span><input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary block" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <div className="demo">
          <span className="muted">Demo:</span>
          <button type="button" className="link" onClick={() => demo("admin@example.com")}>Admin</button>
          <button type="button" className="link" onClick={() => demo("priya@example.com")}>Manager</button>
          <button type="button" className="link" onClick={() => demo("neha@example.com")}>Employee</button>
        </div>
      </form>
    </AuthLayout>
  );
}
