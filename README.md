# Bridge UX Time Portal

Employee time management portal: manual time logging against projects and sub-projects, a running timer, an editable weekly timesheet with submit and approval, analytics by project and employee, a project roadmap, invitations, and role-based access that admins can change.

See `PLAN.md` for the data model, access model and screen list.

## Run it locally

Needs Node 20 or newer.

```bash
npm install          # root helper (concurrently)
npm run setup        # installs server + client, creates the SQLite DB and loads demo data
npm run dev          # API on :4000, web app on http://localhost:5173
```

Demo accounts (password `password123`):

| Email | Role |
|---|---|
| admin@example.com | Admin |
| priya@example.com | Manager |
| neha@example.com | Employee |

Demo invite links (open after `npm run dev`): http://localhost:5173/invite/demo-rahul and /invite/demo-isha. /invite/demo-dev is expired on purpose.

To run as a single server: `npm run build && npm start`, then open http://localhost:4000.

Reset the demo data at any time with `npm --prefix server run db:reset`.

## Structure

```
server/   Express + Prisma API (TypeScript, run with tsx)
  prisma/schema.prisma   data model
  prisma/seed.ts         demo data (10 people, 5 projects, ~4 months of time)
  src/permissions.ts     roles, features, default access matrix
  src/routes/            auth, time, timesheets, analytics, projects, roadmap, people, settings
client/   React + Vite + TypeScript
  src/pages/             Dashboard, TimePage, Timesheet, Approvals, Projects, Roadmap, Analytics, People, Settings, Login, AcceptInvite
  src/components/        TimerBar, ProjectMenu, EntryForm, ProjectPicker, Modal, Icons
```

## Switching to Postgres

In `server/prisma/schema.prisma` change `provider = "sqlite"` to `"postgresql"`, set `DATABASE_URL` in `server/.env` to your database, then run `npm --prefix server run db:reset`.

## Before production

- Set a strong `JWT_SECRET` in `server/.env` and run with `NODE_ENV=production` (secure cookies).
- Invitations produce a link the admin copies and shares; there is no mail server yet. Plug one in at `POST /api/people/invitations` if you want emailed invites.

## Workflow

- Employees log time with the timer, the Time tracker list, or the weekly Timesheet grid, then press **Submit week**.
- Submitted and approved weeks are locked. Managers and admins (the `approveTimesheets` permission) approve or send weeks back with a note from **Approvals**; sent-back weeks unlock for editing.
- Admins change what each role can see and do under **Access & audit**, and can override access per person from **People**.

## Design references

The layout was shaped by app references pulled from Mobbin (time trackers, timesheet grids, approval queues, team/invite screens and roadmap timelines). Visual tokens and the chart palette live in `client/src/styles.css`.
