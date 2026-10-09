import { useState } from "react";
import { Info, Lock, ShieldCheck } from "lucide-react";
import { Page } from "@/components/app/page";
import { ErrorState, Select, SkeletonRows, Tooltip, toast } from "@/components/ui";
import { put } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { titleCase } from "@/lib/format";
import type { FeatureDef } from "./user-dialogs";
import s from "./roles.module.css";

type Matrix = Record<"ADMIN" | "MANAGER" | "EMPLOYEE", Record<string, string>>;
type Resp = { features: Record<string, FeatureDef>; roles: string[]; matrix: Matrix };
const EDITABLE = ["MANAGER", "EMPLOYEE"] as const;

export default function Roles() {
  const { data, error, loading, reload, mutate } = useApi<Resp>("/settings/permissions");
  const { refresh } = useSession();
  const [saving, setSaving] = useState<string | null>(null);

  const change = async (role: (typeof EDITABLE)[number], feature: string, level: string) => {
    if (!data) return;
    const prev = data.matrix;
    mutate({ ...data, matrix: { ...prev, [role]: { ...prev[role], [feature]: level } } });
    setSaving(`${role}:${feature}`);
    try {
      const matrix = await put<Matrix>("/settings/permissions", { role, feature, level });
      mutate({ ...data, matrix });
      toast.success(`${titleCase(role)}s: ${data.features[feature].label} → ${titleCase(level)}`);
      refresh();
    } catch (e) {
      mutate({ ...data, matrix: prev });
      toast.error(e);
    } finally { setSaving(null); }
  };

  const groups = data ? [...new Set(Object.values(data.features).map((f) => f.group))] : [];

  return (
    <Page title="Roles & permissions" icon={<ShieldCheck size={15} />}>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <SkeletonRows /> : data && (
        <div className={s.wrap}>
          <p className="small muted" style={{ marginBottom: 16 }}>
            What each role can do in this company. Changes save immediately and apply on everyone's next request. Individual overrides live under Users → Access overrides. Every change is written to the audit log.
          </p>
          <table className={`table ${s.matrix}`}>
            <thead>
              <tr>
                <th>Feature</th>
                <th className={s.roleCol}><span className="row gap-4"><Lock size={12} />Admin</span></th>
                <th className={s.roleCol}>Manager</th>
                <th className={s.roleCol}>Employee</th>
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g}>
                <tr className={s.group}><td colSpan={4}>{g}</td></tr>
                {Object.entries(data.features).filter(([, f]) => f.group === g).map(([k, f]) => (
                  <tr key={k}>
                    <td>
                      <Tooltip content={f.help}>
                        <span className="row gap-4">{f.label}<Info size={12} className="faint" /></span>
                      </Tooltip>
                    </td>
                    <td className={s.roleCol}><span className={s.locked}>{titleCase(data.matrix.ADMIN[k])}</span></td>
                    {EDITABLE.map((role) => (
                      <td key={role} className={s.roleCol}>
                        <Select
                          size="sm" value={data.matrix[role][k]} onChange={(v) => change(role, k, v)} aria-label={`${titleCase(role)} ${f.label}`}
                          disabled={saving === `${role}:${k}` || (role === "MANAGER" && k === "companies")}
                          options={f.levels.map((l) => ({ value: l, label: titleCase(l) }))}
                          title={role === "MANAGER" && k === "companies" ? "Managers can't be given company management" : undefined}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </Page>
  );
}
