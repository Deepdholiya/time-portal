import { useMemo } from "react";
import { FolderKanban } from "lucide-react";
import { Combobox } from "@/components/ui";
import { ProjectDot } from "@/components/app/icons";
import type { Options } from "@/lib/types";
import { optionPath, pickValue, projectTaskOptions, resolvePick } from "./time-utils";
import s from "./time.module.css";

export interface Pick { projectId: number | null; taskId: number | null }

/** One-step "Project › Sub-project · Task" picker in the style of Clockify's project selector. */
export function ProjectTaskPicker({ options, value, onChange, fallback, withTasks = true, placeholder = "Project", width = 380, disabled, autoOpenLabel, placeholderIcon }: {
  options: Options | undefined;
  value: Pick;
  onChange: (v: Pick) => void;
  /** Shown when the current project/task isn't in the options (e.g. a completed task). */
  fallback?: { color?: string | null; project?: string; task?: string | null };
  withTasks?: boolean;
  placeholder?: string;
  width?: number;
  disabled?: boolean;
  autoOpenLabel?: string;
  placeholderIcon?: React.ReactNode;
}) {
  const opts = useMemo(() => projectTaskOptions(options, withTasks), [options, withTasks]);
  const project = options?.projects.find((p) => p.id === value.projectId);
  const task = project?.tasks.find((t) => t.id === value.taskId);
  const color = project?.color ?? fallback?.color;
  const path = optionPath(options, value.projectId) || fallback?.project;
  const taskTitle = task?.title ?? (value.taskId ? fallback?.task : null);

  const trigger = (
    <button type="button" className={s.pickTrigger} disabled={disabled} aria-label={autoOpenLabel ?? "Choose project and task"}>
      {path ? (
        <>
          <ProjectDot color={color} />
          <span className={`ellipsis ${s.pickProject}`} style={{ color: color ?? undefined }}>{path}</span>
          {taskTitle && <span className="ellipsis muted">· {taskTitle}</span>}
        </>
      ) : (
        <>{placeholderIcon ?? <FolderKanban size={14} className="faint" />}<span className="faint">{placeholder}</span></>
      )}
    </button>
  );

  return (
    <Combobox
      options={opts}
      value={pickValue(value.projectId, value.taskId)}
      onChange={(v) => onChange(resolvePick(options, v))}
      trigger={trigger}
      width={width}
      searchPlaceholder="Search projects and tasks…"
      emptyText="No project or task matches"
    />
  );
}
