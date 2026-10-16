import { useMemo, type ReactNode } from "react";
import { Briefcase, Building2, CheckCircle2, CircleDollarSign, FolderTree, ListTodo, Tag, User, Users } from "lucide-react";
import { Combobox, DateRangePicker, presetRange, type ComboboxOption, type DateRange } from "@/components/ui";
import { ProjectDot, STATUS_META, STATUSES } from "@/components/app/icons";
import { FilterMenu, type FilterSection, type FilterValues } from "@/components/app/filter-menu";
import { useApi } from "@/lib/hooks";
import type { Options } from "@/lib/types";
import s from "./analytics.module.css";

/** Global filters shared by Analytics, Reports and Team timesheets. */
export interface Filters {
  range: DateRange;
  clientId: string[];
  projectId: string[];
  subProjectId: string[];
  teamId: string[];
  userId: string[];
  taskId: string[];
  status: string[];
  billable: string; // "" | "true" | "false"
  tag: string;
}

export const emptyFilters = (range: DateRange = presetRange("This month")): Filters => ({
  range, clientId: [], projectId: [], subProjectId: [], teamId: [], userId: [], taskId: [], status: [], billable: "", tag: "",
});

/** Flat string query understood by the server's filtersSchema (GET query or POST body). */
export function filterQuery(f: Filters, extra: Record<string, string | undefined> = {}): Record<string, string> {
  const out: Record<string, string> = { from: f.range.from, to: f.range.to };
  const lists: (keyof Filters)[] = ["clientId", "projectId", "subProjectId", "teamId", "userId", "taskId", "status"];
  for (const k of lists) { const v = f[k] as string[]; if (v.length) out[k] = v.join(","); }
  if (f.billable) out.billable = f.billable;
  if (f.tag) out.tag = f.tag;
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== "") out[k] = v;
  return out;
}

export const activeCount = (f: Filters) =>
  f.clientId.length + f.projectId.length + f.subProjectId.length + f.teamId.length + f.userId.length + f.taskId.length + f.status.length + (f.billable ? 1 : 0) + (f.tag ? 1 : 0);

export function useOptions() {
  return useApi<Options>("/options");
}

/** Compact chip trigger: "Project  Website Redesign +1". */
export function ChipTrigger({ icon, label, value, active, ...rest }: { icon: ReactNode; label: string; value?: ReactNode; active: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`${s.chip} ${active ? s.chipOn : ""}`} {...rest}>
      {icon}
      <span className={active ? s.chipLabelOn : ""}>{label}</span>
      {value && <span className={s.chipValue}>{value}</span>}
    </button>
  );
}

export function MultiChip({ icon, label, options, value, onChange }: { icon: ReactNode; label: string; options: ComboboxOption[]; value: string[]; onChange: (v: string[]) => void }) {
  const first = options.find((o) => String(o.value) === value[0]);
  const shown = value.length === 0 ? undefined : value.length === 1 ? first?.label ?? "1 selected" : `${first?.label ?? ""} +${value.length - 1}`;
  return (
    <Combobox
      multiple options={options} value={value} onChange={onChange} width={260} searchPlaceholder={`Filter by ${label.toLowerCase()}…`}
      trigger={<ChipTrigger icon={icon} label={label} value={shown} active={value.length > 0} aria-label={`${label} filter`} />}
    />
  );
}

export function SingleChip({ icon, label, options, value, onChange }: { icon: ReactNode; label: string; options: ComboboxOption[]; value: string; onChange: (v: string) => void }) {
  const cur = options.find((o) => String(o.value) === value);
  return (
    <Combobox
      options={options} value={value || null} onChange={(v) => onChange(v ?? "")} clearable clearLabel={`Any ${label.toLowerCase()}`} width={220}
      trigger={<ChipTrigger icon={icon} label={label} value={cur?.label} active={!!value} aria-label={`${label} filter`} />}
    />
  );
}

export type FilterKey = "client" | "project" | "subProject" | "team" | "employee" | "task" | "status" | "billable" | "tag";
const ALL: FilterKey[] = ["client", "project", "subProject", "team", "employee", "task", "billable", "status", "tag"];

const KEY: Record<FilterKey, keyof Filters> = { client: "clientId", project: "projectId", subProject: "subProjectId", team: "teamId", employee: "userId", task: "taskId", status: "status", billable: "billable", tag: "tag" };

/**
 * Filter bar, the same on every page: scope and date range, then the shared Filter dropdown, all on the left; page actions such
 * as Export on the right. The Filter dropdown holding every dimension (multi-select with Select all),
 * applied together. `extra` adds sections such as Rows to the same dropdown.
 */
export function FilterBar({ value, onChange, hide = [], showRange = true, presets, leading, afterRange, trailing, extra, label }: {
  value: Filters; onChange: (f: Filters) => void; hide?: FilterKey[]; showRange?: boolean; presets?: string[]; leading?: ReactNode; afterRange?: ReactNode; trailing?: ReactNode; label?: string;
  extra?: { sections: FilterSection[]; value: FilterValues; onChange: (v: FilterValues) => void };
}) {
  const { data: opts } = useOptions();
  const shown = ALL.filter((k) => !hide.includes(k));

  const sections = useMemo<FilterSection[]>(() => {
    const projects = opts?.projects ?? [];
    const top = projects.filter((p) => !p.parentId);
    const topName = (id?: number | null) => top.find((t) => t.id === id)?.name;
    const all: Record<FilterKey, FilterSection> = {
      client: { key: "client", label: "Client", icon: <Building2 size={13} />, options: (opts?.clients ?? []).map((c) => ({ value: String(c.id), label: c.name })) },
      project: { key: "project", label: "Project", icon: <Briefcase size={13} />, options: top.map((p) => ({ value: String(p.id), label: p.name, icon: <ProjectDot color={p.color} /> })) },
      subProject: { key: "subProject", label: "Sub-project", icon: <FolderTree size={13} />, options: projects.filter((p) => p.parentId).map((p) => ({ value: String(p.id), label: p.name, icon: <ProjectDot color={p.color} />, hint: topName(p.parentId) })) },
      team: { key: "team", label: "Team", icon: <Users size={13} />, options: (opts?.teams ?? []).map((t) => ({ value: String(t.id), label: t.name })) },
      employee: { key: "employee", label: "Employee", icon: <User size={13} />, options: (opts?.users ?? []).map((u) => ({ value: String(u.id), label: u.name })) },
      task: { key: "task", label: "Task", icon: <ListTodo size={13} />, options: projects.flatMap((p) => p.tasks.map((t) => ({ value: String(t.id), label: t.title, hint: t.key, keywords: p.name }))).slice(0, 400) },
      billable: { key: "billable", label: "Billable", icon: <CircleDollarSign size={13} />, single: true, options: [{ value: "true", label: "Billable" }, { value: "false", label: "Non-billable" }] },
      status: { key: "status", label: "Status", icon: <CheckCircle2 size={13} />, options: STATUSES.map((st) => ({ value: st, label: STATUS_META[st].label })) },
      tag: { key: "tag", label: "Tag", icon: <Tag size={13} />, single: true, options: (opts?.tags ?? []).map((t) => ({ value: t, label: t })) },
    };
    return shown.map((k) => all[k]).filter((x) => x.options.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts, shown.join()]);

  const values: FilterValues = { ...(extra?.value ?? {}) };
  for (const k of shown) { const v = value[KEY[k]]; values[k] = Array.isArray(v) ? v : v ? [v as string] : []; }
  const apply = (v: FilterValues) => {
    const next: Filters = { ...value };
    for (const k of shown) {
      const field = KEY[k];
      (next as unknown as Record<string, unknown>)[field] = Array.isArray(value[field]) ? (v[k] ?? []) : (v[k]?.[0] ?? "");
    }
    onChange(next);
    if (extra) extra.onChange(Object.fromEntries(extra.sections.map((x) => [x.key, v[x.key] ?? []])));
  };

  return (
    <div className={s.filterBar}>
      {leading}
      {showRange && <DateRangePicker size="sm" value={value.range} onChange={(range) => onChange({ ...value, range })} presets={presets} />}
      {afterRange}
      <FilterMenu sections={[...(extra?.sections ?? []), ...sections]} value={values} onApply={apply} placement="bottom-start" label={label} />
      <div className="grow" />
      {trailing && <div className="row" style={{ marginLeft: "auto" }}>{trailing}</div>}
    </div>
  );
}
