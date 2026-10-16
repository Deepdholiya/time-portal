import { useState } from "react";
import { LogOut, Monitor, Moon, Sun, UserCircle } from "lucide-react";
import { Page } from "@/components/app/page";
import { Avatar, Button, ConfirmDialog, ErrorState, Field, Input, SegmentedControl, SkeletonRows, toast } from "@/components/ui";
import { del, post, put } from "@/lib/api";
import { invalidate, useApi } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { applyTheme, getTheme, type Theme } from "@/lib/theme";
import { SessionList } from "../admin/user-dialogs";
import { RoleBadge } from "../admin/shared";
import { MfaSection } from "./mfa";
import { Block } from "./block";
import s from "./account.module.css";

export default function Account({ mfaSetupRequired }: { mfaSetupRequired?: boolean }) {
  if (mfaSetupRequired) return <MfaGate />;
  return (
    <Page title="Account" icon={<UserCircle size={15} />}>
      <div className={s.wrap}>
        <Profile />
        <Appearance />
        <Password />
        <MfaSection />
        <Sessions />
      </div>
    </Page>
  );
}

/** Admins of a company that requires two-factor see only this until they enrol. */
function MfaGate() {
  const { me, logout } = useSession();
  return (
    <div className={s.gate}>
      <div className={s.gateCard}>
        <h1 className={s.gateTitle}>Set up two-factor authentication</h1>
        <p className="muted">
          {me?.company?.name ?? "Your company"} requires admins to use two-factor authentication. Set it up with an authenticator app
          (Google Authenticator, 1Password, Authy…) to continue.
        </p>
        <MfaSection bare />
        <div className="row between">
          <span className="small faint">Signed in as {me?.user.email}</span>
          <Button size="sm" variant="link" icon={<LogOut size={13} />} onClick={logout}>Sign out</Button>
        </div>
      </div>
    </div>
  );
}

function Profile() {
  const { me, can, refresh } = useSession();
  const u = me!.user;
  // There is no self-service profile endpoint; people with user management can edit themselves through it.
  const editable = can("people", "manage");
  const [f, setF] = useState({ name: u.name, title: u.title ?? "", phone: u.phone ?? "" });
  const [busy, setBusy] = useState(false);
  const dirty = f.name !== u.name || f.title !== (u.title ?? "") || f.phone !== (u.phone ?? "");
  const save = async () => {
    if (!f.name.trim()) { toast.error("Enter your name"); return; }
    setBusy(true);
    try {
      await put(`/people/${u.id}`, { name: f.name.trim(), title: f.title.trim() || null, phone: f.phone.trim() || null });
      toast.success("Profile saved");
      invalidate("/people");
      await refresh();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <Block title="Profile" desc={editable ? undefined : "Ask an admin to change your name, title or phone."}
      actions={editable && <Button size="sm" variant="primary" disabled={!dirty} loading={busy} onClick={save}>Save</Button>}>
      <div className="row gap-12" style={{ marginBottom: 16 }}>
        <Avatar name={u.name} size={40} />
        <div className="col gap-4">
          <span className="medium">{u.name}</span>
          <span className="row small muted">{u.email}<RoleBadge role={u.role} />{u.team && <span className="row gap-4"><span className="dot" style={{ background: u.team.color }} />{u.team.name}</span>}</span>
        </div>
      </div>
      <div className="form-grid">
        <Field label="Name"><Input value={f.name} disabled={!editable} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Email" hint="Your sign-in email can't be changed here."><Input value={u.email} disabled /></Field>
        <Field label="Title"><Input value={f.title} disabled={!editable} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Phone"><Input value={f.phone} disabled={!editable} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Weekly capacity"><Input value={`${u.weeklyCapacity}h`} disabled /></Field>
        <Field label="Company"><Input value={me!.company.name} disabled /></Field>
      </div>
    </Block>
  );
}

function Appearance() {
  const [theme, setTheme] = useState<Theme>(getTheme);
  return (
    <Block title="Appearance" desc="Applies on this device.">
      <SegmentedControl<Theme> aria-label="Theme" value={theme} onChange={(t) => { setTheme(t); applyTheme(t); }} options={[
        { value: "light", label: "Light", icon: <Sun size={13} /> }, { value: "dark", label: "Dark", icon: <Moon size={13} /> }, { value: "system", label: "System", icon: <Monitor size={13} /> },
      ]} />
    </Block>
  );
}

function Password() {
  const [f, setF] = useState({ current: "", next: "", confirm: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (f.next.length < 8) { setErr("Use at least 8 characters"); return; }
    if (f.next !== f.confirm) { setErr("The new passwords don't match"); return; }
    setBusy(true);
    try {
      await post("/auth/change-password", { current: f.current, next: f.next });
      toast.success("Password changed");
      setF({ current: "", next: "", confirm: "" });
      setErr("");
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <Block title="Password">
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Current password" className="full"><Input type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} style={{ maxWidth: 320 }} /></Field>
        <Field label="New password" hint="At least 8 characters."><Input type="password" autoComplete="new-password" value={f.next} onChange={(e) => { setF({ ...f, next: e.target.value }); setErr(""); }} /></Field>
        <Field label="Confirm new password" error={err}><Input type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => { setF({ ...f, confirm: e.target.value }); setErr(""); }} /></Field>
        <div className="full"><Button type="submit" variant="secondary" loading={busy} disabled={!f.current || !f.next}>Change password</Button></div>
      </form>
    </Block>
  );
}

type Sess = { id: string; ip: string | null; userAgent: string | null; createdAt: string; lastSeenAt: string; current: boolean };
function Sessions() {
  const { data, error, loading, reload } = useApi<Sess[]>("/auth/sessions");
  const { logout } = useSession();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const revoke = async (id: string) => {
    try { await del(`/auth/sessions/${id}`); toast.success("Session revoked"); reload(); } catch (e) { toast.error(e); }
  };
  const all = async () => {
    setBusy(true);
    try {
      await post("/auth/logout-all");
      toast.success("Signed out everywhere");
      await logout();
    } catch (e) { toast.error(e); setBusy(false); }
  };
  return (
    <Block title="Active sessions" desc="Devices signed in to your account." actions={<Button size="sm" variant="danger-ghost" icon={<LogOut size={13} />} onClick={() => setConfirm(true)}>Sign out everywhere</Button>}>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <SkeletonRows rows={3} /> : <SessionList rows={data ?? []} onRevoke={revoke} />}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={all} loading={busy} danger confirmLabel="Sign out everywhere"
        title="Sign out of every device?" description="All sessions end, including this one. You'll need to sign in again." />
    </Block>
  );
}
