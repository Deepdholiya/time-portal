import { useMemo, useRef, useState, type ReactNode } from "react";
import { AtSign, MoreHorizontal } from "lucide-react";
import { Avatar, Button, ConfirmDialog, Menu, IconButton, toast } from "@/components/ui";
import { PRIORITY_META, STATUS_META } from "@/components/app/icons";
import { del, patch, post } from "@/lib/api";
import { invalidate } from "@/lib/hooks";
import { fmtDate, fmtDateTime, relTime } from "@/lib/format";
import { useMe } from "@/lib/session";
import type { Options, Priority, TaskStatus, UserLite } from "@/lib/types";
import type { TaskDetail } from "./lib";
import { SectionHead } from "./sheet-sections";
import s from "./task-sheet.module.css";

const FIELD_LABEL: Record<string, string> = {
  status: "status", priority: "priority", assigneeId: "assignee", dueDate: "due date", startDate: "start date", estimateHours: "estimate", title: "title",
  description: "description", projectId: "project", milestoneId: "milestone", billable: "billable", tags: "tags", customFields: "custom fields", recurrence: "recurrence",
  section: "section", parentId: "parent", dates: "dates",
};

function fieldValue(field: string | null, v: string | null, o?: Options): string {
  if (v == null || v === "") return "none";
  switch (field) {
    case "status": return STATUS_META[v as TaskStatus]?.label ?? v;
    case "priority": return PRIORITY_META[v as Priority]?.label ?? v;
    case "assigneeId": return o?.users.find((u) => String(u.id) === v)?.name ?? "someone";
    case "projectId": return o?.projects.find((p) => String(p.id) === v)?.name ?? "another project";
    case "milestoneId": return o?.projects.flatMap((p) => p.milestones).find((m) => String(m.id) === v)?.name ?? "a milestone";
    case "dueDate": case "startDate": return fmtDate(v);
    case "estimateHours": return `${v}h`;
    case "billable": return v === "true" ? "billable" : "non-billable";
    case "tags": try { return (JSON.parse(v) as string[]).join(", ") || "none"; } catch { return v; }
    default: return v.length > 60 ? v.slice(0, 60) + "…" : v;
  }
}

function describe(a: TaskDetail["activity"][number], o?: Options): ReactNode {
  switch (a.action) {
    case "created": return "created the task";
    case "attachment": return <>attached <b>{a.toValue}</b></>;
    case "time": return a.toValue ?? "logged time";
    case "dependency": return a.toValue ?? "changed dependencies";
    case "field": {
      if (a.field === "dates") return "had its dates shifted after a dependency moved";
      if (a.field === "description") return "updated the description";
      if (a.field === "customFields") return "updated custom fields";
      return <>changed {FIELD_LABEL[a.field ?? ""] ?? a.field} {a.fromValue != null && a.field !== "title" ? <>from <b>{fieldValue(a.field, a.fromValue, o)}</b> </> : null}to <b>{fieldValue(a.field, a.toValue, o)}</b></>;
    }
    default: return a.action;
  }
}

/** Highlights @Name for users that were mentioned. */
function Body({ text, mentions, users }: { text: string; mentions: number[]; users: UserLite[] }) {
  const names = users.filter((u) => mentions.includes(u.id)).map((u) => u.name).sort((a, b) => b.length - a.length);
  if (!names.length) return <>{text}</>;
  const re = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`, "g");
  return <>{text.split(re).map((part, i) => (i % 2 ? <span key={i} className={s.mention}>{part}</span> : part))}</>;
}

function Composer({ taskId, users, onSent }: { taskId: number; users: UserLite[]; onSent: () => void }) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<UserLite[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [hi, setHi] = useState(0);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const matches = query === null ? [] : users.filter((u) => u.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8);

  const onChange = (v: string) => {
    setText(v);
    const caret = ref.current?.selectionStart ?? v.length;
    const m = v.slice(0, caret).match(/(?:^|\s)@([\w.-]*(?: [\w.-]*)?)$/);
    setQuery(m ? m[1] : null);
    setHi(0);
  };
  const pick = (u: UserLite) => {
    const el = ref.current!;
    const caret = el.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([\w.-]*(?: [\w.-]*)?)$/, `@${u.name} `);
    const next = before + text.slice(caret);
    setText(next);
    setPicked((p) => (p.some((x) => x.id === u.id) ? p : [...p, u]));
    setQuery(null);
    setTimeout(() => { el.focus(); el.setSelectionRange(before.length, before.length); }, 0);
  };
  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      const mentions = picked.filter((u) => body.includes(`@${u.name}`)).map((u) => u.id);
      await post(`/tasks/${taskId}/comments`, { body, mentions });
      setText(""); setPicked([]);
      invalidate("/tasks");
      onSent();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  return (
    <div className={s.composer}>
      {matches.length > 0 && (
        <div className={s.suggest} role="listbox" aria-label="Mention someone">
          {matches.map((u, i) => (
            <div key={u.id} role="option" aria-selected={i === hi} className={`${s.suggestItem} ${i === hi ? s.hi : ""}`} onMouseDown={(e) => { e.preventDefault(); pick(u); }} onMouseEnter={() => setHi(i)}>
              <Avatar name={u.name} size={18} /><span className="ellipsis">{u.name}</span>
            </div>
          ))}
        </div>
      )}
      <textarea
        ref={ref} value={text} placeholder="Leave a comment… Type @ to mention someone" aria-label="Comment"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (matches.length) {
            if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => (h + 1) % matches.length); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => (h - 1 + matches.length) % matches.length); return; }
            if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(matches[hi]); return; }
            if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); setQuery(null); return; }
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
        }}
      />
      <div className={s.composerFoot}>
        <IconButton size="sm" label="Mention someone" icon={<AtSign size={14} />} onClick={() => { const el = ref.current!; const v = text + (text && !text.endsWith(" ") ? " @" : "@"); setText(v); setQuery(""); setTimeout(() => { el.focus(); el.setSelectionRange(v.length, v.length); }, 0); }} />
        <span className="small faint grow">{picked.length ? `Notifies ${picked.map((p) => p.name.split(" ")[0]).join(", ")}` : "Ctrl/⌘ + Enter to send"}</span>
        <Button size="sm" variant="primary" loading={busy} disabled={!text.trim()} onClick={send}>Comment</Button>
      </div>
    </div>
  );
}

export function ActivityFeed({ task, options, reload }: { task: TaskDetail; options?: Options; reload: () => void }) {
  const { me } = useMe();
  const users = options?.users ?? [];
  const [editing, setEditing] = useState<{ id: number; body: string } | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  type Item = { at: string; kind: "event"; a: TaskDetail["activity"][number] } | { at: string; kind: "comment"; c: TaskDetail["comments"][number] };
  const items = useMemo<Item[]>(() => [
    ...task.activity.filter((a) => a.action !== "comment").map((a) => ({ at: a.createdAt, kind: "event" as const, a })),
    ...task.comments.map((c) => ({ at: c.createdAt, kind: "comment" as const, c })),
  ].sort((x, y) => x.at.localeCompare(y.at)), [task.activity, task.comments]);
  const hidden = !showAll && items.length > 14 ? items.length - 14 : 0;

  const saveEdit = async () => {
    if (!editing) return;
    try { await patch(`/tasks/comments/${editing.id}`, { body: editing.body }); setEditing(null); reload(); } catch (e) { toast.error(e); }
  };

  return (
    <div className={s.section}>
      <SectionHead title="Activity" />
      <div className={s.feed}>
        {hidden > 0 && <button type="button" className="prop-chip faint small" style={{ width: "fit-content" }} onClick={() => setShowAll(true)}>Show {hidden} older</button>}
        {items.slice(hidden).map((it) => it.kind === "event" ? (
          <div key={`a${it.a.id}`} className={s.event}>
            <span className={s.eventDot}><span /></span>
            <span className="grow"><b>{it.a.actor ?? "System"}</b> {describe(it.a, options)} <span className="faint" title={fmtDateTime(it.a.createdAt)}>· {relTime(it.a.createdAt)}</span></span>
          </div>
        ) : (
          <div key={`c${it.c.id}`} className={s.comment}>
            <div className={s.commentHead}>
              <Avatar name={it.c.user.name} size={20} />
              <span className="medium">{it.c.user.name}</span>
              <span className="faint" title={fmtDateTime(it.c.createdAt)}>{relTime(it.c.createdAt)}{it.c.editedAt ? " (edited)" : ""}</span>
              <span className="grow" />
              {(it.c.user.id === me.user.id || task.canManage) && (
                <Menu placement="bottom-end" trigger={<IconButton size="sm" label="Comment actions" icon={<MoreHorizontal size={14} />} />}
                  items={[it.c.user.id === me.user.id && { label: "Edit", onSelect: () => setEditing({ id: it.c.id, body: it.c.body }) }, { label: "Delete", danger: true, onSelect: () => setRemoving(it.c.id) }]} />
              )}
            </div>
            {editing?.id === it.c.id ? (
              <div className="col">
                <textarea className={s.descInput} style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 8 }} value={editing.body} autoFocus onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
                <div className="row end"><Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button size="sm" variant="primary" onClick={saveEdit}>Save</Button></div>
              </div>
            ) : <div className={s.commentBody}><Body text={it.c.body} mentions={it.c.mentions} users={users} /></div>}
          </div>
        ))}
      </div>
      <Composer taskId={task.id} users={users} onSent={reload} />
      <ConfirmDialog
        open={removing !== null} onClose={() => setRemoving(null)} danger confirmLabel="Delete" title="Delete this comment?"
        onConfirm={async () => { try { await del(`/tasks/comments/${removing}`); reload(); } catch (e) { toast.error(e); } setRemoving(null); }}
      />
    </div>
  );
}
