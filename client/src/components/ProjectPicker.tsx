import { useApp } from "../state";

export type Pick = { projectId: number | null; taskId: number | null };

// Project → Sub-project → Task cascade. The stored projectId is the deepest level chosen.
export function ProjectPicker({ value, onChange, compact }: { value: Pick; onChange: (v: Pick) => void; compact?: boolean }) {
  const { options } = useApp();
  const projects = options?.projects ?? [];
  const byId = new Map(projects.map((p) => [p.id, p]));
  const tops = projects.filter((p) => !p.parentId || !byId.has(p.parentId));
  const current = value.projectId ? byId.get(value.projectId) : undefined;
  const top = current && current.parentId && byId.has(current.parentId) ? byId.get(current.parentId)! : current;
  const subs = top ? projects.filter((p) => p.parentId === top.id) : [];
  const leaf = current;
  const allNames = new Map((options?.allProjects ?? []).map((p) => [p.id, p.name]));
  const topLabel = (p: (typeof projects)[number]) => (p.parentId && !byId.has(p.parentId) ? `${allNames.get(p.parentId) ?? ""} › ${p.name}` : p.name);

  return (
    <div className={compact ? "picker compact" : "picker"}>
      <label className="field">
        <span>Project</span>
        <select required value={top?.id ?? ""} onChange={(e) => onChange({ projectId: e.target.value ? Number(e.target.value) : null, taskId: null })}>
          <option value="">Select project…</option>
          {tops.map((p) => <option key={p.id} value={p.id}>{topLabel(p)}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Sub-project</span>
        <select disabled={!subs.length} value={current && current.id !== top?.id ? current.id : ""} onChange={(e) => onChange({ projectId: e.target.value ? Number(e.target.value) : top!.id, taskId: null })}>
          <option value="">{subs.length ? "Main project (no sub-project)" : "No sub-projects"}</option>
          {subs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Task</span>
        <select disabled={!leaf?.tasks.length} value={value.taskId ?? ""} onChange={(e) => onChange({ ...value, taskId: e.target.value ? Number(e.target.value) : null })}>
          <option value="">{leaf?.tasks.length ? "No specific task" : "No open tasks"}</option>
          {leaf?.tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
      </label>
    </div>
  );
}
