import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound, MonitorSmartphone, MoreHorizontal, Pencil, ShieldCheck, ShieldOff, UserCheck, UserX, Users } from "lucide-react";
import { Avatar, ConfirmDialog, Dialog, EmptyState, ErrorState, IconButton, Menu, SkeletonRows, Tooltip, Button, toast } from "@/components/ui";
import { post } from "@/lib/api";
import { invalidate } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import { relTime, fmtDateTime } from "@/lib/format";
import { RoleBadge, SecretOnce, StatusBadge } from "./shared";
import { EditUserDialog, PermissionsDialog, SessionsDialog } from "./user-dialogs";

export interface AdminUser {
  id: number; name: string; email: string; role: string; title: string | null; phone: string | null; status: string; weeklyCapacity: number;
  costRate?: number | null; billRate?: number | null; team: { id: number; name: string } | null; allProjects: boolean; projectIds: number[];
  companies: { id: number; name: string; color: string }[]; lastLoginAt: string | null; activeSessions: number; mfaEnabled: boolean; mustChangePassword: boolean; createdAt: string;
}
type Api<T> = { data?: T; error: Error | null; loading: boolean; reload: () => void };
type Action = { kind: "edit" | "perms" | "sessions" | "status" | "reset"; user: AdminUser };

export function Members({ api, q, status }: { api: Api<AdminUser[]>; q: string; status: string }) {
  const { me, can } = useMe();
  const manage = can("people", "manage");
  const [act, setAct] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<{ user: AdminUser; password: string } | null>(null);

  const rows = useMemo(() => (api.data ?? []).filter((u) => (!status || u.status === status) && (!q || `${u.name} ${u.email} ${u.title ?? ""}`.toLowerCase().includes(q.toLowerCase()))), [api.data, q, status]);

  const confirm = async () => {
    if (!act) return;
    setBusy(true);
    try {
      if (act.kind === "status") {
        const next = act.user.status === "DEACTIVATED" ? "ACTIVE" : "DEACTIVATED";
        await post(`/people/${act.user.id}/status`, { status: next });
        toast.success(next === "ACTIVE" ? `${act.user.name} can sign in again` : `${act.user.name} was deactivated and signed out`);
      } else if (act.kind === "reset") {
        const r = await post<{ tempPassword: string }>(`/people/${act.user.id}/reset-password`);
        setSecret({ user: act.user, password: r.tempPassword });
      }
      setAct(null);
      invalidate("/people");
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  if (api.error) return <ErrorState error={api.error} onRetry={api.reload} />;
  if (api.loading && !api.data) return <SkeletonRows />;
  if (!rows.length) return <EmptyState icon={<Users size={28} />} title="No one matches" description="Try another search or status." />;

  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Role</th><th>Team</th><th>Status</th><th>Last sign-in</th><th style={{ textAlign: "center" }}>MFA</th><th className="num">Sessions</th><th style={{ width: 40 }} /></tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const isMe = u.id === me.user.id;
              const protectedAdmin = u.role === "ADMIN" && me.user.role !== "ADMIN";
              return (
                <tr key={u.id}>
                  <td>
                    <span className="row">
                      <Avatar name={u.name} size={24} />
                      <span className="col" style={{ gap: 0, minWidth: 0 }}>
                        <Link to={`/people/${u.id}`} className="medium ellipsis">{u.name}{isMe && <span className="faint"> (you)</span>}</Link>
                        <span className="tiny faint ellipsis">{u.email}{u.title ? ` · ${u.title}` : ""}</span>
                      </span>
                    </span>
                  </td>
                  <td><RoleBadge role={u.role} /></td>
                  <td className="muted">{u.team?.name ?? <span className="faint">—</span>}</td>
                  <td>
                    <span className="row gap-4">
                      <StatusBadge status={u.status} />
                      {u.status === "ACTIVE" && u.mustChangePassword && <Tooltip content="Must set a new password at next sign-in"><KeyRound size={13} className="warn" /></Tooltip>}
                    </span>
                  </td>
                  <td className="muted">{u.lastLoginAt ? <Tooltip content={fmtDateTime(u.lastLoginAt)}><span>{relTime(u.lastLoginAt)}</span></Tooltip> : <span className="faint">Never</span>}</td>
                  <td className="center">{u.mfaEnabled ? <Tooltip content="Two-factor on"><ShieldCheck size={14} className="success" /></Tooltip> : <Tooltip content="Two-factor off"><ShieldOff size={14} className="faint" /></Tooltip>}</td>
                  <td className="num muted">{u.activeSessions}</td>
                  <td>
                    {manage && !protectedAdmin && (
                      <Menu placement="bottom-end" width={220} trigger={<IconButton label={`Actions for ${u.name}`} size="sm" icon={<MoreHorizontal size={15} />} />} items={[
                        { label: "Edit details", icon: <Pencil size={14} />, onSelect: () => setAct({ kind: "edit", user: u }) },
                        u.role !== "ADMIN" && { label: "Access overrides", icon: <ShieldCheck size={14} />, onSelect: () => setAct({ kind: "perms", user: u }) },
                        { label: "Sessions", icon: <MonitorSmartphone size={14} />, onSelect: () => setAct({ kind: "sessions", user: u }) },
                        { type: "separator" },
                        !isMe && { label: "Reset password", icon: <KeyRound size={14} />, onSelect: () => setAct({ kind: "reset", user: u }) },
                        !isMe && (u.status === "DEACTIVATED"
                          ? { label: "Reactivate", icon: <UserCheck size={14} />, onSelect: () => setAct({ kind: "status", user: u }) }
                          : { label: "Deactivate", icon: <UserX size={14} />, danger: true, onSelect: () => setAct({ kind: "status", user: u }) }),
                      ]} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {act?.kind === "edit" && <EditUserDialog user={act.user} onClose={() => setAct(null)} />}
      {act?.kind === "perms" && <PermissionsDialog user={act.user} onClose={() => setAct(null)} />}
      {act?.kind === "sessions" && <SessionsDialog user={act.user} onClose={() => setAct(null)} />}
      <ConfirmDialog
        open={act?.kind === "status" || act?.kind === "reset"} onClose={() => setAct(null)} onConfirm={confirm} loading={busy}
        danger={act?.kind === "status" && act.user.status !== "DEACTIVATED"}
        title={act?.kind === "reset" ? `Reset ${act.user.name}'s password?` : act?.user.status === "DEACTIVATED" ? `Reactivate ${act?.user.name}?` : `Deactivate ${act?.user.name}?`}
        confirmLabel={act?.kind === "reset" ? "Reset password" : act?.user.status === "DEACTIVATED" ? "Reactivate" : "Deactivate"}
        description={act?.kind === "reset"
          ? "They'll be signed out everywhere and get a new temporary password by email. You'll see it once here too."
          : act?.user.status === "DEACTIVATED" ? "They can sign in again with their existing password." : "They're signed out everywhere and can't sign in. Their time and tasks stay in reports."}
      />
      <Dialog open={!!secret} onClose={() => setSecret(null)} title="Password reset" description={secret ? `${secret.user.name} must choose a new password after signing in with this one. We also emailed it to ${secret.user.email}.` : undefined}
        footer={<Button variant="primary" onClick={() => setSecret(null)}>Done</Button>}>
        {secret && <SecretOnce value={secret.password} />}
      </Dialog>
    </>
  );
}
