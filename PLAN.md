# Time Portal: v1 plan

Built from the project goal and `work_management_portal_detailed_requirement.docx`. v1 covers the parts Deep asked for first: manual time logging against projects and sub-projects, analytics by project and employee, and the project roadmap, with configurable role-based access. The rest of the requirement doc (emailed invites, attendance, leave, billing, Gantt dependencies, AI) is left for later phases.

## Stack
- Frontend: React 19 + Vite + TypeScript, React Router, Recharts, plain CSS.
- Backend: Node + Express + TypeScript (tsx), Prisma 6 ORM.
- Database: SQLite for local dev. Switching to Postgres is a one-line `provider` change in `schema.prisma` plus a `DATABASE_URL`.
- Auth: email + password (bcrypt), JWT in an HTTP-only cookie. All permission checks happen on the server.

## Data model
| Model | Key fields | Notes |
|---|---|---|
| User | name, email, passwordHash, role, teamId, title, weeklyCapacity, allProjects, active | role is ADMIN, MANAGER or EMPLOYEE |
| Team | name | users belong to one team |
| Client | name | optional owner of projects |
| Project | name, code, clientId, parentId, managerId, status, health, startDate, endDate, estimatedHours, color, description | `parentId` set means it is a sub-project |
| ProjectMember | projectId, userId | which employees may log time on a project when `allProjects` is off |
| Milestone | projectId, name, dueDate, done | shown on the roadmap |
| Task | projectId, title, assigneeId, status, estimatedHours, dueDate | optional on a time entry |
| TimeEntry | userId, projectId, taskId, date, startTime, endTime, minutes, description, billable | `projectId` is the project or sub-project the work was done on |
| RolePermission | role, feature, level | the editable access matrix |
| AuditLog | userId, action, entity, entityId, details | written on every change |

## Access model (editable by admins in Settings → Access)
| Feature | Levels | Default Admin / Manager / Employee |
|---|---|---|
| Analytics | none / own / all | all / all / all |
| Roadmap | none / view | view / view / view |
| Export reports | none / own / all | all / all / own |
| Manage projects | no / yes | yes / yes / no |
| Edit others' time | no / yes | yes / yes / no |
| Manage people | no / yes | yes / no / no |

Admins always keep full access so nobody can lock themselves out. Project access per user is "all projects" or a chosen list.

## Screens
1. Login
2. Dashboard: today and this week, recent entries, project mix
3. Time: running timer plus manual entry (Project → Sub-project → Task cascade, date, start/end or duration, description, billable), entries grouped by day with edit/delete
4. Timesheet: week grid of project/sub-project rows by day with totals
5. Projects: project tree with sub-projects, create/edit, members, milestones, tasks, hours vs estimate
6. Roadmap: timeline of projects, sub-projects and milestones by month/quarter/year with progress, status and today marker
7. Analytics: cascading filters (date, client, project, sub-project, team, employee, billable), KPIs, hours by project, by employee, over time, and a drill-down list of entries with descriptions; CSV export
8. People: users and teams, add user with role, team and project access
9. Settings: access matrix and audit log

## v1 additions

- **Timesheet approval**: `TimesheetPeriod` (per user per week: SUBMITTED, APPROVED, REJECTED). Submitted/approved weeks block edits and timer starts; reject requires a note and reopens the week.
- **Invitations**: `Invitation` with a one-time token link, 7-day expiry, resend and revoke. Accepting creates the account with the role, team and projects the admin picked.
- **New permission**: `approveTimesheets` (Admin and Manager by default).
