import { ArrowDownWideNarrow, ArrowUpNarrowWide, Check, ChevronDown, Columns3, Layers } from "lucide-react";
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

/** "Group by: Project › Employee" button; the menu lists the first and second level side by side and applies on click. */
export function GroupByMenu({ value, onChange }: { value: ReportConfig; onChange: (c: ReportConfig) => void }) {
  const [g1, g2] = value.groupBy;
  const label = (k?: string) => GROUP_OPTIONS.find((o) => o.value === k)?.label;
  const pick = (level: 0 | 1, k: GroupKey | "") => {
    if (level === 0) onChange({ ...value, groupBy: (k ? [k, g2].filter((x, i) => x && (i === 0 || x !== k)) : []) as GroupKey[] });
    else onChange({ ...value, groupBy: (k ? [g1, k] : [g1]) as GroupKey[] });
  };
  const col = (title: string, level: 0 | 1, cur: string | undefined, opts: { value: string; label: string }[]) => (
    <div className={s.gbCol}>
      <div className={s.gbTitle}>{title}</div>
      {opts.map((o) => (
        <button key={o.value} type="button" className={`${s.gbItem} ${(cur ?? "") === o.value ? s.gbOn : ""}`} aria-pressed={(cur ?? "") === o.value} onClick={() => pick(level, o.value as GroupKey)}>
          <span className="grow">{o.label}</span>{(cur ?? "") === o.value && <Check size={14} />}
        </button>
      ))}
    </div>
  );
  return (
    <Popover placement="bottom-start" width={g1 ? 380 : 200}
      trigger={<Button size="sm" variant="secondary" icon={<Layers size={14} />} iconRight={<ChevronDown size={13} className="faint" />}>
        <span className="faint">Group by</span>&nbsp;{g1 ? `${label(g1)}${g2 ? ` › ${label(g2)}` : ""}` : "None"}</Button>}>
      <div className={s.gbMenu}>
        {col("Group by", 0, g1, [{ value: "", label: "No grouping" }, ...GROUP_OPTIONS])}
        {g1 && col("Then by", 1, g2, [{ value: "", label: "Nothing" }, ...GROUP_OPTIONS.filter((o) => o.value !== g1)])}
      </div>
    </Popover>
  );
}

/** Chart type and dimension, shown in the chart card's header. */
export function ChartControls({ value, onChange }: { value: ReportConfig; onChange: (c: ReportConfig) => void }) {
  return (
    <div className="row gap-4">
      <SegmentedControl aria-label="Chart type" value={value.chart} onChange={(chart) => onChange({ ...value, chart })}
        options={[{ value: "bar", label: "Bar" }, { value: "line", label: "Line" }, { value: "none", label: "Hide" }]} />
      {value.chart !== "none" && (
        <Select size="sm" fullWidth={false} value={value.chartBy} aria-label="Chart by" onChange={(v) => onChange({ ...value, chartBy: v as GroupKey })}
          options={GROUP_OPTIONS.map((o) => ({ value: o.value, label: `By ${o.label.toLowerCase()}` }))} />
      )}
    </div>
  );
}

/** Sort and visible columns, shown in the Detailed table's header. */
export function TableControls({ value, onChange }: { value: ReportConfig; onChange: (c: ReportConfig) => void }) {
  const set = (p: Partial<ReportConfig>) => onChange({ ...value, ...p });
  return (
    <div className="row gap-4">
      <span className="small faint">Sort</span>
      <Select size="sm" fullWidth={false} value={value.sort.by} aria-label="Sort by" onChange={(by) => set({ sort: { ...value.sort, by } })} options={SORTS} />
      <IconButton size="sm" variant="secondary" label={value.sort.dir === "asc" ? "Ascending" : "Descending"} icon={value.sort.dir === "asc" ? <ArrowUpNarrowWide size={14} /> : <ArrowDownWideNarrow size={14} />}
        onClick={() => set({ sort: { ...value.sort, dir: value.sort.dir === "asc" ? "desc" : "asc" } })} />
      <Popover placement="bottom-end" trigger={<Button size="sm" variant="secondary" icon={<Columns3 size={14} />}>Columns <span className="faint">{value.columns.length}</span></Button>} width={220}>
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
