import { useMemo, useState } from "react";
import { Mail, Search, Sparkles } from "lucide-react";
import { Page } from "@/components/app/page";
import { Badge, EmptyState, ErrorState, Input, Select, Sheet, SkeletonRows, Tooltip } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { fmtDateTime, relTime, titleCase } from "@/lib/format";

type Email = {
  id: number; kind: string; to: string; subject: string; body: string; aiGenerated: boolean; status: string; sentAt: string | null; createdAt: string;
  sentBy: { name: string } | null;
};

export default function Outbox() {
  const { data, error, loading, reload } = useApi<Email[]>("/settings/outbox");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [open, setOpen] = useState<Email | null>(null);
  const kinds = useMemo(() => [...new Set((data ?? []).map((e) => e.kind))].sort(), [data]);
  const rows = (data ?? []).filter((e) => (!kind || e.kind === kind) && (!q || `${e.to} ${e.subject}`.toLowerCase().includes(q.toLowerCase())));

  const toolbar = (
    <>
      <Input size="sm" icon={<Search size={14} />} placeholder="Search recipient or subject" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 240 }} />
      <Select size="sm" fullWidth={false} value={kind} onChange={setKind} aria-label="Kind" options={[{ value: "", label: "All kinds" }, ...kinds.map((k) => ({ value: k, label: titleCase(k) }))]} />
      <div className="grow" />
      <span className="small faint">Latest 200 emails sent from this company</span>
    </>
  );

  return (
    <Page title="Email log" icon={<Mail size={15} />} toolbar={toolbar}>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <SkeletonRows /> : !rows.length ? (
        <EmptyState icon={<Mail size={28} />} title="No emails" description={data?.length ? "Nothing matches these filters." : "Invitations, password resets, reports and client emails show up here."} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>To</th><th>Subject</th><th>Kind</th><th>Sent by</th><th>Time</th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="clickable" onClick={() => setOpen(e)}>
                  <td>{e.to}</td>
                  <td className="ellipsis" style={{ maxWidth: 420 }}>
                    <span className="row gap-4">
                      {e.aiGenerated && <Tooltip content="Drafted with AI"><Sparkles size={13} style={{ color: "var(--purple)" }} /></Tooltip>}
                      <span className="ellipsis">{e.subject}</span>
                    </span>
                  </td>
                  <td><Badge size="sm" tone={e.kind === "CLIENT_UPDATE" ? "accent" : "gray"}>{titleCase(e.kind)}</Badge></td>
                  <td className="muted">{e.sentBy?.name ?? <span className="faint">System</span>}</td>
                  <td className="muted num"><Tooltip content={fmtDateTime(e.sentAt ?? e.createdAt)}><span>{relTime(e.sentAt ?? e.createdAt)}</span></Tooltip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Sheet open={!!open} onClose={() => setOpen(null)} width={560} title={open?.subject}>
        {open && (
          <div className="col gap-16" style={{ padding: 20 }}>
            <div className="col" style={{ gap: 0 }}>
              <div className="prop-row"><span className="prop-label">To</span><span>{open.to}</span></div>
              <div className="prop-row"><span className="prop-label">Kind</span><span>{titleCase(open.kind)}{open.aiGenerated && <Badge tone="purple" size="sm" icon={<Sparkles size={11} />}>AI drafted</Badge>}</span></div>
              <div className="prop-row"><span className="prop-label">Sent by</span><span>{open.sentBy?.name ?? "System"}</span></div>
              <div className="prop-row"><span className="prop-label">Sent</span><span>{fmtDateTime(open.sentAt ?? open.createdAt)} · {titleCase(open.status)}</span></div>
            </div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "var(--font)", fontSize: 13, lineHeight: 1.6, padding: 16, border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", background: "var(--bg-subtle)" }}>{open.body}</pre>
            <p className="tiny faint">Secrets such as temporary passwords are masked in the log.</p>
          </div>
        )}
      </Sheet>
    </Page>
  );
}
