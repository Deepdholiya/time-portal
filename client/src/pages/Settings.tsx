import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../state";

type Matrix = { roles: string[]; features: Record<string, { label: string; levels: string[] }>; matrix: Record<string, Record<string, string>> };
type Log = { id: number; action: string; entity: string; entityId: number | null; details: string | null; createdAt: string; user: { name: string } | null };

const LEVEL_LABEL: Record<string, string> = { none: "No access", own: "Own data only", all: "Everyone's data", view: "Can view", no: "No", yes: "Yes" };
const ROLE_LABEL: Record<string, string> = { ADMIN: "Admin", MANAGER: "Manager", EMPLOYEE: "Employee" };

export function Settings() {
  const { toast, reloadMe } = useApp();
  const [m, setM] = useState<Matrix | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [tab, setTab] = useState<"access" | "audit">("access");
  useEffect(() => { api<Matrix>("/settings/permissions").then(setM); }, []);
  useEffect(() => { if (tab === "audit") api<Log[]>("/settings/audit").then(setLogs); }, [tab]);

  async function change(role: string, feature: string, level: string) {
    try {
      const r = await api<{ matrix: Matrix["matrix"] }>("/settings/permissions", { method: "PUT", body: { role, feature, level } });
      setM((x) => x && { ...x, matrix: r.matrix });
      toast(`${ROLE_LABEL[role]}: ${m!.features[feature].label} set to ${LEVEL_LABEL[level]}`);
      reloadMe();
    } catch (e) { toast((e as Error).message, "error"); }
  }

  return (
    <>
      <header className="page-head"><div><h1>Access &amp; audit</h1><p>Choose what each role can see and do. Changes apply immediately and are enforced on the server.</p></div></header>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "access"} className={tab === "access" ? "on" : ""} onClick={() => setTab("access")}>Role access</button>
        <button role="tab" aria-selected={tab === "audit"} className={tab === "audit" ? "on" : ""} onClick={() => setTab("audit")}>Audit log</button>
      </div>
      {tab === "access" && m && (
        <div className="card flush table-wrap">
          <table className="simple matrix">
            <thead><tr><th>Feature</th>{m.roles.map((r) => <th key={r}>{ROLE_LABEL[r]}</th>)}</tr></thead>
            <tbody>
              {Object.entries(m.features).map(([key, f]) => (
                <tr key={key}>
                  <td><strong>{f.label}</strong></td>
                  {m.roles.map((r) => (
                    <td key={r}>
                      {r === "ADMIN" ? <span className="muted" title="Admins always keep full access">{LEVEL_LABEL[m.matrix[r][key]]} 🔒</span> : (
                        <select value={m.matrix[r][key]} onChange={(e) => change(r, key, e.target.value)} aria-label={`${f.label} for ${ROLE_LABEL[r]}`}>
                          {f.levels.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
                        </select>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small" style={{ padding: "0 16px 14px" }}>Project access for each person (all projects or selected ones) is set on the People page. Roadmap “Can view” shows every project's timeline; analytics “Own data only” limits charts and the work log to the person's own time.</p>
        </div>
      )}
      {tab === "audit" && (
        <div className="card flush table-wrap">
          <table className="simple">
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="nowrap">{new Date(l.createdAt).toLocaleString()}</td>
                  <td>{l.user?.name ?? <span className="muted">—</span>}</td>
                  <td><code>{l.action}</code> <small className="muted">{l.entity}{l.entityId ? ` #${l.entityId}` : ""}</small></td>
                  <td><small className="muted mono">{l.details}</small></td>
                </tr>
              ))}
              {!logs.length && <tr><td colSpan={4} className="empty">No activity yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
