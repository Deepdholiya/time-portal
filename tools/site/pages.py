from shared import *
from visuals import *
from detail import *

def P(p): return p  # readability

PAGES = {}

# ---------------- PRODUCT ----------------
jump = related(PRODUCTS, "product/", None)
product = page_hero("Product", "Everything about the work,<br><span class=\"soft\">next to the time.</span>",
  "Orbit0 brings time logging, projects, leave and reports into one workspace. One set of projects, people and permissions runs through all of it.",
  ctas_default()) + "\n" + sec(jump + "\n" + sec_head("A tour of Orbit0.", "Scroll through each part of the workspace. The screen on the right follows along.", eyebrow="Product tour") + scrolly([
  dict(id="time", short="Time", eyebrow="01 · Time tracking", title="Log a day in a minute.", icon="clock",
    text="Type a duration, pick the project and say what you did. The start fills itself from where your last entry ended, so nobody runs a timer all day.",
    items=["Start time fills from your last entry", "Overlaps and future dates are blocked", "Each day submits itself at your cutoff", "Tags, required where you need them"], visual=V_TIME, link=("Learn more about time tracking", "{p}product/time-tracking/")),
  dict(id="timesheets", short="Timesheets", eyebrow="02 · Timesheets", title="One week, two views.", icon="grid",
    text="See the same week as a table or a calendar, with leave and company holidays in place. Managers see the whole team and export it.",
    items=["Table and calendar views of the same time", "Leave, holidays, tasks and milestones as layers", "Team timesheets grouped any way you like", "Lock days a manager approved"], visual=V_SHEET, link=("Learn more about timesheets", "{p}product/timesheets/")),
  dict(id="projects", short="Roadmap", eyebrow="03 · Projects and roadmap", title="Plan the work where the hours land.", icon="task",
    text="Projects, sub-projects, tasks and milestones share one timeline. Drag a bar to reschedule and the dependent tasks move with it.",
    items=["Projects and sub-projects per client", "Tasks in list or board view, with dependencies", "Roadmap built from project dates and milestones", "A read-only status link for your client"], visual=V_ROAD, link=("Learn more about projects", "{p}product/projects/")),
  dict(id="reports", short="Analytics", eyebrow="04 · Analytics and reports", title="From a total down to the single entry.", icon="chart",
    text="Follow hours by project, sub-project, task and person against budget. Group a report eight ways and export it with totals.",
    items=["Budget and hour variance per project", "Alerts when a project is at risk", "Workload against each person's week", "Excel, PDF and CSV exports"], visual=V_BARS, link=("Learn more about analytics", "{p}product/analytics/")),
  dict(id="leave", short="Leave", eyebrow="05 · Leave and approvals", title="Leave and expenses in one inbox.", icon="leave",
    text="Leave and reimbursement requests land in one Approvals queue. Approved leave shows on the calendar and blocks those days for logging.",
    items=["Leave requests and company holidays", "Reimbursements with receipts", "One Approvals queue for managers", "Every change kept in the audit log"], visual=V_APPROVE, link=("Learn more about leave", "{p}product/leave/")),
  dict(id="ai", short="Ask AI", eyebrow="06 · Ask AI", title="Ask about your time in plain words.", icon="spark",
    text="Ask from the search bar and get an answer with the numbers behind it. AI also tidies descriptions, drafts tasks and summaries, and drafts client updates you review.",
    items=["Answers only with what your role can see", "Drafts tasks and project summaries", "Drafts client emails, sent only when you press send", "A copy of every email in the email log"], visual=V_AI, link=("Learn more about Ask AI", "{p}product/ai/")),
  dict(id="admin", short="Admin", eyebrow="07 · Admin", title="You decide who sees what.", icon="users",
    text="Start with Admin, Manager and Employee, add your own roles, and override a single person when you need to. Run more than one company from one login.",
    items=["Custom roles and per-person overrides", "Several companies, each with its own data and currency", "Brand colour per company", "Google or Microsoft sign-in per company"], visual=V_PERM, link=("Learn more about admin", "{p}product/admin/")),
])) + "\n" + sec(sec_head("And the small things<br><span class=\"soft\">that save the day.</span>", "Details your team will notice in the first week.") +
  tiles([("inbox","Inbox","Mentions, approvals and alerts in one list, so nothing waits on email."),
         ("task","My tasks","Everything assigned to you across projects, with time logged against each."),
         ("search","Search with ⌘K","Jump to any page, project or task, or ask AI, from one search bar."),
         ("chart","Workload","Logged and planned hours against each person's week."),
         ("building","Clients","Every project grouped under its client, with hours and billing."),
         ("moon","Dark mode","Easy on the eyes late in the day, with keyboard shortcuts throughout.")]))
PAGES["product"] = ("Product · Orbit0", "Time tracking, timesheets, projects, roadmap, analytics, leave, approvals and AI in one workspace.", product)

# ---------------- SOLUTIONS ----------------
sol = page_hero("Solutions", "Built for everyone<br><span class=\"soft\">who touches the hours.</span>",
  "Leaders see where the business stands, project managers keep work on track, and employees log the day and get back to it.",
  ctas_default()) + "\n" + sec(
  '<div class="role-tabs reveal"><a href="{p}solutions/leaders/">' + icon("chart","ico-s") + 'Leaders</a><a href="{p}solutions/project-managers/">' + icon("task","ico-s") + 'Project managers</a><a href="{p}solutions/employees/">' + icon("clock","ico-s") + 'Employees</a><a href="#teams">' + icon("building","ico-s") + 'Agencies and studios</a></div>' +
  scrolly([
  dict(id="leaders", short="Leaders", eyebrow="For leaders", title="Know where the business stands.", icon="chart",
    text="See utilisation, budgets and project health across every team and company you run, from numbers your team already logs.",
    items=["Utilisation and billable share by team", "Budget health and at-risk alerts", "Financials per project and client", "Each company's data kept separate"], visual=V_LOAD, link=("Orbit0 for leaders", "{p}solutions/leaders/")),
  dict(id="managers", short="Project managers", eyebrow="For project managers", title="Plan the work and know it's on track.", icon="task",
    text="Build the plan on a roadmap, assign tasks to people with room, and see the hours against the budget as they come in.",
    items=["Roadmap with milestones and dependencies", "Workload before you assign", "Approve leave and expenses in one queue", "Share a status link with the client"], visual=V_ROAD, link=("Orbit0 for project managers", "{p}solutions/project-managers/")),
  dict(id="employees", short="Employees", eyebrow="For employees", title="Log the day in a minute and get back to work.", icon="clock",
    text="Type a duration into the tracker or a timesheet cell. Your day submits itself, and leave and expenses are a short form away.",
    items=["Quick logging that fills the start time", "My tasks with time logged against each", "Leave and reimbursement requests", "Dark mode and keyboard shortcuts"], visual=V_TIME, link=("Orbit0 for employees", "{p}solutions/employees/"))])) + "\n" + sec(sec_head("Made for teams that bill<br><span class=\"soft\">by the project.</span>", "Orbit0 fits any team that sells its time and needs to know where it went.", eyebrow="Who uses it") +
  related(TEAMS, "solutions/", None) + tiles([("bolt","Dev shops","Tasks, dependencies and a roadmap next to the hours each sprint actually took."),
         ("grid","In-house teams","Show internal clients where the team's time goes, with exports leadership can read."),
         ("receipt","Service firms","Leave, holidays and reimbursements in the same place as the time.")]), id_="teams")
PAGES["solutions"] = ("Solutions · Orbit0", "Orbit0 for leaders, project managers and employees at agencies, studios and service teams.", sol)

# ---------------- PRICING ----------------
price_grid = '''<div class="price-grid reveal" data-w="plans">
  <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>
  <div class="plan plan-hi">
    <div class="plan-h"><b>Orbit0</b><span class="pill pill-brand">Everything included</span></div>
    <div class="plan-p">On request</div>
    <span class="xs muted">Quoted for your team size</span>
    <p>For agencies, studios and service teams that bill by the project.</p>
    ''' + ticks(["Time tracker, timesheets and calendar","Projects, sub-projects, tasks and roadmap","Analytics, workload and Excel, PDF, CSV exports","Leave, holidays, reimbursements and approvals","Roles, permissions, two-factor sign-in and audit log","AI helpers"], grey=True) + '''
    <a class="btn btn-brand btn-block" href="{p}request-access/">Request access</a>
    <span class="xs muted center-t">We reply by email with your quote</span>
  </div>
  <div class="plan">
    <div class="plan-h"><b>Several companies</b></div>
    <div class="plan-p">Custom</div>
    <span class="xs muted">One login across companies</span>
    <p>For groups that run more than one company and need each one kept separate.</p>
    ''' + ticks(["Separate data for each company","Brand colour per company","Google or Microsoft sign-in per company","Help moving your existing data"], grey=True) + '''
    <a class="btn btn-outline btn-block" href="{p}contact/">Talk to us</a>
    <span class="xs muted center-t">Set up with you</span>
  </div>
</div>'''
def cmp_row(name, a, b):
    m = lambda v: '<svg class="ico-s ok"><use href="#i-check"/></svg>' if v is True else (f'<span class="muted">{v}</span>' if v else '<span class="muted">—</span>')
    return f'<div class="cmp-r"><span>{name}</span><span>{m(a)}</span><span>{m(b)}</span></div>'
cmp = '<div class="cmp reveal" data-w="cmp"><div class="cmp-r cmp-h"><span></span><b>Orbit0</b><b>Several companies</b></div>' + "".join(cmp_row(*r) for r in [
  ("Time tracker and timesheets", True, True), ("Projects, tasks and roadmap", True, True), ("Analytics, workload and exports", True, True),
  ("Leave, reimbursements and approvals", True, True), ("Custom roles and overrides", True, True), ("Ask AI and drafting", True, True),
  ("Two-factor sign-in and audit log", True, True), ("Companies", "One", "Several"), ("Google or Microsoft sign-in", True, "Per company"),
  ("Help moving existing data", None, True)]) + "</div>"
pricing = page_hero("Pricing", "Pricing on request.", "Every team is set up personally. Tell us about yours and we'll reply with a quote and your access.",
  '<a class="btn btn-brand" href="{p}request-access/">Request access</a><a class="btn btn-outline" href="{p}contact/">' + icon("mail") + 'Talk to us</a>') + "\n" + sec(price_grid) + "\n" + sec(
  sec_head("What's in each plan.", "Every feature is in both. The second plan adds what groups of companies need.") + cmp) + "\n" + sec(
  sec_head("How getting started works.", eyebrow="Three steps", center=True) +
  '<ol class="hsteps reveal"><li><span class="n">1</span><b>Request access</b><p>Send your work email from any page. Add a note about your team if you like.</p></li><li><span class="n">2</span><b>We set you up</b><p>We create your company, set your currency and cutoff, and email you a quote.</p></li><li><span class="n">3</span><b>Invite your team</b><p>You get an admin invite, then invite people from the portal with their roles.</p></li></ol>') + "\n" + sec(
  '<div class="faq"><div class="faq-l reveal"><h2>Pricing questions.</h2><p class="muted">Anything else, ask us when you request access.</p><a class="link" href="{p}contact/">Contact us ' + ARROW + '</a></div>' +
  faq([("Why is pricing on request?", "We set up every team personally for now, and quote based on your team size and how many companies you run."),
       ("Is there a free trial?", "You can try the live demo with sample data straight away. Your own workspace is set up after you request access."),
       ("Do you charge per feature?", "No. Every feature is included in the plan."),
       ("Can we move our existing data?", "Yes. We help groups of companies move their existing data as part of setup."),
       ("Do I need a card to request access?", "No. Requesting access only needs your work email.")]) + "</div>")
PAGES["pricing"] = ("Pricing · Orbit0", "Orbit0 pricing is on request. Every team is set up personally.", pricing)

# ---------------- DEMO ----------------
demo_cards = '''<div class="demo-row reveal" data-w="demo">
  <a class="demo-card" data-link="demo" data-role="admin" href="/login"><span class="role">Admin</span><b>Set up the company</b><span class="xs muted">Roles, permissions, holidays, brand colour</span><span class="go">Sign in as Admin ''' + ARROW + '''</span></a>
  <a class="demo-card" data-link="demo" data-role="manager" href="/login"><span class="role">Manager</span><b>Run the projects</b><span class="xs muted">Roadmap, workload, approvals, team timesheets</span><span class="go">Sign in as Manager ''' + ARROW + '''</span></a>
  <a class="demo-card" data-link="demo" data-role="employee" href="/login"><span class="role">Employee</span><b>Log a day</b><span class="xs muted">Time tracker, timesheet, leave, reimbursements</span><span class="go">Sign in as Employee ''' + ARROW + '''</span></a>
</div>'''
def try_col(role, items):
    return f'<div class="try reveal" data-w="try"><span class="role">{role}</span>' + "".join(f'<div class="try-i"><span class="n">{i+1}</span><span>{t}</span></div>' for i, t in enumerate(items)) + "</div>"
demo = page_hero("Live demo", "Try Orbit0<br><span class=\"soft\">with sample data.</span>", "Two demo companies with about four months of time, projects and tasks. Pick a role and sign in with one click.",
  '<a class="btn btn-brand" data-link="demo" data-role="admin" href="/login">Sign in as Admin</a><a class="btn btn-outline" href="#roles-demo">Choose a role</a>') + "\n" + sec(
  '<div id="roles-demo"></div>' + demo_cards + '<p class="note reveal">' + icon("lock","ico-s") + ' The demo is shared with other visitors, so please don\'t enter anything private.</p>') + "\n" + sec(
  sec_head("Things to try.", "A few minutes in each role shows most of Orbit0.") +
  '<div class="tries">' + try_col("Admin", ["Open Admin, then Roles, and change what Managers can see", "Set your company's brand colour in Settings", "Read the audit log of recent changes", "Switch between the two companies"]) +
  try_col("Manager", ["Drag a project on the Roadmap", "Check Workload before assigning a task", "Approve a leave request in Approvals", "Export team timesheets to Excel"]) +
  try_col("Employee", ["Log time in the Time tracker", "Type a duration into a Timesheet cell", "Request a day of leave", "Ask AI how your week went"]) + "</div>") + "\n" + sec(
  sec_head("Two companies, kept apart.", "Sign in as Admin to switch between them and see that each company's data stays its own.") +
  '<div class="duo-co reveal" data-w="demo"><div class="co"><span class="logo-mark co-b">B</span><div><b>Bridge UX</b><span class="xs muted">Rupees · about four months of time · 5 projects · more than 70 tasks with dependencies, milestones, leave and pending approvals</span></div></div><div class="co"><span class="logo-mark co-n">N</span><div><b>Northwind Studio</b><span class="xs muted">US dollars · its own people, projects and time</span></div></div></div>')
PAGES["demo"] = ("Live demo · Orbit0", "Try Orbit0 with sample data as an Admin, Manager or Employee.", demo)

# ---------------- ABOUT ----------------
about = page_hero("About", "One place<br><span class=\"soft\">for every hour.</span>", "Orbit0 is a time tracking and project reporting workspace for teams that sell their time.",
  '<a class="btn btn-brand" href="{p}request-access/">Request access</a><a class="btn btn-outline" href="{p}contact/">' + icon("mail") + 'Talk to us</a>') + "\n" + sec(
  '<div class="story reveal"><div class="story-l"><span class="eyebrow">Why we built it</span><h2>Hours were the one thing<br><span class="soft">nobody could see.</span></h2></div><div class="story-r">'
  '<p>Teams that bill by the project live and die by their hours, yet most still log them in a spreadsheet on Friday afternoon, from memory. Leave sits in another tool, expenses in a third, and the budget overrun shows up on invoice day.</p>'
  '<p>We built Orbit0 so the hours go in quickly and every one of them leads somewhere: a project, a budget, a report, a client update. Time, projects, leave and approvals share one set of people and permissions, so the numbers agree with each other.</p>'
  '<p>The name comes from the idea at its centre. Every hour your team works orbits a project, and Orbit0 keeps them all in view.</p></div></div>') + "\n" + sec(
  sec_head("What we believe.", eyebrow="Principles") +
  tiles([("clock","Logging should take seconds","If it takes longer, people do it on Friday from memory. So we made a duration and a project enough."),
         ("chart","Every hour should lead somewhere","Time that never reaches a report or a budget is wasted twice. Orbit0 connects it all."),
         ("shield","You stay in control","Admins decide who sees what. AI drafts, and nothing is sent until a person presses send.")])) + "\n" + sec(
  '<div class="facts-mini reveal" data-w="facts"><div><strong data-count="8">0</strong><span>ways to group a report</span></div><div><strong class="cu" data-from="23:00">23:59</strong><span>days submit themselves</span></div><div><strong data-count="3">0</strong><span>roles to start, plus your own</span></div><div><strong>1</strong><span>login across companies</span></div></div>')
PAGES["about"] = ("About · Orbit0", "Why we built Orbit0, a time tracking and project reporting workspace for teams that sell their time.", about)

# ---------------- CONTACT ----------------
contact = page_hero("Contact", "Talk to us.", "Request access, ask a question, or ask for a walkthrough. A person reads every message.",
  '<a class="btn btn-brand" href="{p}request-access/">Request access</a><a class="btn btn-outline" href="mailto:hello@orbit0.app">' + icon("mail") + 'hello@orbit0.app</a>'
  '<button class="btn btn-outline copy-btn" type="button" data-copy="hello@orbit0.app" aria-label="Copy email address">' + icon("copy") + icon("check", "ico ok-ico") + '<span class="copy-l">Copy</span></button>') + "\n" + sec(
  '''<div class="contact-grid">
  <div class="c-card c-form reveal">
    <span class="eyebrow">Request access</span>
    <h2>Get Orbit0 for your team.</h2>
    <p class="muted">Tell us about your team on the request form. We set up your company and email you an invite and a quote.</p>
    <a class="btn btn-brand" href="{p}request-access/">Open the request form ''' + ARROW + '''</a>
    <span class="xs muted">Pricing on request · No card needed</span>
  </div>
  <div class="c-side">
    <a class="c-card c-link reveal" href="mailto:hello@orbit0.app"><span class="tile-ico">''' + icon("mail") + '''</span><div><b>Email us</b><span class="muted">hello@orbit0.app</span></div>''' + ARROW + '''</a>
    <a class="c-card c-link reveal" href="mailto:hello@orbit0.app?subject=Orbit0%20walkthrough"><span class="tile-ico">''' + icon("play") + '''</span><div><b>Ask for a walkthrough</b><span class="muted">We show Orbit0 with your team's setup in mind</span></div>''' + ARROW + '''</a>
    <a class="c-card c-link reveal" href="{p}demo/"><span class="tile-ico">''' + icon("bolt") + '''</span><div><b>Try the live demo</b><span class="muted">Sample data, one-click sign in</span></div>''' + ARROW + '''</a>
    <a class="c-card c-link reveal" data-link="signin" href="/login"><span class="tile-ico">''' + icon("key") + '''</span><div><b>Already a customer?</b><span class="muted">Sign in to your workspace</span></div>''' + ARROW + '''</a>
  </div>
</div>''') + "\n" + sec(
  sec_head("What happens next.", eyebrow="After you write", center=True) +
  '<ol class="hsteps reveal"><li><span class="n">1</span><b>We read it</b><p>A person on the Orbit0 team reads every request and question.</p></li><li><span class="n">2</span><b>We reply by email</b><p>With answers, or with a quote and the details we need to set you up.</p></li><li><span class="n">3</span><b>You get access</b><p>Your admin invite arrives once your company is ready.</p></li></ol>')
PAGES["contact"] = ("Contact · Orbit0", "Request access to Orbit0, ask a question or ask for a walkthrough.", contact)

# ---------------- SECURITY ----------------
security = page_hero("Security", "Your team's time,<br><span class=\"soft\">kept private.</span>", "Who can sign in, what they can see and what they changed. Here is how Orbit0 handles it.",
  '<a class="btn btn-brand" href="{p}request-access/">Request access</a><a class="btn btn-outline" href="{p}contact/">' + icon("mail") + 'Ask a security question</a>') + "\n" + sec(
  frow("signin", "Sign-in", "Only the right people get in.", "Passwords are stored hashed, sessions live in secure cookies, and repeated wrong passwords lock the account for a while.",
    ["Two-factor sign-in with an authenticator app", "Admins can be required to use two-factor", "Google or Microsoft sign-in per company", "Account locks for 15 minutes after 5 wrong passwords"], V_SECURE) +
  frow("access", "Access", "Everyone sees only what they should.", "Each role has its own levels for timesheets, analytics, financials and more. Admins can change a role or override a single person.",
    ["Admin, Manager, Employee and custom roles", "Per-person permission overrides", "AI answers only with what your role can see", "Client status links show one project, read-only"], V_PERM, flip=True)
) + "\n" + sec(sec_head("Built in from the start.", "The basics a team should expect from the tool that holds its hours.", eyebrow="Also included") +
  tiles([("building","Separate companies","Each company's people, projects, time and settings are kept apart, even when one login belongs to several."),
         ("log","Audit log","Admins see who changed what and when, including failed sign-ins."),
         ("mail","Email log","Every invitation, reset and client email is recorded. Temporary passwords are masked there."),
         ("lock","Forced password change","Invited people choose their own password before they see anything."),
         ("key","Password reset links","Reset links expire, and an admin can reset a password for someone."),
         ("shield","Lock approved days","Stop changes to days a manager has approved.")])) + "\n" + sec(
  '<div class="banner reveal"><span class="sq">?</span><p>Need a security questionnaire answered or have a question about where data is stored? <b>Email us</b> and we\'ll reply.</p><a class="btn btn-dark btn-sm" href="mailto:hello@orbit0.app?subject=Security%20question">Email us</a></div>')
PAGES["security"] = ("Security · Orbit0", "How Orbit0 protects your team's data: two-factor sign-in, roles and permissions, separate companies and an audit log.", security)

# ---------------- REQUEST ACCESS ----------------
def field(id_, label, ctl, hint=""):
    h = f'<span class="xs muted">{hint}</span>' if hint else ""
    return f'<div class="field"><label for="{id_}">{label}</label>{ctl}{h}</div>'
def select(id_, name, opts):
    return f'<select id="{id_}" name="{name}"><option value="">Choose one</option>' + "".join(f"<option>{o}</option>" for o in opts) + "</select>"
rq_form = ('<form class="rq-form c-card reveal" id="accessForm" novalidate>'
  + '<div class="rq-grid">'
  + field("rqEmail", 'Work email <em>*</em>', '<input id="rqEmail" type="email" name="email" placeholder="you@company.com" autocomplete="email" required>')
  + field("rqName", "Your name", '<input id="rqName" type="text" name="name" placeholder="Ana Rao" autocomplete="name">')
  + field("rqCompany", "Company", '<input id="rqCompany" type="text" name="company" placeholder="Northwind Studio" autocomplete="organization">')
  + field("rqSize", "Team size", select("rqSize", "teamSize", ["1–10", "11–25", "26–50", "51–200", "More than 200"]))
  + field("rqRole", "Your role", select("rqRole", "role", ["Founder or leader", "Project manager", "Operations or finance", "Team member", "Other"]))
  + field("rqCos", "Companies to run", select("rqCos", "companies", ["One company", "Two or more"]))
  + '</div>'
  + field("rqMsg", "Anything we should know?", '<textarea id="rqMsg" name="message" rows="4" placeholder="How you track time today, what you want to fix, when you want to start"></textarea>')
  + '<div class="rq-foot"><button class="btn btn-brand" type="submit">Request access</button><span class="xs muted">Only your work email is required. No card needed.</span></div>'
  + '<p class="form-msg" id="accessMsg" role="status" aria-live="polite"></p>'
  + '</form>')
rq_side = ('<div class="rq-side">'
  + '<div class="c-card reveal"><span class="eyebrow">What happens next</span>'
  + '<ol class="vsteps"><li><span class="n">1</span><div><b>We read your request</b><span class="muted">A person on the Orbit0 team reads every one.</span></div></li>'
  + '<li><span class="n">2</span><div><b>We email you a quote</b><span class="muted">Based on your team size and how many companies you run.</span></div></li>'
  + '<li><span class="n">3</span><div><b>You get an admin invite</b><span class="muted">Then invite your team from the portal with their roles.</span></div></li></ol></div>'
  + '<a class="c-card c-link reveal" href="{p}demo/"><span class="tile-ico">' + icon("play") + '</span><div><b>Try the live demo first</b><span class="muted">Sample data, one-click sign in</span></div>' + ARROW + '</a>'
  + '<a class="c-card c-link reveal" href="{p}contact/"><span class="tile-ico">' + icon("mail") + '</span><div><b>Have a question?</b><span class="muted">Talk to us before you request</span></div>' + ARROW + '</a>'
  + '</div>')
request = page_hero("Request access", "Get Orbit0<br><span class=\"soft\">for your team.</span>", "Tell us a little about your team. We set up your company personally and reply by email with a quote and your access.", "") \
  + "\n" + sec('<div class="rq">' + rq_form + rq_side + '</div>', "sec-tight")
PAGES["request-access"] = ("Request access · Orbit0", "Request access to Orbit0. Tell us about your team and we'll reply with a quote and your invite.", request)

for _slug, _d in PRODUCT_DATA.items():
    PAGES["product/" + _slug] = product_page(_slug, _d)
for _slug, _d in SOLUTION_DATA.items():
    PAGES["solutions/" + _slug] = solution_page(_slug, _d)
