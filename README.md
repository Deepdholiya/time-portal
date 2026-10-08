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
  src/components/arc/    Arc-style component kit (button, combobox, dialog, menu, date pickers, toast…)
  src/components/app/    app shell: sidebar, ⌘K, running timer, status/priority icons
  src/pages/             one folder per screen
```

## About the component library

The UI kit in `client/src/components/arc/` follows the structure of [uiarc.dev](https://uiarc.dev/components) (one folder per component, CSS modules, `motion` for animation). The build environment could not reach uiarc.dev, so these are look-alike implementations rather than the published Arc source. Their props were written for this app and may differ from Arc's. With network access to uiarc.dev, each component can be replaced via its shadcn registry (`npx shadcn add https://uiarc.dev/r/<name>.json`) and call sites adjusted where props differ.

## Switching to Postgres

In `server/prisma/schema.prisma` change `provider = "sqlite"` to `"postgresql"`, set `DATABASE_URL` in `server/.env`, then run `npm --prefix server run db:reset`.

## Before production

- Set a strong `JWT_SECRET` and run with `NODE_ENV=production` (secure cookies).
- Configure SMTP so invitations reach people; until then the admin sees each temporary password once when inviting.
- Uploaded attachments are stored in `server/uploads/`; move them to object storage for multi-server deployments.
