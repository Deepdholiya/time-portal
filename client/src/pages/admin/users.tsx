import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Upload, UserCog } from "lucide-react";
import { Page } from "@/components/app/page";
import { Button, Tabs } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import { Members, type AdminUser } from "./users-members";
import { Invitations, type Invitation } from "./users-invitations";
import { BulkInviteDialog, InviteDialog } from "./invite-dialogs";
import { SearchField } from "@/components/app/search-field";
import { FilterMenu } from "@/components/app/filter-menu";

export default function Users() {
  const { can } = useMe();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "invitations" ? "invitations" : "members";
  const [q, setQ] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState("");
  const [invite, setInvite] = useState(params.get("invite") === "1");
  const [bulk, setBulk] = useState(false);
  const users = useApi<AdminUser[]>("/people/users");
  const invites = useApi<Invitation[]>("/people/invitations");
  const pending = (invites.data ?? []).filter((i) => i.status === "PENDING").length;

  const setTab = (v: string) => { const p = new URLSearchParams(params); if (v === "members") p.delete("tab"); else p.set("tab", v); setParams(p, { replace: true }); setStatus(""); };

  const toolbar = (
    <>
      <Tabs value={tab} onChange={setTab} items={[
        { value: "members", label: "Members", count: users.data?.length },
        { value: "invitations", label: "Invitations", count: pending || undefined },
      ]} />
      <SearchField placeholder={tab === "members" ? "Search people" : "Search invitations"} value={q} onChange={setQ} />
      <FilterMenu placement="bottom-start" sections={[{ key: "status", label: "Status", single: true, options: tab === "members"
        ? [{ value: "ACTIVE", label: "Active" }, { value: "INVITED", label: "Invited" }, { value: "DEACTIVATED", label: "Deactivated" }]
        : [{ value: "PENDING", label: "Pending" }, { value: "ACCEPTED", label: "Accepted" }, { value: "EXPIRED", label: "Expired" }, { value: "REVOKED", label: "Revoked" }] }]}
        value={{ status: status ? [status] : [] }} onApply={(v) => setStatus(v.status?.[0] ?? "")} />
    </>
  );

  return (
    <Page
      title="Users & invitations" icon={<UserCog size={15} />} toolbar={toolbar}
      actions={can("people", "invite") && (
        <>
          <Button size="sm" variant="secondary" icon={<Upload size={14} />} onClick={() => setBulk(true)}>Bulk invite</Button>
          <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setInvite(true)}>Invite people</Button>
        </>
      )}
    >
      {tab === "members" ? <Members api={users} q={q} status={status} /> : <Invitations api={invites} q={q} status={status} />}
      {invite && <InviteDialog onClose={() => setInvite(false)} />}
      {bulk && <BulkInviteDialog onClose={() => setBulk(false)} />}
    </Page>
  );
}
