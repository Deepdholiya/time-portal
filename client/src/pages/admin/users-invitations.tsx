import { useMemo, useState } from "react";
import { Ban, Mail, MoreHorizontal, RefreshCw } from "lucide-react";
import { Avatar, Button, ConfirmDialog, Dialog, EmptyState, ErrorState, IconButton, Menu, SkeletonRows, Tooltip, toast } from "@/components/arc";
import { post } from "@/lib/api";
import { invalidate } from "@/lib/hooks";
import { fmtDateTime, relTime } from "@/lib/format";
import { RoleBadge, SecretOnce, StatusBadge } from "./shared";

export interface Invitation {
  id: number; userId: number | null; email: string; name: string; role: string; title: string | null; teamId: number | null; team: string | null;
  weeklyCapacity: number; allProjects: boolean; projectIds: number[]; status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
  expiresAt: string; acceptedAt: string | null; sentCount: number; createdAt: string; invitedBy: { name: string } | null;
}
type Api<T> = { data?: T; error: Error | null; loading: boolean; reload: () => void };

export function Invitations({ api, q, status }: { api: Api<Invitation[]>; q: string; status: string }) {
  const [act, setAct] = useState<{ kind: "resend" | "revoke"; inv: Invitation } | null>(null);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<{ inv: Invitation; password: string; expiresAt: string } | null>(null);
  const rows = useMemo(() => (api.data ?? []).filter((i) => (!status || i.status === status) && (!q || `${i.name} ${i.email}`.toLowerCase().includes(q.toLowerCase()))), [api.data, q, status]);

  const confirm = async () => {
    if (!act) return;
    setBusy(true);
    try {
      if (act.kind === "resend") {
        const r = await post<{ tempPassword: string; expiresAt: string }>(`/people/invitations/${act.inv.id}/resend`);
        setSecret({ inv: act.inv, password: r.tempPassword, expiresAt: r.expiresAt });
      } else {
        await post(`/people/invitations/${act.inv.id}/revoke`);
        toast.success(`Revoked ${act.inv.email}'s invitation`);
      }
      setAct(null);
      invalidate("/people");
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  if (api.error) return <ErrorState error={api.error} onRetry={api.reload} />;
  if (api.loading && !api.data) return <SkeletonRows />;
  if (!rows.length) return <EmptyState icon={<Mail size={28} />} title={api.data?.length ? "No invitations match" : "No invitations yet"} description="Invite people from the button in the top right." />;

  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Invitee</th><th>Role</th><th>Team</th><th>Status</th><th>Expires</th><th>Invited by</th><th>Sent</th><th style={{ width: 40 }} /></tr></thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id} data-email={i.email}>
                <td>
                  <span className="row">
                    <Avatar name={i.name} size={24} />
                    <span className="col" style={{ gap: 0, minWidth: 0 }}>
                      <span className="medium ellipsis">{i.name}</span>
                      <span className="tiny faint ellipsis">{i.email}{i.title ? ` · ${i.title}` : ""}</span>
                    </span>
                  </span>
                </td>
                <td><RoleBadge role={i.role} /></td>
                <td className="muted">{i.team ?? <span className="faint">—</span>}</td>
                <td><StatusBadge status={i.status} /></td>
                <td className="muted">
                  {i.status === "ACCEPTED" ? <span className="faint">Accepted {relTime(i.acceptedAt)}</span>
                    : i.status === "REVOKED" ? <span className="faint">—</span>
                    : <Tooltip content={fmtDateTime(i.expiresAt)}><span className={i.status === "EXPIRED" ? "warn" : undefined}>{new Date(i.expiresAt) < new Date() ? `${relTime(i.expiresAt)}` : `in ${until(i.expiresAt)}`}</span></Tooltip>}
                </td>
                <td className="muted">{i.invitedBy?.name ?? <span className="faint">—</span>}</td>
                <td className="muted"><Tooltip content={fmtDateTime(i.createdAt)}><span>{relTime(i.createdAt)}{i.sentCount > 1 ? ` · ${i.sentCount}×` : ""}</span></Tooltip></td>
                <td>
                  {i.status !== "ACCEPTED" && (
                    <Menu placement="bottom-end" trigger={<IconButton label={`Actions for ${i.email}`} size="sm" icon={<MoreHorizontal size={15} />} />} items={[
                      { label: i.status === "REVOKED" ? "Re-issue invitation" : "Resend with new password", icon: <RefreshCw size={14} />, onSelect: () => setAct({ kind: "resend", inv: i }) },
                      i.status !== "REVOKED" && { type: "separator" as const },
                      i.status !== "REVOKED" && { label: "Revoke", icon: <Ban size={14} />, danger: true, onSelect: () => setAct({ kind: "revoke", inv: i }) },
                    ]} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={!!act} onClose={() => setAct(null)} onConfirm={confirm} loading={busy} danger={act?.kind === "revoke"}
        title={act?.kind === "revoke" ? `Revoke ${act.inv.email}'s invitation?` : `Resend to ${act?.inv.email}?`}
        confirmLabel={act?.kind === "revoke" ? "Revoke" : "Resend"}
        description={act?.kind === "revoke" ? "The temporary password stops working immediately." : "A new temporary password is generated and emailed; the old one stops working."}
      />
      <Dialog open={!!secret} onClose={() => setSecret(null)} title="Invitation resent"
        description={secret ? `A new invitation email was queued to ${secret.inv.email}. The password works until ${fmtDateTime(secret.expiresAt)}.` : undefined}
        footer={<Button variant="primary" onClick={() => setSecret(null)}>Done</Button>}>
        {secret && <SecretOnce value={secret.password} />}
      </Dialog>
    </>
  );
}

function until(iso: string) {
  const h = (new Date(iso).getTime() - Date.now()) / 3600_000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}
