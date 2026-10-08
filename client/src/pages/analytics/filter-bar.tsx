import { useMemo, type ReactNode } from "react";
import { Briefcase, Building2, CheckCircle2, CircleDollarSign, FolderTree, ListTodo, Tag, User, Users, X } from "lucide-react";
import { Button, Combobox, DateRangePicker, presetRange, type ComboboxOption, type DateRange } from "@/components/arc";
import { ProjectDot, STATUS_META, STATUSES } from "@/components/app/icons";
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
function ChipTrigger({ icon, label, value, active, ...rest }: { icon: ReactNode; label: string; value?: ReactNode; active: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`${s.chip} ${active ? s.chipOn : ""}`} {...rest}>
      {icon}
      <span className={active ? s.chipLabelOn : ""}>{label}</span>
      {value && <span className={s.chipValue}>{value}</span>}
    </button>
  );
}

function MultiChip({ icon, label, options, value, onChange }: { icon: ReactNode; label: string; options: ComboboxOption[]; value: string[]; onChange: (v: string[]) => void }) {
  const first = options.find((o) => String(o.value) === value[0]);
  const shown = value.length === 0 ? undefined : value.length === 1 ? first?.label ?? "1 selected" : `${first?.label ?? ""} +${value.length - 1}`;
  return (
    <Combobox
      multiple options={options} value={value} onChange={onChange} width={260} searchPlaceholder={`Filter by ${label.toLowerCase()}…`}
      trigger={<ChipTrigger icon={icon} label={label} value={shown} active={value.length > 0} aria-label={`${label} filter`} />}
    />
  );
}

function SingleChip({ icon, label, options, value, onChange }: { icon: ReactNode; label: string; options: ComboboxOption[]; value: string; onChange: (v: string) => void }) {
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

/** One-row filter bar: date range + dimension chips + clear. */
export function FilterBar({ value, onChange, hide = [], showRange = true, presets, leading, trailing }: {
  value: Filters; onChange: (f: Filters) => void; hide?: FilterKey[]; showRange?: boolean; presets?: string[]; leading?: ReactNode; trailing?: ReactNode;
}) {
  const { data: opts } = useOptions();
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });
  const shown = ALL.filter((k) => !hide.includes(k));

  const o = useMemo(() => {
    const projects = opts?.projects ?? [];
    const top = projects.filter((p) => !p.parentId);
    const pick = new Set(value.projectId.map(Number));
    const subs = projects.filter((p) => p.parentId && (!pick.size || pick.has(p.parentId)));
    const taskSrc = projects.filter((p) => !pick.size || pick.has(p.id) || (p.parentId && pick.has(p.parentId)));
    const topName = (id?: number | null) => top.find((t) => t.id === id)?.name;
    return {
      clients: (opts?.clients ?? []).map((c) => ({ value: String(c.id), label: c.name })),
      projects: top.map((p) => ({ value: String(p.id), label: p.name, icon: <ProjectDot color={p.color} /> })),
      subs: subs.map((p) => ({ value: String(p.id), label: p.name, icon: <ProjectDot color={p.color} />, hint: topName(p.parentId) })),
      teams: (opts?.teams ?? []).map((t) => ({ value: String(t.id), label: t.name })),
      users: (opts?.users ?? []).map((u) => ({ value: String(u.id), label: u.name })),
      tasks: taskSrc.flatMap((p) => p.tasks.map((t) => ({ value: String(t.id), label: t.title, hint: t.key, keywords: p.name }))).slice(0, 400),
      tags: (opts?.tags ?? []).map((t) => ({ value: t, label: t })),
    };
  }, [opts, value.projectId]);

  const statuses = STATUSES.map((st) => ({ value: st, label: STATUS_META[st].label }));
  const count = activeCount(value);

  return (
    <div className={s.filterBar}>
      {leading}
      {showRange && <DateRangePicker size="sm" value={value.range} onChange={(range) => set({ range })} presets={presets} />}
      {shown.includes("client") && <MultiChip icon={<Building2 size={13} />} label="Client" options={o.clients} value={value.clientId} onChange={(clientId) => set({ clientId })} />}
      {shown.includes("project") && <MultiChip icon={<Briefcase size={13} />} label="Project" options={o.projects} value={value.projectId} onChange={(projectId) => set({ projectId, subProjectId: [], taskId: [] })} />}
      {shown.includes("subProject") && <MultiChip icon={<FolderTree size={13} />} label="Sub-project" options={o.subs} value={value.subProjectId} onChange={(subProjectId) => set({ subProjectId })} />}
      {shown.includes("team") && <MultiChip icon={<Users size={13} />} label="Team" options={o.teams} value={value.teamId} onChange={(teamId) => set({ teamId })} />}
      {shown.includes("employee") && <MultiChip icon={<User size={13} />} label="Employee" options={o.users} value={value.userId} onChange={(userId) => set({ userId })} />}
      {shown.includes("task") && <MultiChip icon={<ListTodo size={13} />} label="Task" options={o.tasks} value={value.taskId} onChange={(taskId) => set({ taskId })} />}
      {shown.includes("billable") && (
        <SingleChip icon={<CircleDollarSign size={13} />} label="Billable" value={value.billable} onChange={(billable) => set({ billable })}
          options={[{ value: "true", label: "Billable" }, { value: "false", label: "Non-billable" }]} />
      )}
      {shown.includes("status") && <MultiChip icon={<CheckCircle2 size={13} />} label="Status" options={statuses} value={value.status} onChange={(status) => set({ status })} />}
      {shown.includes("tag") && o.tags.length > 0 && <SingleChip icon={<Tag size={13} />} label="Tag" options={o.tags} value={value.tag} onChange={(tag) => set({ tag })} />}
      {count > 0 && (
        <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={() => onChange({ ...emptyFilters(value.range) })}>
          Clear {count > 1 ? `(${count})` : ""}
        </Button>
      )}
      {trailing && <><div className="grow" />{trailing}</>}
    </div>
  );
}
