import { ArrowDownWideNarrow, ArrowUpNarrowWide, Columns3 } from "lucide-react";
import { Button, Checkbox, IconButton, Popover, SegmentedControl, Select } from "@/components/ui";
import s from "./reports.module.css";

// Mirrors server/src/routes/reports.ts (GROUPS / COLUMNS).
export const GROUP_OPTIONS = [
  { value: "project", label: "Project" }, { value: "subProject", label: "Sub-project" }, { value: "employee", label: "Employee" }, { value: "client", label: "Client" },
  { value: "team", label: "Team" }, { value: "task", label: "Task" }, { value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" },
  { value: "billable", label: "Billable" },
] as const;
export type GroupKey = (typeof GROUP_OPTIONS)[number]["value"];

export const COLUMN_OPTIONS = [
  { value: "date", label: "Date" }, { value: "week", label: "Week" }, { value: "employee", label: "Employee" }, { value: "team", label: "Team" },
  { value: "client", label: "Client" }, { value: "project", label: "Project" }, { value: "subProject", label: "Sub-project" }, { value: "task", label: "Task" },
  { value: "milestone", label: "Milestone" }, { value: "description", label: "Description" }, { value: "hours", label: "Hours" }, { value: "billable", label: "Billable" },
  { value: "start", label: "Start" }, { value: "end", label: "End" },
] as const;
export type ColumnKey = (typeof COLUMN_OPTIONS)[number]["value"];

export interface ReportConfig {
  groupBy: GroupKey[];
  columns: ColumnKey[];
  sort: { by: string; dir: "asc" | "desc" };
  chart: "bar" | "line" | "none";
  chartBy: GroupKey;
}
export const DEFAULT_CONFIG: ReportConfig = {
  groupBy: ["project", "employee"],
  columns: ["date", "employee", "client", "project", "subProject", "task", "description", "hours", "billable"],
  sort: { by: "date", dir: "desc" },
  chart: "bar",
  chartBy: "day",
};

const SORTS = [{ value: "date", label: "Date" }, { value: "hours", label: "Hours" }, { value: "employee", label: "Employee" }, { value: "project", label: "Project" }, { value: "client", label: "Client" }, { value: "task", label: "Task" }];

export function ConfigBar({ value, onChange }: { value: ReportConfig; onChange: (c: ReportConfig) => void }) {
  const set = (p: Partial<ReportConfig>) => onChange({ ...value, ...p });
  const g1 = value.groupBy[0] ?? "";
  const g2 = value.groupBy[1] ?? "";
  return (
    <div className={s.config}>
      <span className={s.cfgLabel}>Group by</span>
      <Select size="sm" fullWidth={false} value={g1} aria-label="Group by" onChange={(v) => set({ groupBy: v ? ([v, g2].filter((x, i) => x && (i === 0 || x !== v)) as GroupKey[]) : [] })}
        options={[{ value: "", label: "No grouping" }, ...GROUP_OPTIONS]} />
      {g1 && (
        <>
          <span className="faint">then</span>
          <Select size="sm" fullWidth={false} value={g2} aria-label="Then group by" onChange={(v) => set({ groupBy: (v ? [g1, v] : [g1]) as GroupKey[] })}
            options={[{ value: "", label: "Nothing" }, ...GROUP_OPTIONS.filter((o) => o.value !== g1)]} />
        </>
      )}
      <span className={s.sep} />
      <span className={s.cfgLabel}>Sort</span>
      <Select size="sm" fullWidth={false} value={value.sort.by} aria-label="Sort by" onChange={(by) => set({ sort: { ...value.sort, by } })} options={SORTS} />
      <IconButton size="sm" label={value.sort.dir === "asc" ? "Ascending" : "Descending"} icon={value.sort.dir === "asc" ? <ArrowUpNarrowWide size={14} /> : <ArrowDownWideNarrow size={14} />}
        onClick={() => set({ sort: { ...value.sort, dir: value.sort.dir === "asc" ? "desc" : "asc" } })} />
      <span className={s.sep} />
      <span className={s.cfgLabel}>Chart</span>
      <SegmentedControl aria-label="Chart type" value={value.chart} onChange={(chart) => set({ chart })}
        options={[{ value: "bar", label: "Bar" }, { value: "line", label: "Line" }, { value: "none", label: "None" }]} />
      {value.chart !== "none" && (
        <Select size="sm" fullWidth={false} value={value.chartBy} aria-label="Chart by" onChange={(v) => set({ chartBy: v as GroupKey })}
          options={GROUP_OPTIONS.map((o) => ({ value: o.value, label: `by ${o.label.toLowerCase()}` }))} />
      )}
      <span className={s.sep} />
      <Popover trigger={<Button size="sm" variant="ghost" icon={<Columns3 size={14} />}>Columns <span className="faint">{value.columns.length}</span></Button>} width={220}>
        <div className="col gap-4">
          {COLUMN_OPTIONS.map((c) => (
            <Checkbox key={c.value} label={c.label} checked={value.columns.includes(c.value)}
              onChange={(on) => set({ columns: on ? COLUMN_OPTIONS.map((o) => o.value).filter((k) => k === c.value || value.columns.includes(k)) : value.columns.filter((k) => k !== c.value) })} />
          ))}
        </div>
      </Popover>
    </div>
  );
}
