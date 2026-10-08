import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, Download, ScrollText, Search } from "lucide-react";
import { Page } from "@/components/app/page";
import { Button, Combobox, DateRangePicker, EmptyState, ErrorState, Input, Select, SkeletonRows, Tooltip, presetRange, type DateRange } from "@/components/arc";
import { download } from "@/lib/api";
import { useApi, useDebounced } from "@/lib/hooks";
import { fmtDateTime, relTime, titleCase } from "@/lib/format";
import type { Options } from "@/lib/types";
import { describeAgent } from "./user-dialogs";
import s from "./audit.module.css";

type Row = {
  id: number; action: string; entity: string; entityId: number | null; oldValue: string | null; newValue: string | null; reason: string | null;
  ip: string | null; userAgent: string | null; createdAt: string; user: { id: number; name: string } | null; company: string;
};
type Resp = { total: number; actions: string[]; rows: Row[] };
const ENTITIES = ["user", "invitation", "timeEntry", "timesheet", "task", "project", "milestone", "client", "team", "company", "permission", "integration", "automation", "leave", "holiday", "customField", "report", "audit"];
const PAGE = 50;

export default function Audit() {
  const opts = useApi<Options>("/options");
  const [action, setAction] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [entity, setEntity] = useState("");
  const [range, setRange] = useState<DateRange>(() => presetRange("Last 30 days"));
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const dq = useDebounced(q);
  const query = { action, userId: userId ?? undefined, entity, from: range.from, to: range.to, q: dq };
  const { data, error, loading, reload } = useApi<Resp>("/settings/audit", { ...query, offset, limit: PAGE });
  const reset = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setOffset(0); };

  const toggle = (id: number) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const toolbar = (
    <>
      <Input size="sm" icon={<Search size={14} />} placeholder="Search values or reason" value={q} onChange={(e) => reset(setQ)(e.target.value)} style={{ width: 200 }} />
      <Select size="sm" fullWidth={false} value={action} onChange={reset(setAction)} aria-label="Action" options={[{ value: "", label: "All actions" }, ...(data?.actions ?? []).map((a) => ({ value: a, label: titleCase(a) }))]} />
      <Select size="sm" fullWidth={false} value={entity} onChange={reset(setEntity)} aria-label="Object" options={[{ value: "", label: "All objects" }, ...ENTITIES.map((e) => ({ value: e, label: entityLabel(e) }))]} />
      <Combobox size="sm" appearance="chip" value={userId} onChange={reset(setUserId)} clearable placeholder="Any actor" options={(opts.data?.users ?? []).map((u) => ({ value: String(u.id), label: u.name }))} />
      <DateRangePicker size="sm" value={range} onChange={reset(setRange)} />
      <div className="grow" />
      <Button size="sm" variant="ghost" icon={<Download size={14} />} onClick={() => download("/settings/audit/export.csv", query)}>Export CSV</Button>
    </>
  );

  return (
    <Page title="Audit log" icon={<ScrollText size={15} />} toolbar={toolbar}>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <SkeletonRows /> : !data?.rows.length ? (
        <EmptyState icon={<ScrollText size={28} />} title="No audit events" description="Nothing matches these filters. Try a wider date range." />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th style={{ width: 28 }} /><th>Time</th><th>Actor</th><th>Action</th><th>Object</th><th>Change</th><th>Reason</th><th>IP / device</th></tr></thead>
              <tbody>
                {data.rows.map((r) => {
                  const diff = diffOf(r);
                  const expanded = open.has(r.id);
                  const expandable = diff.length > 0;
                  return (
                    <Fragment key={r.id}>
                      <tr className={expandable ? "clickable" : undefined} onClick={() => expandable && toggle(r.id)} data-action={r.action}>
                        <td className="faint">{expandable && (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}</td>
                        <td className="muted num"><Tooltip content={relTime(r.createdAt)}><span>{fmtDateTime(r.createdAt)}</span></Tooltip></td>
                        <td>{r.user?.name ?? <span className="faint">System</span>}</td>
                        <td><span className={s.action}>{titleCase(r.action)}</span></td>
                        <td className="muted">{entityLabel(r.entity)}{r.entityId != null && <span className="faint"> #{r.entityId}</span>}</td>
                        <td className={s.changeCell}>{summary(diff)}</td>
                        <td className="ellipsis" style={{ maxWidth: 200 }}>{r.reason ?? <span className="faint">—</span>}</td>
                        <td className="small faint"><Tooltip content={r.userAgent ?? "Unknown"}><span>{r.ip ?? "—"} · {describeAgent(r.userAgent)}</span></Tooltip></td>
                      </tr>
                      {expanded && (
                        <tr className={s.detail}>
                          <td />
                          <td colSpan={7}>
                            <table className={s.diff}>
                              <thead><tr><th>Field</th><th>Old value</th><th>New value</th></tr></thead>
                              <tbody>
                                {diff.map((d) => (
                                  <tr key={d.key}>
                                    <td className="mono">{d.key}</td>
                                    <td className={s.old}><pre>{show(d.old)}</pre></td>
                                    <td className={s.new}><pre>{show(d.new)}</pre></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="row between" style={{ padding: "10px 20px" }}>
            <span className="small faint">{offset + 1}–{offset + data.rows.length} of {data.total}</span>
            <div className="row">
              <Button size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</Button>
              <Button size="sm" disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>Next</Button>
            </div>
          </div>
        </>
      )}
    </Page>
  );
}

function entityLabel(e: string) {
  return e === "timeEntry" ? "Time entry" : e === "customField" ? "Custom field" : titleCase(e);
}

const parse = (v: string | null): unknown => {
  if (v == null) return undefined;
  try { return JSON.parse(v); } catch { return v; }
};
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
type Diff = { key: string; old: unknown; new: unknown };

/** Changed keys between the old and new snapshots; plain values become a single "value" row. */
function diffOf(r: Row): Diff[] {
  const o = parse(r.oldValue), n = parse(r.newValue);
  if (o === undefined && n === undefined) return [];
  if (isObj(o) || isObj(n)) {
    const oo = isObj(o) ? o : {}, nn = isObj(n) ? n : {};
    const keys = [...new Set([...Object.keys(oo), ...Object.keys(nn)])];
    const out: Diff[] = [];
    for (const k of keys) {
      // When only "new" is recorded, show it; when both exist, show only changed keys.
      if (isObj(o) && isObj(n) && !(k in nn)) continue;
      if (JSON.stringify(oo[k]) !== JSON.stringify(nn[k])) out.push({ key: k, old: oo[k], new: nn[k] });
    }
    return out;
  }
  return [{ key: "value", old: o, new: n }];
}

function show(v: unknown) {
  if (v === undefined) return "—";
  if (v === null) return "null";
  if (typeof v === "string") return v;
  return JSON.stringify(v, null, 2);
}
const short = (v: unknown) => { const t = v === undefined ? "—" : typeof v === "string" ? v : JSON.stringify(v); return t.length > 28 ? t.slice(0, 27) + "…" : t; };

function summary(diff: Diff[]) {
  if (!diff.length) return <span className="faint">—</span>;
  const first = diff.slice(0, 2).map((d) => (
    <span key={d.key} className={s.chip}><span className="faint">{d.key}</span> {d.old !== undefined && <><s className="faint">{short(d.old)}</s> → </>}<span>{short(d.new)}</span></span>
  ));
  return <span className="row gap-4">{first}{diff.length > 2 && <span className="faint small">+{diff.length - 2}</span>}</span>;
}
