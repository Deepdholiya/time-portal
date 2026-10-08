import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlarmClock, AtSign, BellRing, CalendarCheck, CalendarX, CheckCheck, CircleAlert, CircleCheck, CircleDot, Clock, FileBarChart, Flag, FolderKanban, Inbox as InboxIcon,
  KeyRound, Link2Off, Link2, MessageSquare, MailOpen, Mail, Send, Trash2, UserPlus, UserCheck, Workflow, XCircle, Zap,
} from "lucide-react";
import { Button, EmptyState, IconButton, SegmentedControl, SkeletonRows, Tooltip, toast } from "@/components/ui";
import { Page } from "@/components/app/page";
import { useShell } from "@/components/app/shell-context";
import { refreshCounts } from "@/components/app/sidebar";
import { del, post } from "@/lib/api";
import { useApi, useHotkey, useLocal } from "@/lib/hooks";
import { relTime, fmtDateTime } from "@/lib/format";
import type { Notification } from "@/lib/types";
import { LoadError } from "../analytics/entries";
import s from "./inbox.module.css";

const ICONS: Record<string, { icon: ReactNode; color: string }> = {
  TASK_ASSIGNED: { icon: <UserPlus size={15} />, color: "var(--accent)" },
  TASK_STATUS: { icon: <CircleDot size={15} />, color: "var(--text-2)" },
  COMMENT: { icon: <MessageSquare size={15} />, color: "var(--text-2)" },
  MENTION: { icon: <AtSign size={15} />, color: "var(--accent)" },
  DUE_SOON: { icon: <AlarmClock size={15} />, color: "var(--yellow)" },
  OVERDUE: { icon: <CircleAlert size={15} />, color: "var(--red)" },
  DEPENDENCY_BLOCKED: { icon: <Link2Off size={15} />, color: "var(--red)" },
  DEPENDENCY_CLEARED: { icon: <Link2 size={15} />, color: "var(--green)" },
  MILESTONE: { icon: <Flag size={15} />, color: "var(--purple)" },
  PROJECT_AT_RISK: { icon: <CircleAlert size={15} />, color: "var(--orange)" },
  PROJECT_ASSIGNED: { icon: <FolderKanban size={15} />, color: "var(--accent)" },
  TIMESHEET_REMINDER: { icon: <Clock size={15} />, color: "var(--yellow)" },
  TIMESHEET_SUBMITTED: { icon: <Send size={15} />, color: "var(--blue)" },
  TIMESHEET_APPROVED: { icon: <CircleCheck size={15} />, color: "var(--green)" },
  TIMESHEET_REJECTED: { icon: <XCircle size={15} />, color: "var(--red)" },
  LEAVE_REQUESTED: { icon: <CalendarCheck size={15} />, color: "var(--blue)" },
  LEAVE_REVIEWED: { icon: <CalendarX size={15} />, color: "var(--text-2)" },
  INVITATION_ACCEPTED: { icon: <UserCheck size={15} />, color: "var(--green)" },
  ACCESS_CHANGED: { icon: <KeyRound size={15} />, color: "var(--orange)" },
  REPORT_READY: { icon: <FileBarChart size={15} />, color: "var(--accent)" },
  AUTOMATION: { icon: <Workflow size={15} />, color: "var(--text-2)" },
};
const iconFor = (t: string) => ICONS[t] ?? { icon: <Zap size={15} />, color: "var(--text-2)" };

interface Resp { unread: number; rows: Notification[] }

export default function Inbox() {
  const [filter, setFilter] = useLocal<"all" | "unread">("inbox.filter", "all");
  const { data, error, loading, reload, mutate } = useApi<Resp>("/notifications", { limit: 200, unread: filter === "unread" ? "true" : undefined });
  const nav = useNavigate();
  const shell = useShell();
  const [sel, setSel] = useState(0);
  const rows = useMemo(() => data?.rows ?? [], [data]);

  const setRead = async (n: Notification, read: boolean) => {
    mutate((d) => d ? { unread: Math.max(0, d.unread + (read ? (n.readAt ? 0 : -1) : (n.readAt ? 1 : 0))), rows: d.rows.map((r) => (r.id === n.id ? { ...r, readAt: read ? new Date().toISOString() : null } : r)) } : d!);
    try { await post(`/notifications/${n.id}/read`, { read }); refreshCounts(); } catch (e) { toast.error(e); reload(); }
  };
  const open = (n: Notification) => {
    if (!n.readAt) setRead(n, true);
    if (!n.link) return;
    const m = n.link.match(/^\/tasks\/(\d+)$/);
    if (m) shell.openTask(Number(m[1]));
    else nav(n.link);
  };
  const remove = async (n: Notification) => {
    mutate((d) => d ? { unread: d.unread - (n.readAt ? 0 : 1), rows: d.rows.filter((r) => r.id !== n.id) } : d!);
    try { await del(`/notifications/${n.id}`); refreshCounts(); } catch (e) { toast.error(e); reload(); }
  };
  const readAll = async () => {
    try { await post("/notifications/read-all"); toast.success("All caught up"); refreshCounts(); reload(); } catch (e) { toast.error(e); }
  };

  const cur = rows[Math.min(sel, rows.length - 1)];
  useHotkey("j", () => setSel((i) => Math.min(rows.length - 1, i + 1)));
  useHotkey("k", () => setSel((i) => Math.max(0, i - 1)));
  useHotkey("arrowdown", () => setSel((i) => Math.min(rows.length - 1, i + 1)));
  useHotkey("arrowup", () => setSel((i) => Math.max(0, i - 1)));
  useHotkey("enter", () => cur && open(cur), { enabled: !!cur });
  useHotkey("u", () => cur && setRead(cur, !cur.readAt), { enabled: !!cur });
  useHotkey("backspace", () => cur && remove(cur), { enabled: !!cur });

  return (
    <Page
      title="Inbox" icon={<InboxIcon size={15} />}
      actions={
        <div className="row gap-4">
          <SegmentedControl aria-label="Show" value={filter} onChange={(v) => { setFilter(v); setSel(0); }}
            options={[{ value: "all", label: "All" }, { value: "unread", label: `Unread${data?.unread ? ` ${data.unread}` : ""}` }]} />
          <Button size="sm" variant="ghost" icon={<CheckCheck size={14} />} disabled={!data?.unread} onClick={readAll}>Mark all read</Button>
        </div>
      }
    >
      {error ? <LoadError error={error} onRetry={reload} /> : loading && !data ? <SkeletonRows rows={10} /> : !rows.length ? (
        <EmptyState icon={<BellRing size={28} />} title={filter === "unread" ? "You're all caught up" : "No notifications yet"}
          description={filter === "unread" ? "No unread notifications." : "Assignments, mentions, approvals and reminders show up here."}
          action={filter === "unread" ? <Button size="sm" variant="secondary" onClick={() => setFilter("all")}>Show all</Button> : undefined} />
      ) : (
        <div className="list" role="list">
          {rows.map((n, i) => {
            const ic = iconFor(n.type);
            return (
              <div key={n.id} role="listitem" tabIndex={-1}
                className={`${s.row} ${n.readAt ? s.read : ""} ${i === sel ? s.sel : ""}`}
                onMouseEnter={() => setSel(i)} onClick={() => open(n)}>
                <span className={s.unread}>{!n.readAt && <span className={s.dot} aria-label="Unread" />}</span>
                <span className={s.icon} style={{ color: ic.color }}>{ic.icon}</span>
                <div className={s.text}>
                  <div className={s.title}>{n.title}</div>
                  {n.body && <div className={s.body}>{n.body}</div>}
                </div>
                <Tooltip content={fmtDateTime(n.createdAt)}><span className={s.time}>{relTime(n.createdAt)}</span></Tooltip>
                <div className={s.actions} onClick={(e) => e.stopPropagation()}>
                  <IconButton size="sm" label={n.readAt ? "Mark unread (U)" : "Mark read (U)"} icon={n.readAt ? <Mail size={14} /> : <MailOpen size={14} />} onClick={() => setRead(n, !n.readAt)} />
                  <IconButton size="sm" label="Delete" icon={<Trash2 size={14} />} onClick={() => remove(n)} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Page>
  );
}
