import { useState } from "react";
import { Link } from "react-router-dom";
import { MoreHorizontal, Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import { Page } from "@/components/app/page";
import { Avatar, AvatarGroup, Button, Combobox, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, IconButton, Input, Menu, SkeletonRows, toast } from "@/components/ui";
import { del, post, put } from "@/lib/api";
import { invalidate, useApi } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import { ColorPicker, RoleBadge } from "../admin/shared";
import type { DirPerson } from "../people/people";
import s from "./teams.module.css";

export interface Team { id: number; name: string; color: string; members: { id: number; name: string }[] }

export default function Teams() {
  const { can } = useMe();
  // The server allows team changes to anyone who can manage projects.
  const manage = can("projects", "manage");
  const { data, error, loading, reload } = useApi<Team[]>("/people/teams/all");
  const people = useApi<DirPerson[]>("/people");
  const [edit, setEdit] = useState<Team | "new" | null>(null);
  const [remove, setRemove] = useState<Team | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const byId = new Map((people.data ?? []).map((p) => [p.id, p]));

  const doDelete = async () => {
    if (!remove) return;
    setBusy(true);
    try {
      await del(`/people/teams/${remove.id}`);
      toast.success(`Deleted ${remove.name}`);
      setRemove(null);
      invalidate("/people");
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  const removeMember = async (t: Team, userId: number) => {
    try {
      await put(`/people/teams/${t.id}`, { memberIds: t.members.map((m) => m.id).filter((id) => id !== userId) });
      toast.success("Removed from team");
      invalidate("/people");
    } catch (e) { toast.error(e); }
  };

  return (
    <Page title="Teams" icon={<UsersRound size={15} />} actions={manage && <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setEdit("new")}>New team</Button>}>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <SkeletonRows /> : !data?.length ? (
        <EmptyState icon={<UsersRound size={28} />} title="No teams yet" description="Group people into teams to filter timesheets, workload and analytics." action={manage && <Button variant="primary" onClick={() => setEdit("new")}>Create a team</Button>} />
      ) : (
        <div className="list">
          {data.map((t) => (
            <div key={t.id}>
              <div className={`list-row clickable ${s.teamRow}`} onClick={() => setOpen(open === t.id ? null : t.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id}>
                <span className={s.swatch} style={{ background: t.color }} />
                <span className="medium">{t.name}</span>
                <span className="faint small">{t.members.length} {t.members.length === 1 ? "member" : "members"}</span>
                <div className="grow" />
                <AvatarGroup names={t.members.map((m) => m.name)} max={6} />
                {manage && (
                  <span onClick={(e) => e.stopPropagation()}>
                    <Menu placement="bottom-end" trigger={<IconButton label="Team actions" size="sm" icon={<MoreHorizontal size={15} />} />} items={[
                      { label: "Edit team", icon: <Pencil size={14} />, onSelect: () => setEdit(t) },
                      { type: "separator" },
                      { label: "Delete team", icon: <Trash2 size={14} />, danger: true, onSelect: () => setRemove(t) },
                    ]} />
                  </span>
                )}
              </div>
              {open === t.id && (
                <div className={s.members}>
                  {!t.members.length && <div className="faint small" style={{ padding: "8px 0" }}>No members yet.</div>}
                  {t.members.map((m) => {
                    const p = byId.get(m.id);
                    return (
                      <div key={m.id} className={s.member}>
                        <Avatar name={m.name} size={20} />
                        <Link to={`/people/${m.id}`} className="medium">{m.name}</Link>
                        {p?.title && <span className="faint ellipsis">{p.title}</span>}
                        <div className="grow" />
                        {p && <RoleBadge role={p.role} />}
                        {manage && <Button size="sm" variant="ghost" onClick={() => removeMember(t, m.id)}>Remove</Button>}
                      </div>
                    );
                  })}
                  {manage && <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => setEdit(t)} style={{ alignSelf: "flex-start", marginTop: 4 }}>Add members</Button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {edit && <TeamDialog team={edit === "new" ? null : edit} people={people.data ?? []} onClose={() => setEdit(null)} />}
      <ConfirmDialog
        open={!!remove} onClose={() => setRemove(null)} onConfirm={doDelete} loading={busy} danger confirmLabel="Delete team"
        title={`Delete ${remove?.name}?`} description="Members stay in the company without a team. Their time and tasks are kept."
      />
    </Page>
  );
}

function TeamDialog({ team, people, onClose }: { team: Team | null; people: DirPerson[]; onClose: () => void }) {
  const [name, setName] = useState(team?.name ?? "");
  const [color, setColor] = useState(team?.color ?? "#5e6ad2");
  const [members, setMembers] = useState<string[]>((team?.members ?? []).map((m) => String(m.id)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    if (!name.trim()) { setErr("Name the team"); return; }
    setBusy(true);
    try {
      const memberIds = members.map(Number);
      if (team) await put(`/people/teams/${team.id}`, { name: name.trim(), color, memberIds });
      else {
        const t = await post<{ id: number }>("/people/teams", { name: name.trim(), color });
        if (memberIds.length) await put(`/people/teams/${t.id}`, { memberIds });
      }
      toast.success(team ? "Team updated" : `Created ${name.trim()}`);
      invalidate("/people");
      onClose();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  return (
    <Dialog open onClose={onClose} title={team ? "Edit team" : "New team"} onSubmit={save} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>{team ? "Save" : "Create team"}</Button></>}>
      <div className="col gap-16">
        <Field label="Name" error={err}><Input autoFocus value={name} onChange={(e) => { setName(e.target.value); setErr(""); }} placeholder="e.g. Design" /></Field>
        <Field label="Colour"><ColorPicker value={color} onChange={setColor} /></Field>
        <Field label="Members" hint="A person belongs to one team per company; adding them here moves them from their current team.">
          <Combobox multiple value={members} onChange={setMembers} placeholder="Add people" options={people.map((p) => ({ value: String(p.id), label: p.name, hint: p.team && p.team.id !== team?.id ? p.team.name : undefined, icon: <Avatar name={p.name} size={16} /> }))} />
        </Field>
      </div>
    </Dialog>
  );
}
