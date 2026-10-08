import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Search, Upload, UserCog } from "lucide-react";
import { Page } from "@/components/app/page";
import { Button, Input, Select, Tabs } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import { Members, type AdminUser } from "./users-members";
import { Invitations, type Invitation } from "./users-invitations";
import { BulkInviteDialog, InviteDialog } from "./invite-dialogs";

export default function Users() {
  const { can } = useMe();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "invitations" ? "invitations" : "members";
  const [q, setQ] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState("");
  const [invite, setInvite] = useState(false);
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
      <div className="grow" />
      <Input size="sm" icon={<Search size={14} />} placeholder={tab === "members" ? "Search people" : "Search invitations"} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
      <Select size="sm" fullWidth={false} value={status} onChange={setStatus} aria-label="Status" options={tab === "members"
        ? [{ value: "", label: "Any status" }, { value: "ACTIVE", label: "Active" }, { value: "INVITED", label: "Invited" }, { value: "DEACTIVATED", label: "Deactivated" }]
        : [{ value: "", label: "Any status" }, { value: "PENDING", label: "Pending" }, { value: "ACCEPTED", label: "Accepted" }, { value: "EXPIRED", label: "Expired" }, { value: "REVOKED", label: "Revoked" }]} />
    </>
  );

  return (
    <Page
      title="Users & invitations" icon={<UserCog size={15} />} toolbar={toolbar}
      actions={can("people", "invite") && (
        <>
          <Button size="sm" variant="ghost" icon={<Upload size={14} />} onClick={() => setBulk(true)}>Bulk invite</Button>
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
