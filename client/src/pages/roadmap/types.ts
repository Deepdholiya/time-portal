import type { Priority, TaskStatus } from "@/lib/types";

export interface Milestone { id: number; projectId: number; name: string; description: string | null; date: string; done: boolean }
export interface RProject {
  id: number; name: string; color: string; status: string; startDate: string | null; endDate: string | null;
  initiative: { id: number; name: string; color: string } | null; manager: { id: number; name: string } | null; client: string | null;
  health: "ON_TRACK" | "AT_RISK" | "DELAYED"; reasons: string[]; progress: number; access: string;
  children: { id: number; name: string; startDate: string | null; endDate: string | null; status: string; color: string }[];
  milestones: Milestone[];
}
export interface RTask {
  id: number; number: number; key: string; title: string; status: TaskStatus; priority: Priority; startDate: string | null; dueDate: string | null;
  projectId: number; milestoneId: number | null; assignee: { id: number; name: string } | null; conflict: boolean; overdue: boolean;
}
export interface RoadmapData {
  canEdit: boolean; projects: RProject[]; tasks: RTask[]; dependencies: { from: number; to: number; conflict: boolean }[];
  initiatives: { id: number; name: string; color: string }[];
}
export interface Impact { id: number; key: string; title: string; startDate: string | null; dueDate: string | null; reason: string }

/** One visible line of the Gantt chart. */
export type Row =
  | { kind: "initiative"; key: string; id: number | null; name: string; color: string; count: number; start: string | null; end: string | null; open: boolean }
  | { kind: "project"; key: string; project: RProject; open: boolean; depth: number }
  | { kind: "sub"; key: string; sub: RProject["children"][number]; parent: RProject; open: boolean; count: number }
  | { kind: "milestones"; key: string; project: RProject }
  | { kind: "task"; key: string; task: RTask; color: string; depth: number };
