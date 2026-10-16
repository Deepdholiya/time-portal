import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { Button, Input, toast } from "@/components/ui";
import { post } from "@/lib/api";
import { useSession } from "@/lib/session";
import { AuthError, AuthLayout, PasswordRules, authStyles as s, passwordChecks } from "./auth-layout";

/** Forced first-login screen: invited users (and users an admin reset) replace their temporary password. */
export default function SetPassword() {
  const { me, refresh, logout } = useSession();
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invited = me?.user.status === "INVITED";
  const firstName = me?.user.name.split(" ")[0] ?? "";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const failed = passwordChecks(password, confirm).find((c) => !c.ok);
    if (failed) { setError(failed.label === "Both passwords match" ? "The two passwords don't match." : `Password needs: ${failed.label.toLowerCase()}.`); return; }
    setBusy(true);
    setError(null);
    try {
      await post("/auth/set-password", { password });
      nav("/", { replace: true });
      await refresh();
      toast.success(invited ? `Welcome to ${me?.company?.name ?? "Time Portal"}, ${firstName}` : "Password updated", { description: invited ? "Your account is active. Start by logging time or checking your tasks." : undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't set the password.");
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={invited ? `Welcome${firstName ? `, ${firstName}` : ""}` : "Choose a new password"}
      subtitle={invited
        ? <>You signed in with a temporary password{me?.company ? <> for <span className="medium" style={{ color: "var(--text)" }}>{me.company.name}</span></> : null}. Set a permanent password to activate your account.</>
        : "Your password was reset. Choose a new one to continue."}
      footer={<>
        <span>Signed in as {me?.user.email}</span>
        <button type="button" className="link small" style={{ background: "none", border: 0 }} onClick={() => logout()}>Sign out</button>
      </>}
    >
      <form className={s.form} onSubmit={submit} noValidate>
        <AuthError>{error}</AuthError>
        <div className="field">
          <label htmlFor="sp-new">New password</label>
          <Input id="sp-new" type="password" autoComplete="new-password" autoFocus size="lg" icon={<Lock size={14} />} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="sp-confirm">Confirm password</label>
          <Input id="sp-confirm" type="password" autoComplete="new-password" size="lg" icon={<Lock size={14} />} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <PasswordRules password={password} confirm={confirm} />
        <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>Set password and continue</Button>
      </form>
    </AuthLayout>
  );
}
