# One page per product feature and per solution, built from the same template.
from shared import *
from visuals import *

def marquee(items):
    row = "".join(f'<span class="mq-i">{icon(i, "ico-s")}{t}</span>' for i, t in items)
    return f'<div class="mq" aria-hidden="true"><div class="mq-t">{row}{row}</div></div>'

def hsteps(items):
    return '<ol class="hsteps reveal">' + "".join(f'<li><span class="n">{i+1}</span><b>{b}</b><p>{t}</p></li>' for i, (b, t) in enumerate(items)) + "</ol>"

def related(items, base, current):
    cards = "".join(f'<a class="rel-card reveal" href="{{p}}{base}{s}/"><span class="tile-ico">{icon(i)}</span><b>{t}</b><span class="muted">{d}</span><span class="go">Learn more {ARROW}</span></a>'
                    for s, i, t, d in items if s != current)
    return f'<div class="rel-grid">{cards}</div>'

def xlinks(label, items, base, current):
    """A slim row of pills to the sibling pages. It wraps on wide screens and scrolls sideways on phones."""
    pills = "".join(f'<a class="xl-pill" href="{{p}}{base}{s}/"><span class="xl-ico">{icon(i, "ico-s")}</span>{t}{ARROW}</a>'
                    for s, i, t, _ in items if s != current)
    return f'<nav class="xlinks reveal" aria-label="{label}"><span class="xl-label">{label}</span><div class="xl-row">{pills}</div></nav>'

def numbers(name, facts, slug):
    """Four product facts with count-up numbers and a bar that draws in under each one."""
    cells = ""
    for i, (v, unit, label) in enumerate(facts):
        val = f'<span data-count="{v}">0</span>' if isinstance(v, int) else v
        cells += (f'<div class="nf reveal" style="--i:{i}"><b class="nf-v">{val}<small>{unit}</small></b><span class="nf-l">{label}</span>'
                  f'<i class="nf-bar" aria-hidden="true"></i></div>')
    return (sec_head(name + " at a glance.", "A few facts about how it works, straight from the product.", eyebrow="In numbers")
            + f'<div class="nfacts">{cells}</div>' + xlinks("More of Orbit0", PRODUCTS, "product/", slug))

def setup(name, steps, slug):
    """A setup checklist for the team that ticks itself off, with a progress bar that fills as it goes."""
    pmap = {s: (i, t) for s, i, t, _ in PRODUCTS}
    lis = "".join(f'<li style="--i:{n}"><span class="su-box" aria-hidden="true">{icon("check", "ico-s")}</span><span class="su-t">{t}</span>'
                  f'<a class="su-chip" href="{{p}}product/{ps}/">{icon(pmap[ps][0], "ico-s")}{pmap[ps][1]}</a></li>' for n, (t, ps) in enumerate(steps))
    card = (f'<div class="su-card reveal" style="--n:{len(steps)}"><div class="su-top"><b>Getting started</b><span class="muted xs">{len(steps)} steps</span>'
            f'<span class="su-pct" data-su-pct>100%</span></div>'
            f'<div class="su-prog" aria-hidden="true"><i></i></div><ol class="su-list">{lis}</ol></div>')
    others = [x for x in ROLES + TEAMS if x[0] != slug]
    left = (f'<div class="su-l reveal"><span class="eyebrow">Getting started</span><h2>What {name.lower()}<br><span class="soft">set up first.</span></h2>'
            f'<p>The order most {name.lower()} follow on their first day in Orbit0. Each step links to the part of the product it uses.</p>'
            + xlinks("Orbit0 for other teams", others, "solutions/", slug) + '</div>')
    return f'<div class="su">{left}{card}</div>'

def faq_block(title, items):
    return ('<div class="faq"><div class="faq-l reveal"><h2>' + title + '</h2><p class="muted">Anything else, ask us when you request access.</p>'
            '<a class="link" href="{p}contact/">Contact us ' + ARROW + '</a></div>' + faq(items) + "</div>")

def product_page(slug, d):
    name = next(t for s, i, t, _ in PRODUCTS if s == slug)
    n = [s for s, *_ in PRODUCTS].index(slug)
    body = page_hero(name, d["h1"], d["sub"], ctas_default()) + "\n"
    chips = "".join(f'<span class="float-chip fc{n}" aria-hidden="true"><span class="fc-ico">{icon(ic, "ico-s")}</span>{t}</span>' for n, (ic, t) in enumerate(d.get("chips", [])))
    body += sec('<div class="hero-shot reveal" data-tilt>' + chips + d["visual"] + "</div>" + marquee([(i, b) for i, b, _ in d["tiles"]]), "sec-tight") + "\n"
    body += sec(sec_head("How it works.", eyebrow="Three steps", center=True) + hsteps(d["steps"])) + "\n"
    body += sec(sec_head(d["tiles_h"], d.get("tiles_p", ""), eyebrow="What you get") + tiles(d["tiles"])) + "\n"
    body += sec(frow(slug + "-more", d["more"][0], d["more"][1], d["more"][2], d["more"][3], d["more"][4], flip=True,
                     link=d["more"][5] if len(d["more"]) > 5 else None)) + "\n"
    body += sec(faq_block(name + " questions.", d["faq"])) + "\n"
    body += sec(numbers(name, PRODUCT_FACTS[slug], slug), "sec-nums")
    return (f"{name} · Orbit0", d["desc"], body)

def solution_page(slug, d):
    name = next(t for s, i, t, _ in ROLES + TEAMS if s == slug)
    n = [s for s, *_ in ROLES + TEAMS].index(slug)
    body = page_hero(d["eyebrow"], d["h1"], d["sub"], ctas_default()) + "\n"
    body += sec(marquee([("check", t) for r in d["rows"] for t in r[3]]), "sec-strip") + "\n"
    sw = ('<div class="pf-switch reveal" role="group" aria-label="Compare"><button type="button" aria-pressed="true" data-pf="0">Without Orbit0</button>'
          '<button type="button" aria-pressed="false" data-pf="1">With Orbit0</button><i aria-hidden="true"></i></div>')
    cards = "".join(f'<div class="tile pf-tile reveal"><div class="pf-a"><span class="tile-ico">{icon(ic)}</span><b>{b}</b><p>{t}</p></div>'
                    f'<div class="pf-b" aria-hidden="true"><span class="tile-ico ok">{icon("check")}</span><b>{fb}</b><p>{ft}</p></div></div>'
                    for (ic, b, t), (fb, ft) in zip(d["pains"], d["fixes"]))
    body += sec('<div class="pf-head">' + sec_head(d["pain_h"], eyebrow="What gets in the way") + sw + '</div><div class="tiles c3 pf" data-pf-box>' + cards + "</div>") + "\n"
    rows = scrolly([dict(id=f"{slug}-{n}", short=e, eyebrow=f"{n + 1:02d} · {e}", title=h, text=p, items=items, visual=v, link=(f"See {t.lower()}", "{p}product/" + ps + "/"))
                    for n, (e, h, p, items, v, ps, t) in enumerate(d["rows"])])
    body += sec(sec_head("How Orbit0 helps.", "Scroll through a week of work. The screen follows along.", eyebrow="For " + name.lower()) + rows) + "\n"
    body += sec(sec_head(d["week_h"], eyebrow="A typical week", center=True) + hsteps(d["week"])) + "\n"
    body += sec(faq_block("Questions from " + name.lower() + ".", d["faq"])) + "\n"
    body += sec(setup(name, SOLUTION_SETUP[slug], slug), "sec-setup")
    return (f"Orbit0 for {name.lower()}", d["desc"], body)

# ---------------- PRODUCTS ----------------
PRODUCT_DATA = {
"time-tracking": dict(
  chips=[('clock', 'Day submitted at 23:59'), ('check', '+1:15 logged on Website')],
  desc="Log time in Orbit0 by typing a duration. The start fills itself, overlaps are blocked and each day submits itself.",
  h1="Log a day<br><span class=\"soft\">in a minute.</span>",
  sub="Type a duration, pick the project and say what you did. The start time fills from where your last entry ended, so nobody runs a timer all day.",
  visual=V_TIME,
  steps=[("Type a duration", "Enter 1:30 or 90m. Orbit0 starts it where your last entry ended, or at your work start."),
         ("Pick the project", "Choose the project, sub-project or task and add a short description and tags."),
         ("Your day submits itself", "At your company's cutoff, 23:59 by default, the day goes in for approval.")],
  tiles_h="Fast for the team,<br><span class=\"soft\">clean for the reports.</span>",
  tiles=[("clock", "Start fills itself", "Each entry starts where the last one ended, or at your work start time."),
         ("shield", "Overlaps blocked", "Two entries can't cover the same minutes, and future dates are rejected."),
         ("task", "Log against tasks", "Pick a task and see the time add up against its estimate."),
         ("grid", "Tags where you need them", "Make tags required, and limit which teams see which tags."),
         ("bolt", "Daily cutoff", "Days submit themselves at the cutoff, so nobody forgets on Friday."),
         ("lock", "Approved days locked", "Once a manager approves a day, it can't be changed by accident.")],
  more=("Also in the tracker", "Edit straight from the timesheet.", "Prefer a grid? Type a duration into a timesheet cell and Orbit0 creates the entry for you, with the same checks.",
        ["Type into any cell of the week", "Same overlap and date checks", "Billable flag from the project", "Reminders skip people on leave"], V_SHEET, ("See timesheets", "{p}product/timesheets/")),
  faq=[("Is there a running timer?", "Orbit0 is built around typing a duration, which is faster for most teams. The start time fills itself from your last entry."),
       ("What happens at the cutoff?", "Each day submits itself at your company's cutoff time. The default is 23:59 and an admin can change it."),
       ("Can people log time in the future?", "No. Future dates are rejected, and entries can't overlap each other."),
       ("Can we require tags?", "Yes. Tags can be required and limited to the teams that use them.")]),
"timesheets": dict(
  chips=[('leave', 'Leave shown on Thursday'), ('receipt', 'Exported to Excel')],
  desc="Orbit0 timesheets show your week as a table or a calendar, with leave and holidays in place and team exports for managers.",
  h1="One week,<br><span class=\"soft\">two views.</span>",
  sub="See the same week as a table or a calendar, with leave and company holidays in place. Managers see the whole team and export it.",
  visual=V_CAL,
  steps=[("Log through the week", "Type into a cell or use the tracker. Both fill the same timesheet."),
         ("Check the calendar", "Leave, holidays, tasks and milestones show as layers you can turn on and off."),
         ("Managers approve and export", "Team timesheets group by project, person or client, and export with totals.")],
  tiles_h="Every hour of the week<br><span class=\"soft\">in one place.</span>",
  tiles=[("grid", "Table view", "Projects down the side, days across the top, totals at the end."),
         ("cal", "Calendar view", "Each entry as a block, so gaps and long days stand out."),
         ("leave", "Leave in place", "Approved leave and company holidays fill their days."),
         ("users", "Team timesheets", "Managers see everyone's week and group it the way they need."),
         ("receipt", "Exports with totals", "Excel, PDF or CSV, ready for payroll or the client."),
         ("lock", "Approval and locks", "Approve a day and lock it against later edits.")],
  more=("For managers", "The whole team's week, grouped your way.", "Group team time by project, person, client or task, see who hasn't logged, and export it with totals.",
        ["Group by project, person or client", "Totals per day, person and project", "Excel, PDF and CSV exports", "Reminders that skip people on leave"], V_SHEET, ("See analytics", "{p}product/analytics/")),
  faq=[("Can I switch between table and calendar?", "Yes. Both views show the same entries, and you can switch at any time."),
       ("Do holidays show on the timesheet?", "Yes. Company holidays and approved leave show on the days they cover."),
       ("Who can see team timesheets?", "Managers and admins by default. An admin can change this per role or per person."),
       ("What formats can we export?", "Excel, PDF and CSV, with totals.")]),
"leave": dict(
  chips=[('check', 'Leave approved'), ('cal', 'Added to the calendar')],
  desc="Request leave and reimbursements in Orbit0, approve them in one queue, and see approved leave on the calendar.",
  h1="Leave and expenses<br><span class=\"soft\">in one inbox.</span>",
  sub="Leave and reimbursement requests land in one Approvals queue. Approved leave shows on the calendar and blocks those days for logging.",
  visual=V_LEAVE,
  steps=[("Request it", "Pick vacation, sick, personal or other, the dates and a half day if needed."),
         ("Manager approves", "Requests wait in the manager's Approvals queue with everything they need."),
         ("It shows everywhere", "The days appear on calendars and timesheets, and reminders skip them.")],
  tiles_h="Time off and expenses,<br><span class=\"soft\">next to the time.</span>",
  tiles=[("leave", "Leave types", "Vacation, sick, personal and other, with half days."),
         ("cal", "Company holidays", "Set holidays once and they show on everyone's calendar."),
         ("receipt", "Reimbursements", "Claim an expense with a receipt and an amount."),
         ("inbox", "One Approvals queue", "Leave and reimbursements wait in the same list."),
         ("clock", "Reminders skip leave", "People on approved leave don't get timesheet reminders."),
         ("log", "Kept on record", "Every request and decision stays in the history.")],
  more=("For managers", "Approve in one place.", "Leave and reimbursement requests wait together in Approvals, with dates, amounts and receipts, so a decision takes seconds.",
        ["Approve or decline in one click", "Receipts attached to reimbursements", "Approved leave blocks logging", "Requests show in the inbox"], V_APPROVE),
  faq=[("Which leave types are there?", "Vacation, sick, personal, holiday and other. Half days are supported."),
       ("Can people log time on a day of leave?", "Approved leave blocks those days for logging."),
       ("Who approves requests?", "Managers and admins, from the Approvals queue."),
       ("Can we claim expenses?", "Yes. Reimbursement requests take an amount and a receipt and go to the same queue.")]),
"projects": dict(
  chips=[('bolt', '2 dependent tasks moved'), ('task', 'Milestone · Brand sprint')],
  desc="Plan projects, tasks and milestones on one roadmap in Orbit0, and drag to reschedule with dependencies.",
  h1="Plan the work<br><span class=\"soft\">where the hours land.</span>",
  sub="Projects, sub-projects, tasks and milestones share one timeline. Drag a bar to reschedule and the dependent tasks move with it.",
  visual=V_ROAD,
  steps=[("Set up the project", "Add the client, budget, rate and whether it's billable, then its sub-projects."),
         ("Break it into tasks", "Tasks get a priority, estimate, assignee, subtasks and dependencies."),
         ("Plan on the roadmap", "Drag bars to reschedule. Dependent tasks move with them.")],
  tiles_h="From the plan<br><span class=\"soft\">to the logged hour.</span>",
  tiles=[("building", "Clients and projects", "Every project grouped under its client, with sub-projects."),
         ("task", "Tasks with estimates", "Priority, estimate, subtasks and time logged against each."),
         ("grid", "List and board", "Work in a list, or drag cards across a board."),
         ("bolt", "Dependencies", "Link tasks so a change in one moves the ones after it."),
         ("receipt", "Billable and rates", "Mark a project billable and set its rate."),
         ("search", "Client status link", "Share a read-only status page for one project.")],
  more=("Tasks", "A board for the day to day.", "Switch any project to a board, drag tasks between statuses and see what blocks what. Time logged against a task shows on its card.",
        ["List and board views", "Priority, estimate and subtasks", "Status change alerts", "Overdue and due-soon alerts"], V_BOARD, ("See automations", "{p}product/admin/")),
  faq=[("Can a project have sub-projects?", "Yes. Sub-projects keep their own hours and roll up into the project."),
       ("What happens when I move a task?", "Tasks that depend on it move with it on the roadmap."),
       ("Can clients see progress?", "You can share a read-only status link for a single project."),
       ("Can we mark projects as billable?", "Yes, with a rate per project.")]),
"analytics": dict(
  chips=[('shield', 'QA is 31% over budget'), ('receipt', 'Report exported as PDF')],
  desc="Orbit0 analytics follow hours by project, task and person against budget, with workload and Excel, PDF and CSV exports.",
  h1="From a total<br><span class=\"soft\">down to the single entry.</span>",
  sub="Follow hours by project, sub-project, task and person against budget. Group a report eight ways and export it with totals.",
  visual=V_BARS,
  steps=[("Pick the scope", "A project, a client, a team or the whole company, for any date range."),
         ("Group and filter", "Group by project, person, task, client and more, and filter what you don't need."),
         ("Drill in and export", "Click a bar to see its entries, then export to Excel, PDF or CSV.")],
  tiles_h="Numbers you can<br><span class=\"soft\">act on this week.</span>",
  tiles=[("chart", "Budget against actual", "Hours and spend per project, against what you planned."),
         ("shield", "At-risk alerts", "See which projects are heading over budget before invoice day."),
         ("users", "Workload", "Logged and planned hours against each person's week."),
         ("grid", "Eight ways to group", "Project, person, task, client and more."),
         ("receipt", "Billable share", "Billable and non-billable time side by side."),
         ("log", "Excel, PDF, CSV", "Exports with totals, ready to send.")],
  more=("Workload", "Know who has room before you assign.", "See logged and planned hours against each person's week, with leave taken into account.",
        ["Planned and logged hours per person", "Leave counted against capacity", "Utilisation per team", "Open any person's entries"], V_LOAD),
  faq=[("Can I see an individual entry from a report?", "Yes. Click a bar or a row to see the entries behind it."),
       ("Which export formats are there?", "Excel, PDF and CSV, with totals."),
       ("Who can see financials?", "It depends on the role. An admin decides who sees rates, budgets and financials."),
       ("Does workload include leave?", "Yes. Approved leave is counted against each person's capacity.")]),
"ai": dict(
  chips=[('shield', 'Only what your role can see'), ('mail', 'Client update drafted')],
  desc="Ask Orbit0 about your team's time in plain words, and let AI draft tasks, summaries and client updates you review.",
  h1="Ask about your time<br><span class=\"soft\">in plain words.</span>",
  sub="Ask from the search bar and get an answer with the numbers behind it. AI also tidies descriptions and drafts tasks, summaries and client updates you review.",
  visual=V_AI,
  steps=[("Ask a question", "From the search bar, ask who has room, what went over, or how your week went."),
         ("Get the numbers", "The answer comes with the table it was based on."),
         ("Act on it", "Turn it into a task, a summary or a client update draft.")],
  tiles_h="Help that stays<br><span class=\"soft\">inside your permissions.</span>",
  tiles=[("spark", "Answers with numbers", "Every answer shows the data behind it."),
         ("shield", "Only what you can see", "AI answers with what your role is allowed to see."),
         ("task", "Drafts tasks", "Turn a note into tasks with estimates."),
         ("log", "Project summaries", "A short summary of where a project stands."),
         ("mail", "Client update drafts", "Drafted for you, sent only when you press send."),
         ("bolt", "Tidier descriptions", "Clean up a time entry's description in one click.")],
  more=("Drafting", "Client updates you review first.", "Orbit0 drafts a client update from the project's hours and tasks. You edit it, and nothing goes out until you press send.",
        ["Drafted from real hours and tasks", "You edit before it goes", "Sent only when you press send", "A copy kept in the email log"], V_DRAFT),
  faq=[("Can AI see data I can't?", "No. Answers only use what your role is allowed to see."),
       ("Does AI send emails on its own?", "No. It drafts, and nothing is sent until a person presses send."),
       ("Where do I ask?", "From the search bar, opened with ⌘K or Ctrl K."),
       ("Is there a record of sent emails?", "Yes. Every email is copied to the email log.")]),
"admin": dict(
  chips=[('key', 'Override saved for Meera'), ('log', 'Added to the audit log')],
  desc="Orbit0 admin: roles and permissions, per-person overrides, several companies from one login and automations.",
  h1="You decide<br><span class=\"soft\">who sees what.</span>",
  sub="Start with Admin, Manager and Employee, add your own roles, and override a single person when you need to. Run more than one company from one login.",
  visual=V_PERM,
  steps=[("Set up the company", "Currency, timezone, brand colour, work start and cutoff."),
         ("Set roles", "Start from Admin, Manager and Employee, then add your own."),
         ("Invite the team", "People get an invite and set their own password before they see anything.")],
  tiles_h="Control without<br><span class=\"soft\">the busywork.</span>",
  tiles=[("users", "Custom roles", "Choose levels for timesheets, analytics, financials and more."),
         ("key", "Per-person overrides", "Give one person more or less without a new role."),
         ("building", "Several companies", "One login, each company with its own data."),
         ("spark", "Brand per company", "Each company gets its own colour, currency and timezone."),
         ("bolt", "Automations", "Reminders and task alerts that run on their own."),
         ("log", "Audit and email logs", "See who changed what, and every email sent.")],
  more=("Automations", "Reminders that run themselves.", "Turn on timesheet reminders, overdue and due-soon alerts and status updates. Reminders skip people who are on approved leave.",
        ["Timesheet reminder", "Task overdue and due soon", "Task status changes", "Skips people on approved leave"], V_AUTO, ("See security", "{p}security/")),
  faq=[("Can we add our own roles?", "Yes. Start from the three built-in roles and add as many as you need."),
       ("Can one person have extra access?", "Yes. Override a single permission for one person without changing their role."),
       ("Can we run more than one company?", "Yes. One login can belong to several companies, each with its own data, currency and settings."),
       ("Can we use Google or Microsoft sign-in?", "Yes, set per company.")]),
}

# ---------------- SOLUTIONS ----------------
SOLUTION_DATA = {
"leaders": dict(fixes=[('Alerts come early', 'A project at risk is flagged while there is still time to act.'), ('Workload in one view', 'Planned and logged hours for every person, with leave counted.'), ('One login, every company', 'Switch companies in a click, each one kept separate.')],
  eyebrow="For leaders",
  desc="Orbit0 for leaders: utilisation, budgets and project health across every team and company.",
  h1="Know where<br><span class=\"soft\">the business stands.</span>",
  sub="See utilisation, budgets and project health across every team and company you run, from numbers your team already logs.",
  pain_h="Hard to see the business<br><span class=\"soft\">from spreadsheets.</span>",
  pains=[("chart", "Overruns found late", "A project goes over budget and nobody knows until invoice day."),
         ("users", "Utilisation is a guess", "Who is busy and who has room depends on who you ask."),
         ("building", "Several companies, several tools", "Each company tracks time its own way, so nothing adds up.")],
  rows=[("Utilisation", "See who is busy and who has room.", "Workload shows planned and logged hours against each person's week, with leave counted.", ["Utilisation by team", "Leave counted against capacity", "Billable and non-billable share"], V_LOAD, "analytics", "Analytics"),
        ("Budgets", "Catch overruns while you can still act.", "Hours against budget for every project, with alerts when a project is at risk.", ["Budget and hour variance", "At-risk alerts", "Drill into any number"], V_BARS, "analytics", "Analytics"),
        ("Companies", "Every company, one login.", "Switch between companies, each with its own data, currency and settings.", ["Data kept separate", "Own currency and timezone", "Brand colour per company"], V_COMPANY, "admin", "Admin")],
  week_h="How leaders use Orbit0.",
  week=[("Monday", "Check utilisation and which projects are at risk."), ("Midweek", "Ask AI where the hours went on a project."), ("Month end", "Export financials per client and project.")],
  faq=[("Do I need to log time myself?", "No. Leaders usually read reports and workload. Logging is for the people doing the work."),
       ("Can I see every company at once?", "You switch between companies. Each one keeps its own data."),
       ("Can I limit who sees financials?", "Yes. Financials are a permission you give per role or per person.")]),
"project-managers": dict(fixes=[('Plans move together', 'Drag a task and the ones that depend on it follow.'), ('Assign with room', "Check each person's workload before you hand out work."), ('One Approvals queue', 'Leave and expenses wait in one list, with receipts attached.')],
  eyebrow="For project managers",
  desc="Orbit0 for project managers: roadmap, tasks, workload and approvals next to the hours.",
  h1="Plan the work<br><span class=\"soft\">and know it's on track.</span>",
  sub="Build the plan on a roadmap, assign tasks to people with room, and see the hours against the budget as they come in.",
  pain_h="Plans drift<br><span class=\"soft\">when hours live elsewhere.</span>",
  pains=[("cal", "Reschedules break things", "Move one task and three others are now wrong."),
         ("users", "Assigning blind", "You find out someone was full after the deadline slips."),
         ("inbox", "Approvals in email", "Leave and expenses get lost between threads.")],
  rows=[("Roadmap", "Drag to reschedule, dependencies follow.", "Projects, tasks and milestones share one timeline.", ["Milestones and dependencies", "Undo a move", "Today marker"], V_ROAD, "projects", "Projects"),
        ("Tasks", "A board for the day to day.", "Priority, estimate and subtasks, with time logged against each task.", ["List and board", "Overdue and due-soon alerts", "Status change alerts"], V_BOARD, "projects", "Projects"),
        ("Approvals", "Leave and expenses in one queue.", "Approve in seconds, and approved leave shows on the calendar.", ["One queue", "Receipts attached", "Blocks logging on leave days"], V_APPROVE, "leave", "Leave")],
  week_h="How project managers use Orbit0.",
  week=[("Monday", "Check workload, then assign the week's tasks."), ("Every day", "Watch hours against the budget as they come in."), ("Friday", "Approve timesheets and send the client a status link.")],
  faq=[("Can clients see the plan?", "You can share a read-only status link for one project."),
       ("Can I see who has room?", "Yes. Workload shows planned and logged hours for each person, with leave counted."),
       ("Can I approve leave?", "Yes. Managers approve leave and reimbursements from the Approvals queue.")]),
"employees": dict(fixes=[('Log as you go', 'Type a duration and the day submits itself at the cutoff.'), ('Time on the task', 'Log straight against the task you worked on.'), ('Leave in a short form', 'Approved leave shows on the calendar for everyone.')],
  eyebrow="For employees",
  desc="Orbit0 for employees: log the day in a minute, see your tasks, and request leave.",
  h1="Log the day in a minute<br><span class=\"soft\">and get back to work.</span>",
  sub="Type a duration into the tracker or a timesheet cell. Your day submits itself, and leave and expenses are a short form away.",
  pain_h="Logging time<br><span class=\"soft\">shouldn't feel like work.</span>",
  pains=[("clock", "Friday from memory", "Filling in the week at the end of it is slow and never right."),
         ("task", "Tasks in one place, time in another", "You log against a project, but the task lives somewhere else."),
         ("leave", "Leave by email", "Requests get lost and nobody knows who is off.")],
  rows=[("Time tracker", "Type a duration, done.", "The start fills from your last entry and your day submits itself.", ["Start fills itself", "Overlaps blocked", "Submits at the cutoff"], V_TIME, "time-tracking", "Time tracking"),
        ("My week", "See your week as a calendar.", "Every entry as a block, with leave and holidays in place.", ["Table or calendar", "Leave and holidays shown", "Type into any cell"], V_CAL, "timesheets", "Timesheets"),
        ("Leave", "Ask for time off in a short form.", "Pick the type and dates, add a note, and your manager gets it.", ["Half days", "Shows on the calendar", "No reminders while you're away"], V_LEAVE, "leave", "Leave")],
  week_h="A week with Orbit0.",
  week=[("Each day", "Log time as you finish things, in a minute."), ("When you need it", "Request leave or claim an expense."), ("At the cutoff", "Your day submits itself.")],
  faq=[("Do I have to run a timer?", "No. You type a duration and the start fills itself."),
       ("What if I forget to submit?", "Each day submits itself at your company's cutoff."),
       ("Is there dark mode?", "Yes, and keyboard shortcuts throughout.")]),
"agencies": dict(fixes=[('Budgets per retainer', 'Hours tracked against each retainer as they come in.'), ('Reports in minutes', 'Hours per client, exported to Excel, PDF or CSV.'), ('See who is on what', "Workload shows each person's week and who has room.")],
  eyebrow="For agencies",
  desc="Orbit0 for agencies: track clients and retainers against budget and send the reports clients pay for.",
  h1="Every client,<br><span class=\"soft\">against its budget.</span>",
  sub="Track each client's projects and retainers against their budget, and send the report clients pay for.",
  pain_h="Agencies lose margin<br><span class=\"soft\">in the hours.</span>",
  pains=[("receipt", "Retainers overrun quietly", "Hours beyond the retainer go unbilled."),
         ("log", "Client reports take a day", "Pulling hours together for each client is manual."),
         ("users", "Who is on which client?", "Staffing across clients lives in someone's head.")],
  rows=[("Clients", "Every project under its client.", "Billable projects with rates and budgets, grouped by client.", ["Billable and rates", "Budgets per project", "Status link per project"], V_ROAD, "projects", "Projects"),
        ("Reports", "The report clients pay for.", "Hours by project, task and person, exported with totals.", ["Excel, PDF and CSV", "Eight ways to group", "Drill into any entry"], V_SHEET, "analytics", "Analytics"),
        ("Client updates", "Drafted from the real numbers.", "AI drafts a client update you review and send.", ["Drafted from hours and tasks", "Sent only when you press send", "Kept in the email log"], V_DRAFT, "ai", "Ask AI")],
  week_h="How agencies use Orbit0.",
  week=[("Every day", "The team logs time against client projects."), ("Weekly", "Check budgets and send client status links."), ("Month end", "Export hours per client for invoicing.")],
  faq=[("Can we track retainers?", "Yes. Set a budget on the retainer project and follow hours against it."),
       ("Can clients see progress?", "You can share a read-only status link for a single project."),
       ("Can we export for invoicing?", "Yes, to Excel, PDF or CSV with totals.")]),
"design-studios": dict(fixes=[('Quote from real numbers', 'Past phases show what the next one is likely to take.'), ('Each phase on its own line', 'Sub-projects keep discovery, design and QA apart.'), ('No timer needed', 'Type a duration and the start time fills itself.')],
  eyebrow="For design studios",
  desc="Orbit0 for design studios: see which phase takes the hours and plan the next project with that in mind.",
  h1="See which phase<br><span class=\"soft\">takes the hours.</span>",
  sub="Split projects into phases, see where the time goes, and quote the next one with real numbers.",
  pain_h="Creative work<br><span class=\"soft\">is hard to estimate.</span>",
  pains=[("chart", "Quotes from gut feel", "Without past numbers, every estimate is a guess."),
         ("grid", "Phases blur together", "Discovery, design and QA all land on one line."),
         ("clock", "Designers hate timers", "So time goes in late, or not at all.")],
  rows=[("Phases", "Hours by phase, against budget.", "Use sub-projects for discovery, design, build and QA, and see each one against its budget.", ["Sub-projects per phase", "Budget per phase", "Over-budget alerts"], V_BARS, "analytics", "Analytics"),
        ("Logging", "Quick for people who'd rather be designing.", "Type a duration, and the start fills itself.", ["No timer needed", "Submits itself", "Dark mode"], V_TIME, "time-tracking", "Time tracking"),
        ("Planning", "Plan the next project on the roadmap.", "Milestones and dependencies, with drag to reschedule.", ["Milestones", "Dependencies", "Workload before you assign"], V_ROAD, "projects", "Projects")],
  week_h="How studios use Orbit0.",
  week=[("During the project", "Designers log time against each phase."), ("At each milestone", "Check the phase against its budget."), ("Next quote", "Use past phases to estimate the new one.")],
  faq=[("Can we track phases separately?", "Yes. Use sub-projects for each phase and they roll up into the project."),
       ("Do designers need to run a timer?", "No. They type a duration and the start fills itself."),
       ("Can we see which phase overran?", "Yes. Analytics shows each phase against its budget.")]),
"consultancies": dict(fixes=[('Billable by default', 'Projects are marked billable, with a rate.'), ('Utilisation, always current', 'Per person and per team, from the hours already logged.'), ('Rates for the right people', 'Choose which roles see rates and financials.')],
  eyebrow="For consultancies",
  desc="Orbit0 for consultancies: billable and non-billable time, utilisation per person and team, and clean exports.",
  h1="Billable time<br><span class=\"soft\">and utilisation, clearly.</span>",
  sub="Log billable and non-billable time, see utilisation per person and team, and export it for invoicing.",
  pain_h="Utilisation is the business,<br><span class=\"soft\">but it's hard to see.</span>",
  pains=[("receipt", "Billable time slips", "Hours that should be billed get logged as internal."),
         ("users", "Utilisation by spreadsheet", "Every month someone rebuilds the same sheet."),
         ("shield", "Rates are sensitive", "Not everyone should see rates and financials.")],
  rows=[("Utilisation", "Per person and per team.", "Planned and logged hours against capacity, with billable share.", ["Billable and non-billable", "Leave counted", "Per team"], V_LOAD, "analytics", "Analytics"),
        ("Permissions", "Rates only for the right people.", "Choose who sees rates, budgets and financials, per role or per person.", ["Custom roles", "Per-person overrides", "Audit log"], V_PERM, "admin", "Admin"),
        ("Exports", "Ready for invoicing.", "Timesheets grouped by client and project, exported with totals.", ["Excel, PDF and CSV", "Group by client", "Approved days locked"], V_SHEET, "timesheets", "Timesheets")],
  week_h="How consultancies use Orbit0.",
  week=[("Every day", "Consultants log billable and internal time."), ("Weekly", "Managers check utilisation and approve days."), ("Month end", "Export billable hours per client.")],
  faq=[("Can we separate billable time?", "Yes. Projects are marked billable with a rate."),
       ("Can we hide rates from some people?", "Yes. Rates and financials are permissions per role or per person."),
       ("Can approved time be changed later?", "Approved days can be locked against edits.")]),
}

# ---------------- PRODUCT FACTS (the "at a glance" strip) ----------------
# (number or text, unit, label). Whole numbers count up when they scroll into view.
PRODUCT_FACTS = {
"time-tracking": [(1, " min", "to log a full day by typing durations"), ("23:59", "", "default daily cutoff, when the day submits itself"),
                  (0, "", "overlapping entries allowed on the same minutes"), (2, " ways", "to log: the tracker or any timesheet cell")],
"timesheets": [(2, " views", "of the same week: table and calendar"), (4, " ways", "to group team time: project, person, client or task"),
               (3, " formats", "for exports with totals: Excel, PDF and CSV"), (0, "", "reminders sent to people on approved leave")],
"leave": [(5, " types", "of leave, from vacation to sick days"), ("½", " day", "requests supported for every leave type"),
          (1, " queue", "for leave and reimbursements together"), (0, "", "hours loggable on a day of approved leave")],
"projects": [(4, " levels", "projects, sub-projects, tasks and milestones"), (2, " views", "for tasks: a list or a board"),
             (1, " timeline", "shared by every project, task and milestone"), (1, " link", "read-only status page to share per project")],
"analytics": [(8, " ways", "to group a report"), (3, " formats", "for exports: Excel, PDF and CSV"),
              (4, " scopes", "project, client, team or the whole company"), (1, " click", "from a bar on a chart to the entries behind it")],
"ai": [(0, "", "emails sent until a person presses send"), ("⌘K", "", "opens the search bar to ask a question"),
       (3, " drafts", "tasks, project summaries and client updates"), (1, " table", "of numbers behind every answer")],
"admin": [(3, " roles", "built in: Admin, Manager and Employee"), (1, " login", "for every company you run"),
          (4, " automations", "reminders, overdue, due-soon and status alerts"), (2, " logs", "an audit log and an email log")],
}

# ---------------- SOLUTION SETUP (the "set up first" checklist) ----------------
# (step, product slug it uses)
SOLUTION_SETUP = {
"leaders": [("Add each company with its currency and timezone", "admin"), ("Decide which roles see financials", "admin"),
            ("Set budgets on the projects that matter", "projects"), ("Watch the at-risk alerts", "analytics"), ("Open workload to see who has room", "analytics")],
"project-managers": [("Create the project and its sub-projects", "projects"), ("Add milestones and link dependent tasks", "projects"),
                     ("Check workload before you assign", "analytics"), ("Turn on overdue and due-soon alerts", "admin"), ("Share a status link with the client", "projects")],
"employees": [("Accept the invite and set your password", "admin"), ("Type your first duration", "time-tracking"),
              ("Switch your week to the calendar view", "timesheets"), ("Request a day off", "leave"), ("Let the day submit itself at the cutoff", "time-tracking")],
"agencies": [("Add your clients and their projects", "projects"), ("Mark client work billable, with a rate", "projects"),
             ("Set a budget on each retainer", "projects"), ("Group the month's report by client", "analytics"), ("Draft the first client update", "ai")],
"design-studios": [("Add a sub-project for each phase", "projects"), ("Give every phase its own budget", "projects"),
                   ("Invite the designers, no timer to run", "time-tracking"), ("Plan milestones on the roadmap", "projects"), ("Compare each phase against its budget", "analytics")],
"consultancies": [("Mark client projects billable, with rates", "projects"), ("Create a role that hides rates", "admin"),
                  ("Override access for one person", "admin"), ("Check utilisation per team", "analytics"), ("Export billable hours per client", "timesheets")],
}
