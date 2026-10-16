import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Lock, Mail } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { post, ApiError } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { AuthError, AuthLayout, AuthNotice, authStyles as s } from "./auth-layout";

const SSO_ERRORS: Record<string, string> = {
  sso: "Single sign-on didn't complete. Try again or use your password.",
  "sso-account": "No active account matches that sign-in. Ask your admin to invite you first.",
};

function GoogleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.7H.94v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.96 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.28-1.72V4.95H.94A9 9 0 0 0 0 9c0 1.45.35 2.83.94 4.05l3.02-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .94 4.95l3.02 2.33C4.67 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}
function MicrosoftIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
      <path fill="#F25022" d="M0 0h7.6v7.6H0z" /><path fill="#7FBA00" d="M8.4 0H16v7.6H8.4z" /><path fill="#00A4EF" d="M0 8.4h7.6V16H0z" /><path fill="#FFB900" d="M8.4 8.4H16V16H8.4z" />
    </svg>
  );
}

export default function Login() {
  const { refresh } = useSession();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") ? SSO_ERRORS[params.get("error")!] ?? "Sign-in failed." : null);
  const { data: sso } = useApi<{ google: boolean; microsoft: boolean }>("/auth/sso/providers");
  const anySso = !!(sso?.google || sso?.microsoft);
  const nextQs = params.get("next") ? `?next=${encodeURIComponent(params.get("next")!)}` : "";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) { setError("Enter your email and password."); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ mfaRequired: boolean; mustChangePassword: boolean }>("/auth/login", { email, password });
      // The app shell routes to the forced set-password screen or ?next= once the session reloads.
      await refresh();
      if (r.mfaRequired) nav(`/mfa${nextQs}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 423) setError(err.message);
      else if (err instanceof ApiError && err.status === 403) setError(err.message);
      else setError(err instanceof Error ? err.message : "Sign-in failed.");
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in to Time Portal"
      subtitle="Track time, plan work and ship on schedule."
      footer={<>
        <span>New here? Your admin sends you an invitation with a temporary password.</span>
      </>}
    >
      {anySso && (
        <>
          <div className="col" style={{ gap: 8 }}>
            {sso?.google && <Button fullWidth size="lg" icon={<GoogleIcon />} onClick={() => { window.location.href = "/api/auth/sso/google/start"; }}>Continue with Google</Button>}
            {sso?.microsoft && <Button fullWidth size="lg" icon={<MicrosoftIcon />} onClick={() => { window.location.href = "/api/auth/sso/microsoft/start"; }}>Continue with Microsoft</Button>}
          </div>
          <div className={s.divider}>or</div>
        </>
      )}
      <form className={s.form} onSubmit={submit} noValidate>
        {params.get("reset") === "1" && !error && <AuthNotice>Your password was changed. Sign in with the new one.</AuthNotice>}
        <AuthError>{error}</AuthError>
        <div className="field">
          <label htmlFor="login-email">Email</label>
          <Input id="login-email" type="email" autoComplete="username" autoFocus size="lg" icon={<Mail size={14} />} placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <div className={s.labelRow}>
            <label htmlFor="login-password">Password</label>
            <Link to={`/forgot${email ? `?email=${encodeURIComponent(email)}` : ""}`} className="link small">Forgot password?</Link>
          </div>
          <Input id="login-password" type="password" autoComplete="current-password" size="lg" icon={<Lock size={14} />} placeholder="Password or temporary password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>Sign in</Button>
      </form>
    </AuthLayout>
  );
}
