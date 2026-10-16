import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Mail, MailCheck } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { post } from "@/lib/api";
import { AuthError, AuthLayout, AuthNotice, authStyles as s } from "./auth-layout";

export default function Forgot() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ devLink?: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError("Enter the email you sign in with."); return; }
    setBusy(true);
    setError(null);
    try {
      setSent(await post<{ ok: boolean; devLink?: string }>("/auth/forgot", { email }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the reset link.");
    } finally {
      setBusy(false);
    }
  };

  const back = <Link to="/login" className="link small row gap-4" style={{ justifyContent: "center" }}><ArrowLeft size={12} />Back to sign in</Link>;

  if (sent) {
    return (
      <AuthLayout title="Check your email" subtitle={<>If an account exists for <span className="medium" style={{ color: "var(--text)" }}>{email}</span>, we sent a link to reset the password. It works for one hour.</>} footer={back}>
        <div className="row" style={{ justifyContent: "center", color: "var(--text-3)", padding: "4px 0" }}><MailCheck size={28} strokeWidth={1.5} /></div>
        {sent.devLink && (
          <AuthNotice>
            Email isn't configured in this environment. <Link className="link" to={sent.devLink}>Open the reset link</Link>.
          </AuthNotice>
        )}
        <Button variant="secondary" fullWidth onClick={() => setSent(null)}>Use a different email</Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Reset your password" subtitle="Enter your work email and we'll send you a link to set a new password." footer={back}>
      <form className={s.form} onSubmit={submit} noValidate>
        <AuthError>{error}</AuthError>
        <div className="field">
          <label htmlFor="forgot-email">Email</label>
          <Input id="forgot-email" type="email" autoFocus size="lg" icon={<Mail size={14} />} placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>Send reset link</Button>
      </form>
    </AuthLayout>
  );
}
