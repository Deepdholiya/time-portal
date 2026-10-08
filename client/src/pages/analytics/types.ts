export interface Group {
  key: string; id: number | string | null; name: string; color?: string; sub?: string; minutes: number; billableMinutes: number; entries: number;
  revenue?: number; cost?: number; estimateHours?: number | null;
}
export interface EmployeeGroup extends Group { capacityMinutes: number; utilization: number | null; daysWorked: number; workingDays: number; leaveDays: number }
export interface HealthRow {
  id: number; name: string; color: string; manager: string | null; status: string; estimatedHours: number | null; trackedHours: number; progress: number;
  health: "ON_TRACK" | "AT_RISK" | "DELAYED"; reasons: string[]; overdue: number; blocked: number; nextMilestone: { id: number; name: string; date: string } | null;
  budget?: number | null; budgetConsumed?: number | null; revenue?: number; cost?: number;
}
export interface AnalyticsData {
  level: "own" | "all"; financials: boolean;
  kpis: {
    totalMinutes: number; billableMinutes: number; nonBillableMinutes: number; entries: number; capacityMinutes: number; utilization: number | null; people: number;
    projects: number; tasks: Record<string, number>; overdueTasks: number; blockedTasks: number; tasksCompleted: number;
    revenue?: number; cost?: number; profit?: number; margin?: number;
  };
  byEmployee: EmployeeGroup[]; byProject: Group[]; bySubProject: Group[]; byTask: Group[]; byClient: Group[]; byTeam: Group[]; byDay: Group[]; byWeek: Group[];
  matrix: { projectId: number; project: string; color: string; userId: number; user: string; minutes: number }[];
  health: HealthRow[];
}
