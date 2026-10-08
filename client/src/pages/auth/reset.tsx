import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Lock } from "lucide-react";
import { Button, Input, Loading, toast } from "@/components/arc";
import { post } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { AuthError, AuthLayout, PasswordRules, authStyles as s, passwordChecks } from "./auth-layout";

export default function Reset() {
  const { token = "" } = useParams();
  const nav = useNavigate();
  const { status, logout } = useSession();
  const info = useApi<{ email: string; name: string }>(`/auth/reset/${encodeURIComponent(token)}`);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const back = <Link to="/login" className="link small row gap-4" style={{ justifyContent: "center" }}><ArrowLeft size={12} />Back to sign in</Link>;

  if (info.loading) return <Loading label="Checking link…" />;
  if (info.error) {
    return (
      <AuthLayout title="Link expired" subtitle="Reset links work once and expire after an hour." footer={back}>
        <AuthError>{info.error.message}</AuthError>
        <Link to="/forgot"><Button variant="primary" fullWidth>Request a new link</Button></Link>
      </AuthLayout>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const failed = passwordChecks(password, confirm).find((c) => !c.ok);
    if (failed) { setError(failed.label === "Both passwords match" ? "The two passwords don't match." : `Password needs: ${failed.label.toLowerCase()}.`); return; }
    setBusy(true);
    setError(null);
    try {
      await post(`/auth/reset/${encodeURIComponent(token)}`, { password });
      toast.success("Password changed", { description: "Sign in with your new password." });
      // Every session is revoked by the reset, so make sure the client forgets any open one too.
      if (status === "ready") await logout();
      nav("/login?reset=1", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reset the password.");
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Set a new password" subtitle={<>For <span className="medium" style={{ color: "var(--text)" }}>{info.data?.email}</span></>} footer={back}>
      <form className={s.form} onSubmit={submit} noValidate>
        <AuthError>{error}</AuthError>
        <div className="field">
          <label htmlFor="rs-new">New password</label>
          <Input id="rs-new" type="password" autoComplete="new-password" autoFocus size="lg" icon={<Lock size={14} />} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="rs-confirm">Confirm password</label>
          <Input id="rs-confirm" type="password" autoComplete="new-password" size="lg" icon={<Lock size={14} />} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <PasswordRules password={password} confirm={confirm} />
        <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>Change password</Button>
      </form>
    </AuthLayout>
  );
}
