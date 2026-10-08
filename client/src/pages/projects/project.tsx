import { Link, useParams, useSearchParams } from "react-router-dom";
import { Archive, Plus } from "lucide-react";
import { Badge, Button, ErrorState, Loading, Tabs } from "@/components/arc";
import { ProjectDot } from "@/components/app/icons";
import { Forbidden } from "@/components/app/page";
import { useShell } from "@/components/app/shell-context";
import { useApi } from "@/lib/hooks";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/session";
import { TaskView } from "../tasks/task-view";
import { HealthBadge } from "./health-badge";
import type { ProjectDetail } from "./lib";
import { Overview } from "./project-overview";
import { Activity, Files, Members, Milestones, Notes, SubProjects } from "./project-tabs";
import { ProjectTime } from "./project-time";
import { ProjectSettings } from "./project-settings";
import s from "./projects.module.css";

const TABS = ["overview", "tasks", "milestones", "subprojects", "time", "notes", "files", "activity", "members", "settings"] as const;
type Tab = (typeof TABS)[number];

/** Project workspace: overview, tasks (list/board), milestones, sub-projects, time, notes, files, activity, members, settings. */
export default function Project() {
  const { id } = useParams();
  const pid = Number(id);
  const { can } = useMe();
  const shell = useShell();
  const [params, setParams] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as Tab) : "overview";
  const q = useApi<ProjectDetail>(`/projects/${pid}`);
  const p = q.data;
  const manage = can("projects", "manage");

  if (q.error && !p) {
    if (q.error instanceof ApiError && q.error.status === 403) return <div className="page"><Forbidden what="this project" /></div>;
    return <div className="page"><ErrorState error={q.error} onRetry={q.reload} /></div>;
  }
  if (!p) return <div className="page"><Loading /></div>;

  const isMember = p.access === "member";
  const setTab = (t: string) => setParams(t === "overview" ? {} : { tab: t }, { replace: true });
  const newTask = () => shell.newTask({ projectId: p.id });

  let body;
  switch (tab) {
    case "tasks": body = <TaskView storageKey={`project:${p.id}`} fixedProjectId={p.id} newDefaults={{ projectId: p.id }} />; break;
    case "milestones": body = <div className="page-body"><Milestones p={p} manage={manage} onChanged={q.reload} /></div>; break;
    case "subprojects": body = <div className="page-body"><SubProjects p={p} manage={manage} onChanged={q.reload} /></div>; break;
    case "time": body = <div className="page-body"><ProjectTime p={p} /></div>; break;
    case "notes": body = <div className="page-body"><Notes p={p} canEdit={manage || isMember} /></div>; break;
    case "files": body = <div className="page-body"><Files p={p} /></div>; break;
    case "activity": body = <div className="page-body"><Activity p={p} /></div>; break;
    case "members": body = <div className="page-body"><Members p={p} manage={manage} onChanged={q.reload} /></div>; break;
    case "settings": body = <div className="page-body"><ProjectSettings p={p} onChanged={q.reload} /></div>; break;
    default: body = <div className="page-body"><Overview p={p} /></div>;
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1 className={s.header}>
          <Link to="/projects" className={s.crumb}>Projects</Link>
          <span className="faint">›</span>
          {p.parent && <><Link to={`/projects/${p.parent.id}`} className={s.crumb}>{p.parent.name}</Link><span className="faint">›</span></>}
          <ProjectDot color={p.color} />
          <span className="ellipsis">{p.name}</span>
        </h1>
        {!p.parentId && <HealthBadge p={p} />}
        {p.archived && <Badge size="sm" icon={<Archive size={11} />}>Archived</Badge>}
        <div className="grow" />
        {can("tasks", "create") && !p.archived && <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={newTask}>New task</Button>}
      </header>
      <div className={s.tabsBar}>
        <Tabs
          variant="underline" value={tab} onChange={setTab}
          items={[
            { value: "overview", label: "Overview" },
            { value: "tasks", label: "Tasks", count: p.stats ? p.stats.tasks.total - p.stats.tasks.done : undefined },
            { value: "milestones", label: "Milestones", count: p.milestones.length || undefined },
            { value: "subprojects", label: "Sub-projects", count: p.children.length || undefined, hidden: !!p.parentId },
            { value: "time", label: "Time" },
            { value: "notes", label: "Notes" },
            { value: "files", label: "Files" },
            { value: "activity", label: "Activity" },
            { value: "members", label: "Members", count: p.members.length || undefined },
            { value: "settings", label: "Settings", hidden: !manage && !can("clientEmail", "yes") },
          ]}
        />
      </div>
      {body}
    </div>
  );
}
