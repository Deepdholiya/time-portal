import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, IconButton, Sheet, SkeletonRows } from "@/components/arc";
import { ProjectDot } from "@/components/app/icons";
import { useShell } from "@/components/app/shell-context";
import { useApi } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { fmtDate, hm } from "@/lib/format";
import { ApiError } from "@/lib/api";
import { Forbidden } from "@/components/app/page";
import s from "./analytics.module.css";

export interface EntryRow {
  id: number; date: string; week: string; startTime: string | null; endTime: string | null; minutes: number; description: string; billable: boolean;
  user: { id: number; name: string }; team: string | null; client: string | null; clientId: number | null;
  project: string; projectId: number; projectColor: string; subProject: string | null; subProjectId: number | null;
  task: string | null; taskId: number | null; taskStatus: string | null; milestone: string | null;
}
interface EntriesResponse { total: number; minutes: number; rows: EntryRow[] }

const PAGE = 50;

/** Shows a 403 as "no access" and anything else as a retryable error. */
export function LoadError({ error, onRetry, what }: { error: Error; onRetry?: () => void; what?: string }) {
  if (error instanceof ApiError && error.status === 403) return <Forbidden what={what} />;
  return <ErrorState error={error} onRetry={onRetry} />;
}

/** Paged table of the exact time entries behind a total, with descriptions. */
export function EntriesTable({ query, showUser = true, onChanged }: { query: Record<string, string>; showUser?: boolean; onChanged?: () => void }) {
  const [offset, setOffset] = useState(0);
  const key = JSON.stringify(query);
  useEffect(() => setOffset(0), [key]);
  const { data, error, loading, reload } = useApi<EntriesResponse>("/analytics/entries", { ...query, offset, limit: PAGE });
  const { can } = useSession();
  const shell = useShell();
  const canEdit = can("editOthersTime", "yes");

  if (error) return <LoadError error={error} onRetry={reload} what="these time entries" />;
  if (loading && !data) return <SkeletonRows rows={8} />;
  if (!data?.rows.length) return <EmptyState compact title="No time entries" description="Nothing matches these filters." />;
  return (
    <div>
      <div className={s.entriesSummary}>
        <span className="muted">{data.total} entries</span>
        <span className="num medium">{hm(data.minutes)}</span>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              {showUser && <th>Employee</th>}
              <th>Project / task</th>
              <th style={{ width: "40%" }}>Description</th>
              <th className="num">Duration</th>
              <th>Billable</th>
              {canEdit && <th style={{ width: 36 }} />}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id}>
                <td className="num">{fmtDate(r.date)}{r.startTime && <div className="faint tiny">{r.startTime}–{r.endTime}</div>}</td>
                {showUser && <td>{r.user.name}</td>}
                <td className="wrap-cell" style={{ minWidth: 180 }}>
                  <div className="row gap-4"><ProjectDot color={r.projectColor} /><span className="medium">{r.project}</span>{r.subProject && <span className="faint">› {r.subProject}</span>}</div>
                  {r.task && <div className="muted small">{r.task}</div>}
                </td>
                <td className="wrap-cell">{r.description || <span className="faint">No description</span>}</td>
                <td className="num">{hm(r.minutes)}</td>
                <td>{r.billable ? <Badge tone="green" size="sm">Billable</Badge> : <Badge size="sm">Non-billable</Badge>}</td>
                {canEdit && (
                  <td><IconButton size="sm" label="Edit entry" icon={<Pencil size={13} />} onClick={() => shell.editEntry(r.id, () => { reload(); onChanged?.(); })} /></td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.total > PAGE && (
        <div className={s.pager}>
          <span className="faint small num">{offset + 1}–{Math.min(offset + PAGE, data.total)} of {data.total}</span>
          <Button size="sm" variant="ghost" icon={<ChevronLeft size={14} />} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Prev</Button>
          <Button size="sm" variant="ghost" iconRight={<ChevronRight size={14} />} disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>Next</Button>
        </div>
      )}
    </div>
  );
}

/** Right-hand panel with the entries behind a row; used by every drill-down. */
export function EntriesSheet({ open, onClose, title, query, showUser, onChanged }: { open: boolean; onClose: () => void; title: ReactNode; query: Record<string, string> | null; showUser?: boolean; onChanged?: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={title} width={860}>
      {query && <EntriesTable query={query} showUser={showUser} onChanged={onChanged} />}
    </Sheet>
  );
}
