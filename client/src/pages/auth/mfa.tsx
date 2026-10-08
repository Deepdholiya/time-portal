import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Input } from "@/components/arc";
import { post } from "@/lib/api";
import { useSession } from "@/lib/session";
import { AuthError, AuthLayout, authStyles as s, safeNext } from "./auth-layout";

export default function Mfa() {
  const { refresh, logout } = useSession();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verify = async (value = code) => {
    if (value.length !== 6) { setError("Enter the 6-digit code from your authenticator app."); return; }
    setBusy(true);
    setError(null);
    try {
      await post("/auth/mfa/verify", { code: value });
      const next = safeNext(params.get("next"));
      // /login forwards to ?next= once the session is fully signed in.
      if (next !== "/") nav(`/login?next=${encodeURIComponent(next)}`, { replace: true });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed.");
      setCode("");
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Two-factor authentication"
      subtitle="Enter the 6-digit code from your authenticator app to finish signing in."
      footer={<button type="button" className="link small" style={{ background: "none", border: 0 }} onClick={() => logout()}>Use a different account</button>}
    >
      <form className={s.form} onSubmit={(e) => { e.preventDefault(); verify(); }}>
        <AuthError>{error}</AuthError>
        <div className="field">
          <label htmlFor="mfa-code">Authentication code</label>
          <Input
            id="mfa-code" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" className={s.code}
            value={code}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(v);
              if (v.length === 6) verify(v);
            }}
          />
        </div>
        <Button type="submit" variant="primary" size="lg" fullWidth loading={busy} disabled={code.length !== 6}>Verify</Button>
      </form>
    </AuthLayout>
  );
}
