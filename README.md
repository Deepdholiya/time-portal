# Time Portal

Work management and time intelligence portal: Clockify-style time tracking, Linear/Asana-style tasks and projects, a date- and week-wise roadmap, workload, analytics with drill-down, Excel/CSV/PDF reports, approvals, leave, AI client emails, multi-company tenancy and role-based access that admins can tune.

The UI follows Linear's look: a light sidebar with a workspace switcher, dense 36px rows, status circles and priority bars, a right-hand task panel, ⌘K command menu and dark mode (⇧D).

## Run it locally

Needs Node 20 or newer.

```bash
npm install          # root helper (concurrently)
npm run setup        # installs server + client, creates the SQLite DB and loads demo data
npm run dev          # API on :4000, web app on http://localhost:5173
```

Demo accounts (password `password123`):

| Email | Role | Notes |
|---|---|---|
| admin@example.com | Admin | Member of both companies |
| priya@example.com | Manager | Member of both companies |
| rohan@example.com | Manager | |
| neha@example.com | Employee | Also karan, sneha, vikram, ananya, arjun, meera |
| tom@example.com | Manager | Northwind Studio only |
| rahul@example.com | Invited employee | Temporary password `Kite-4821-Moss`, forced to choose a new one |

Two companies are seeded: **Bridge UX** (INR, about 4 months of time, 5 projects, ~85 tasks with dependencies, milestones, comments, leave and pending approvals) and **Northwind Studio** (USD) to show tenant isolation.

To run as a single server: `npm run build && npm start`, then open http://localhost:4000. Reset the demo data with `npm --prefix server run db:reset`.

### Optional settings (`server/.env`)

| Variable | Effect when set | Without it |
|---|---|---|
| `SMTP_URL`, `SMTP_FROM` | Invitations, resets, reports and client emails are delivered | Emails are only recorded in **Admin → Email log** (temporary passwords are masked there) |
| `ANTHROPIC_API_KEY` (+ `ANTHROPIC_MODEL`) | Client update emails and task summaries are drafted by Claude | A template draft built from the same facts |
| `APP_URL` | Links in emails point here | `http://localhost:5173` |

Google and Microsoft sign-in are configured per company under **Admin → Integrations** and need real OAuth client credentials.

## Structure

```
server/   Express 5 + Prisma (SQLite) API in TypeScript, run with tsx
  prisma/schema.prisma   data model (companies, memberships, sessions, tasks, time, timesheets, leave, audit…)
  prisma/seed.ts         demo data for two companies
  src/permissions.ts     features, levels and role defaults (per company, with per-user overrides)
  src/auth.ts, totp.ts   cookie sessions, lockout, MFA (TOTP), forced password change
  src/health.ts          project health, budget and hour variance
  src/jobs.ts            due-soon/overdue/milestone/at-risk alerts, timesheet reminders, scheduled reports
  src/routes/            auth, time, timesheets, tasks, projects, people, clients, companies, analytics,
                         reports, roadmap/calendar/leave, settings, notifications, ai, public
client/   React 19 + Vite
  src/components/arc/    official Arc components from uiarc.dev, vendored unchanged from its shadcn registry
  src/components/ui/     the app's component API, built on the Arc components (pages import from here)
  src/components/app/    app shell: sidebar, ⌘K, running timer, status/priority icons
  src/pages/             one folder per screen
```

## About the component library

Every control comes from [Arc](https://uiarc.dev/components). `client/src/components/arc/` holds the published Arc source, installed from its shadcn registry (`https://uiarc.dev/r/<name>.json`) and left unchanged so it can be refreshed the same way. `client/src/styles/arc-theme.css` sets Arc's design tokens to a Linear look: indigo accent, neutral greys, compact 28 to 36px controls, small radii and Inter.

Pages import from `client/src/components/ui/`, a thin layer that keeps the app's props and renders the Arc components: Button, Input, Textarea, Select, Combobox, MultiSelect, Checkbox, Switch, Badge, Avatar, Dialog, Drawer (the task peek panel), Popover, Tooltip, Tabs, SegmentedControl, Calendar, DatePicker, DateRangePicker, ToastStack, Skeleton, EmptyState, Alert and the ⌘K CommandPalette. A `Field` hands its label, hint and error to the Arc control inside it. Three pieces are composed rather than taken whole, because Arc's version draws its own trigger: menus use Arc's dropdown-menu styles on the same Radix primitive behind any icon button; Linear-style property chips and toolbar filters open a searchable list inside Arc's Popover; and chip date pickers open Arc's Calendar in that Popover. Kbd and the inline spinner are small app pieces, since Arc has none.

## Switching to Postgres

In `server/prisma/schema.prisma` change `provider = "sqlite"` to `"postgresql"`, set `DATABASE_URL` in `server/.env`, then run `npm --prefix server run db:reset`.

## Before production

- Set a strong `JWT_SECRET` and run with `NODE_ENV=production` (secure cookies).
- Configure SMTP so invitations reach people; until then the admin sees each temporary password once when inviting.
- Uploaded attachments are stored in `server/uploads/`; move them to object storage for multi-server deployments.
