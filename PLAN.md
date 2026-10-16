# Time Portal v2 plan

Source: `work_management_portal_detailed_requirement.docx` (Work Management & Time Intelligence Platform).

## Hierarchy
Company → Client → Project → Sub-project → Milestone → Task → Sub-task → Time entry. Every record carries `companyId`, and every query is scoped to the session's current company.

## Roles and access
Admin, Manager and Employee per company. Seventeen features each have ordered levels (for example `analytics: none/own/all`, `financials: none/view`). Role defaults live in `server/src/permissions.ts`. Admins change them per company under Roles & permissions, and can override them per person. The server enforces every check; the client only hides what a user can't use.

## Screens (client/src/pages)
| Area | Screens |
|---|---|
| Sign-in | login, MFA, forced set-password, forgot/reset, public client status |
| Everyday | home, inbox, my tasks, time tracker, timesheet, calendar, leave |
| Work | tasks (list/board + side panel), projects, project detail, roadmap |
| Insights | analytics (drill-down, health, financials), reports + exports, workload, team timesheets, approvals |
| Admin | users & invites, roles & permissions, companies, company settings, integrations, automations, audit log, email log, account |

## Acceptance scenarios (requirements §12)
All 12 (AT-01 … AT-12) were run in a real browser with Playwright against seeded data:
invites and forced password change (01, 02), manual time and weekly totals (03), task timer linked through to analytics (04), monthly Excel with descriptions and project totals (05), kanban, comments and linked time (06), manager drill-down to entries (07), dependency impact and shifting dependents (08), AI client email with explicit send logged in the outbox (09), company isolation (10), audited time edits with old/new values (11), financial data denied to employees (12).

## Not verified without external services
- Google/Microsoft SSO (needs OAuth credentials).
- Real email delivery (needs `SMTP_URL`); emails are logged in the outbox instead.
- Claude-drafted emails (needs `ANTHROPIC_API_KEY`); a template draft is used instead.
- MFA login was built and its TOTP code checked against the RFC 6238 test vector, but no seeded user has MFA turned on.

## Next
- Saved views (shared filters) and a per-project timeline tab.
