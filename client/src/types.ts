export type Permissions = { analytics: "none" | "own" | "all"; roadmap: "none" | "view"; export: "none" | "own" | "all"; manageProjects: "no" | "yes"; editOthersTime: "no" | "yes"; approveTimesheets: "no" | "yes"; managePeople: "no" | "yes" };
export type Me = { id: number; name: string; email: string; role: string; allProjects: boolean; teamId: number | null; team: { id: number; name: string } | null };
export type OptProject = { id: number; name: string; code: string | null; color: string; parentId: number | null; clientId: number | null; status: string; tasks: { id: number; title: string }[] };
export type Options = {
  projects: OptProject[];
  allProjects: { id: number; name: string; color: string; parentId: number | null; clientId: number | null }[];
  users: { id: number; name: string; teamId: number | null; role: string }[];
  teams: { id: number; name: string }[];
  clients: { id: number; name: string }[];
};
export type TimeEntry = {
  id: number; date: string; startTime: string | null; endTime: string | null; minutes: number; description: string; billable: boolean;
  running: boolean; startedAt: string | null; projectId: number; taskId: number | null;
  project: { id: number; name: string; color: string; parentId: number | null; parent: { id: number; name: string; color: string } | null };
  task: { id: number; title: string } | null;
  user: { id: number; name: string };
};
