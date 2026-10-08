import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Archive, ArchiveRestore, ArrowRightLeft, Building, MoreHorizontal, Pencil, Plus, Users } from "lucide-react";
import { Page } from "@/components/app/page";
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, IconButton, Menu, SkeletonRows, toast } from "@/components/arc";
import { post } from "@/lib/api";
import { invalidate, useApi } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { Company } from "@/lib/types";
import { StatusBadge } from "./shared";
import { CompanyDialog, MembersSheet } from "./company-dialogs";

export type CompanyRow = Company & { current: boolean; createdAt: string; _count: { memberships: number; projects: number; clients: number } };

export default function Companies() {
  const { data, error, loading, reload } = useApi<CompanyRow[]>("/companies");
  const { switchCompany, refresh } = useSession();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [edit, setEdit] = useState<CompanyRow | "new" | null>(null);
  const [members, setMembers] = useState<CompanyRow | null>(null);
  const [status, setStatus] = useState<CompanyRow | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (params.get("new") === "1") {
      setEdit("new");
      const p = new URLSearchParams(params); p.delete("new"); setParams(p, { replace: true });
    }
  }, [params, setParams]);

  const doSwitch = async (c: CompanyRow) => {
    try {
      await switchCompany(c.id);
      toast.success(`Switched to ${c.name}`);
      nav("/");
    } catch (e) { toast.error(e); }
  };

  const toggleStatus = async () => {
    if (!status) return;
    setBusy(true);
    try {
      const next = status.status === "ARCHIVED" ? "ACTIVE" : "ARCHIVED";
      await post(`/companies/${status.id}/status`, { status: next });
      toast.success(next === "ACTIVE" ? `${status.name} is active again` : `${status.name} was suspended`);
      setStatus(null);
      invalidate("/companies");
      refresh();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  return (
    <Page title="Companies" icon={<Building size={15} />} actions={<Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setEdit("new")}>New company</Button>}>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <SkeletonRows /> : !data?.length ? (
        <EmptyState icon={<Building size={28} />} title="No companies" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Company</th><th>Status</th><th>Country</th><th>Timezone</th><th>Currency</th><th>Task key</th><th className="num">People</th><th className="num">Projects</th><th className="num">Clients</th><th /><th style={{ width: 40 }} /></tr></thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} data-company={c.name}>
                  <td>
                    <span className="row">
                      <span className="swatch" style={{ background: c.color, width: 14, height: 14 }} />
                      <span className="medium">{c.name}</span>
                      <span className="faint small">{c.slug}</span>
                      {c.current && <Badge tone="accent" size="sm">Current</Badge>}
                    </span>
                  </td>
                  <td><StatusBadge status={c.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE"} /></td>
                  <td className="muted">{c.country ?? "—"}</td>
                  <td className="muted">{c.timezone}</td>
                  <td className="muted">{c.currency}</td>
                  <td className="mono muted">{c.settings.taskKey}</td>
                  <td className="num">{c._count.memberships}</td>
                  <td className="num">{c._count.projects}</td>
                  <td className="num">{c._count.clients}</td>
                  <td className="right">
                    {!c.current && c.status === "ACTIVE" && <Button size="sm" variant="ghost" icon={<ArrowRightLeft size={13} />} onClick={() => doSwitch(c)}>Switch</Button>}
                  </td>
                  <td>
                    <Menu placement="bottom-end" trigger={<IconButton label={`Actions for ${c.name}`} size="sm" icon={<MoreHorizontal size={15} />} />} items={[
                      { label: "Edit", icon: <Pencil size={14} />, onSelect: () => setEdit(c) },
                      { label: "Members", icon: <Users size={14} />, onSelect: () => setMembers(c) },
                      !c.current && c.status === "ACTIVE" && { label: "Switch to this company", icon: <ArrowRightLeft size={14} />, onSelect: () => doSwitch(c) },
                      { type: "separator" as const },
                      c.status === "ARCHIVED"
                        ? { label: "Reactivate", icon: <ArchiveRestore size={14} />, onSelect: () => setStatus(c) }
                        : { label: "Suspend", icon: <Archive size={14} />, danger: true, disabled: c.current, onSelect: () => setStatus(c) },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <CompanyDialog company={edit === "new" ? null : edit} onClose={() => setEdit(null)} onCreated={(c) => setMembers(c)} />}
      {members && <MembersSheet company={members} companies={data ?? []} onClose={() => setMembers(null)} />}
      <ConfirmDialog
        open={!!status} onClose={() => setStatus(null)} onConfirm={toggleStatus} loading={busy} danger={status?.status !== "ARCHIVED"}
        title={status?.status === "ARCHIVED" ? `Reactivate ${status.name}?` : `Suspend ${status?.name}?`}
        confirmLabel={status?.status === "ARCHIVED" ? "Reactivate" : "Suspend"}
        description={status?.status === "ARCHIVED" ? "Members can switch into it again." : "Nobody can switch into a suspended company. Its data is kept and can be restored."}
      />
    </Page>
  );
}
