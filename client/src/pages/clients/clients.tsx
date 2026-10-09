import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Archive, ArchiveRestore, Briefcase, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Page } from "@/components/app/page";
import { Badge, Button, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, IconButton, Input, Menu, SegmentedControl, SkeletonRows, toast } from "@/components/ui";
import { del, post, put } from "@/lib/api";
import { invalidate, useApi } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import { hours, money } from "@/lib/format";
import { numOrNull } from "../admin/shared";

export interface Client {
  id: number; name: string; email: string | null; contactName: string | null; phone: string | null; website: string | null; rate?: number | null; archived: boolean;
  projects: { id: number; name: string; color: string; status: string; archived: boolean }[]; trackedMinutes: number; revenue?: number; activeProjects: number;
}

export default function Clients() {
  const { can, currency } = useMe();
  const nav = useNavigate();
  const manage = can("projects", "manage");
  const fin = can("financials", "view");
  const { data, error, loading, reload } = useApi<Client[]>("/clients");
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"active" | "archived" | "all">("active");
  const [edit, setEdit] = useState<Client | "new" | null>(null);
  const [confirm, setConfirm] = useState<{ c: Client; kind: "archive" | "delete" } | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => (data ?? []).filter((c) => (show === "all" || (show === "archived") === c.archived) && (!q || `${c.name} ${c.contactName ?? ""} ${c.email ?? ""}`.toLowerCase().includes(q.toLowerCase()))), [data, show, q]);

  const act = async () => {
    if (!confirm) return;
    const { c, kind } = confirm;
    setBusy(true);
    try {
      if (kind === "delete") await del(`/clients/${c.id}`);
      else await put(`/clients/${c.id}`, { ...payload(c), archived: !c.archived });
      toast.success(kind === "delete" ? `Deleted ${c.name}` : c.archived ? `Restored ${c.name}` : `Archived ${c.name}`);
      setConfirm(null);
      invalidate("/clients");
      invalidate("/options");
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  const toolbar = (
    <>
      <Input size="sm" icon={<Search size={14} />} placeholder="Search clients" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
      <SegmentedControl aria-label="Show" value={show} onChange={setShow} options={[{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }, { value: "all", label: "All" }]} />
      <div className="grow" />
      {data && <span className="small faint">{rows.length} of {data.length}</span>}
    </>
  );

  return (
    <Page title="Clients" icon={<Briefcase size={15} />} toolbar={toolbar} actions={manage && <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setEdit("new")}>New client</Button>}>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <SkeletonRows /> : !rows.length ? (
        <EmptyState icon={<Briefcase size={28} />} title={data?.length ? "No clients match" : "No clients yet"} description={data?.length ? "Try another search or filter." : "Add the companies you do work for, then link projects to them."} action={manage && !data?.length && <Button variant="primary" onClick={() => setEdit("new")}>Add a client</Button>} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Client</th><th>Contact</th><th>Email</th><th>Phone</th>
                {fin && <th className="num">Rate / h</th>}
                <th className="num">Active projects</th><th className="num">Tracked</th>
                {fin && <th className="num">Revenue</th>}
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => nav(`/projects?clientId=${c.id}`)} title={`Show ${c.name}'s projects`}>
                  <td>
                    <span className="row">
                      <span className="medium">{c.name}</span>
                      {c.archived && <Badge size="sm">Archived</Badge>}
                    </span>
                  </td>
                  <td className="muted">{c.contactName ?? <span className="faint">—</span>}</td>
                  <td>{c.email ? <a className="link" href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()}>{c.email}</a> : <span className="faint">—</span>}</td>
                  <td className="muted num">{c.phone ?? <span className="faint">—</span>}</td>
                  {fin && <td className="num">{c.rate != null ? money(c.rate, currency) : <span className="faint">—</span>}</td>}
                  <td className="num">{c.activeProjects}<span className="faint"> / {c.projects.length}</span></td>
                  <td className="num">{hours(c.trackedMinutes)}h</td>
                  {fin && <td className="num">{money(c.revenue ?? 0, currency)}</td>}
                  <td onClick={(e) => e.stopPropagation()}>
                    {manage && (
                      <Menu placement="bottom-end" trigger={<IconButton label="Client actions" size="sm" icon={<MoreHorizontal size={15} />} />} items={[
                        { label: "Edit", icon: <Pencil size={14} />, onSelect: () => setEdit(c) },
                        { label: c.archived ? "Restore" : "Archive", icon: c.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />, onSelect: () => setConfirm({ c, kind: "archive" }) },
                        !c.projects.length && { type: "separator" },
                        !c.projects.length && { label: "Delete", icon: <Trash2 size={14} />, danger: true, onSelect: () => setConfirm({ c, kind: "delete" }) },
                      ]} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <ClientDialog client={edit === "new" ? null : edit} fin={fin} currency={currency} onClose={() => setEdit(null)} />}
      <ConfirmDialog
        open={!!confirm} onClose={() => setConfirm(null)} onConfirm={act} loading={busy} danger={confirm?.kind === "delete"}
        confirmLabel={confirm?.kind === "delete" ? "Delete client" : confirm?.c.archived ? "Restore" : "Archive"}
        title={confirm?.kind === "delete" ? `Delete ${confirm.c.name}?` : confirm?.c.archived ? `Restore ${confirm?.c.name}?` : `Archive ${confirm?.c.name}?`}
        description={confirm?.kind === "delete" ? "This can't be undone." : confirm?.c.archived ? "The client shows up in pickers again." : "Archived clients are hidden from pickers. Their projects and time stay reportable."}
      />
    </Page>
  );
}

const payload = (c: Pick<Client, "name" | "email" | "contactName" | "phone" | "website" | "rate">) => ({
  name: c.name, email: c.email ?? "", contactName: c.contactName, phone: c.phone, website: c.website, ...(c.rate !== undefined ? { rate: c.rate } : {}),
});

function ClientDialog({ client, fin, currency, onClose }: { client: Client | null; fin: boolean; currency: string; onClose: () => void }) {
  const [f, setF] = useState({ name: client?.name ?? "", contactName: client?.contactName ?? "", email: client?.email ?? "", phone: client?.phone ?? "", website: client?.website ?? "", rate: client?.rate != null ? String(client.rate) : "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f.name.trim()) { setErr("Enter the client's name"); return; }
    setBusy(true);
    try {
      const body = { name: f.name.trim(), contactName: f.contactName.trim() || null, email: f.email.trim(), phone: f.phone.trim() || null, website: f.website.trim() || null, ...(fin ? { rate: numOrNull(f.rate) } : {}) };
      if (client) await put(`/clients/${client.id}`, body);
      else await post("/clients", body);
      toast.success(client ? "Client updated" : `Added ${body.name}`);
      invalidate("/clients");
      invalidate("/options");
      onClose();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  return (
    <Dialog open onClose={onClose} title={client ? "Edit client" : "New client"} onSubmit={save} dismissable={false}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>{client ? "Save" : "Add client"}</Button></>}>
      <div className="form-grid">
        <Field label="Name" required error={err} className="full"><Input autoFocus value={f.name} onChange={(e) => { set("name")(e); setErr(""); }} placeholder="Acme Corp" /></Field>
        <Field label="Contact person"><Input value={f.contactName} onChange={set("contactName")} /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={set("email")} placeholder="billing@acme.com" /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={set("phone")} /></Field>
        <Field label="Website"><Input value={f.website} onChange={set("website")} placeholder="acme.com" /></Field>
        {fin && <Field label="Default hourly rate" hint="Used for revenue when a project has no rate of its own."><Input type="number" min={0} step="any" value={f.rate} onChange={set("rate")} suffix={currency} /></Field>}
      </div>
    </Dialog>
  );
}
