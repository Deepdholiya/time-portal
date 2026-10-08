import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Badge, Button, Dialog, Field, Input, toast } from "@/components/ui";
import { post } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Block } from "./block";
import s from "./account.module.css";

type Setup = { secret: string; qr?: string; uri?: string };

/** Two-factor enrolment and removal. `bare` renders without the section frame (MFA gate). */
export function MfaSection({ bare }: { bare?: boolean }) {
  const { me, refresh } = useSession();
  const on = !!me?.user.mfaEnabled;
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [disable, setDisable] = useState(false);
  const [password, setPassword] = useState("");

  const start = async () => {
    setBusy(true);
    try { setSetup(await post<Setup>("/auth/mfa/setup")); setCode(""); } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const enable = async () => {
    if (!/^\d{6}$/.test(code.trim())) { toast.error("Enter the 6-digit code from your app"); return; }
    setBusy(true);
    try {
      await post("/auth/mfa/enable", { code: code.trim() });
      toast.success("Two-factor authentication is on");
      setSetup(null);
      await refresh();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const turnOff = async () => {
    setBusy(true);
    try {
      await post("/auth/mfa/disable", { password });
      toast.success("Two-factor authentication is off");
      setDisable(false); setPassword("");
      await refresh();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  const otpauth = setup && (setup.uri ?? `otpauth://totp/Time%20Portal:${encodeURIComponent(me?.user.email ?? "")}?secret=${setup.secret}&issuer=Time%20Portal`);
  const body = setup ? (
    <div className={s.mfaSetup}>
      {setup.qr ? <img src={setup.qr} alt="QR code for your authenticator app" width={168} height={168} className={s.qr} /> : null}
      <div className="col gap-12 grow">
        <ol className={s.steps}>
          <li>Scan the QR code with your authenticator app{setup.qr ? "" : " (or add the key below manually)"}.</li>
          <li>Can't scan? Enter this key: <code className={s.key}>{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</code></li>
          <li>Type the 6-digit code the app shows.</li>
        </ol>
        {!setup.qr && <code className={s.key} style={{ wordBreak: "break-all" }}>{otpauth}</code>}
        <form className="row" onSubmit={(e) => { e.preventDefault(); enable(); }}>
          <Field><Input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} style={{ width: 140 }} aria-label="Verification code" /></Field>
          <Button type="submit" variant="primary" loading={busy}>Verify and turn on</Button>
          <Button variant="ghost" onClick={() => setSetup(null)}>Cancel</Button>
        </form>
      </div>
    </div>
  ) : on ? (
    <div className="row">
      <ShieldCheck size={16} className="success" />
      <span className="grow">Your account asks for a code from your authenticator app at sign-in.</span>
      <Button size="sm" variant="danger-ghost" onClick={() => setDisable(true)}>Turn off</Button>
    </div>
  ) : (
    <div className="row">
      <span className="grow muted">Protect your account with a code from an authenticator app at sign-in.</span>
      <Button variant="primary" loading={busy} onClick={start}>Set up two-factor</Button>
    </div>
  );

  const dialog = (
    <Dialog open={disable} onClose={() => setDisable(false)} size="sm" title="Turn off two-factor?" description="Confirm with your password." onSubmit={turnOff}
      footer={<><Button variant="ghost" onClick={() => setDisable(false)}>Cancel</Button><Button type="submit" variant="danger" loading={busy}>Turn off</Button></>}>
      <Field label="Password"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
    </Dialog>
  );

  if (bare) return <>{body}{dialog}</>;
  return (
    <Block title="Two-factor authentication" actions={on ? <Badge tone="green" dot size="sm">On</Badge> : <Badge size="sm">Off</Badge>}>
      {body}{dialog}
    </Block>
  );
}
