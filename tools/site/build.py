# Builds the inner pages of the public site into client/public/home and refreshes the
# home page's shared nav, footer and closing card. Run: python3 tools/site/build.py
import re, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from shared import *
from pages import PAGES

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "client", "public", "home")
idx_path = os.path.join(ROOT, "index.html")
idx = open(idx_path).read()

# The sprite: the home page's icons plus the extra ones the inner pages use.
m = re.search(r'<svg width="0" height="0"[^>]*>\n(.*?)</svg>\n', idx, re.S)
base_syms = m.group(1)
base_syms = re.sub(r'  <symbol id="i-(shield|lock|users|key|log|mail|building|bolt|inbox|search|moon|leave|receipt|copy)".*?</symbol>\n', "", base_syms)
sprite = '<svg width="0" height="0" style="position:absolute" aria-hidden="true">\n' + base_syms + EXTRA_ICONS + '</svg>\n'

# ---- home page: shared nav, footer and closing card, plus the design refresh ----
idx = idx[:m.start()] + sprite + idx[m.end():]
idx = re.sub(r'<header class="nav" id="nav">.*?</header>', lambda _: nav().replace("{p}", ""), idx, flags=re.S)
idx = re.sub(r'<footer class="foot">.*?</footer>', lambda _: footer().replace("{p}", ""), idx, flags=re.S)
idx = re.sub(r'<!-- ============ FINAL CTA ============ -->\n<section class="sec sec-last" id="access">.*?</section>', lambda _: "<!-- ============ FINAL CTA ============ -->\n" + final_cta().replace("{p}", ""), idx, flags=re.S)

# ---- home page: the feature tour is a scrolly built from the same mock-ups as the inner pages ----
from visuals import V_BARS, V_ROAD, V_LOAD, V_APPROVE
tour = scrolly([
  dict(short="Budgets", eyebrow="Projects · Analytics", title="See where the budget goes", icon="funnel",
       text="Each project shows hours by sub-project, task and person against its budget. Find the part that's running hot.",
       items=["Hours by project and sub-project", "Budget and hour variance", "Alerts when a project is at risk"], visual=V_BARS, link=("See project health", "product/analytics/")),
  dict(short="Roadmap", eyebrow="Roadmap · Tasks", title="Plan the work on a roadmap", icon="split",
       text="Each project's dates make its bar, with milestones and dated tasks beneath. Drag a bar to reschedule.",
       items=["Projects, milestones and tasks", "Dependencies between tasks", "List and board views"], visual=V_ROAD, link=("See the roadmap", "product/projects/")),
  dict(short="Workload", eyebrow="Workload", title="Give the work to someone with room", icon="chart",
       text="Workload shows planned and logged hours against each person's week, with leave counted, so the next task goes to someone with space.",
       items=["Planned and logged hours per person", "Leave counted against capacity", "Utilisation per team"], visual=V_LOAD, link=("See workload", "product/analytics/")),
  dict(short="Approvals", eyebrow="Leave · Approvals", title="Approve leave and expenses in one place", icon="route",
       text="Leave and reimbursement requests land in one Approvals inbox and show on the timesheet calendar.",
       items=["Leave and company holidays", "Reimbursements with receipts", "Every change in the audit log"], visual=V_APPROVE, link=("See leave and approvals", "product/leave/")),
], tag="h3")
idx = re.sub(r'<!-- ============ FIND WHAT TO FIX ============ -->\n<section class="sec" id="features">.*?\n</section>', lambda _: """<!-- ============ FIND WHAT TO FIX ============ -->
<section class="sec" id="features">
  <div class="wrap">
    <div class="sec-head reveal">
      <span class="eyebrow">Projects</span>
      <h2>Find where the hours go, then fix it.</h2>
      <p>Follow every hour from the timesheet to the project, the client and the invoice. Scroll on and the screen follows along.</p>
    </div>
    """ + tour + """
  </div>
</section>""", idx, count=1, flags=re.S)

def sub1(old, new):
    global idx
    if new in idx: return
    assert old in idx, old[:60]
    idx = idx.replace(old, new, 1)

# (the hero's announcement pill is already in index.html)
heads = {
  '<h2>Find where the hours go, then fix it.</h2>': "Projects",
  '<h2>What kept a project': "Budgets",
  '<h2>Works with how your team logs time.</h2>': "Logging",
  '<h2>Ask it like<br>': "Ask AI",
  '<h2>How a week of time becomes a report.</h2>': "Reports",
  '<h2>Try it as anyone on the team.</h2>': "Live demo",
  '<h2>Pricing on request.</h2>': "Pricing",
}
for h, e in heads.items():
    sub1('reveal">\n      ' + h, f'reveal">\n      <span class="eyebrow">{e}</span>\n      ' + h)
sub1('<a class="link" href="#features">See project health', '<a class="link" href="product/analytics/">See project health')
sub1('<a class="link" href="#faq">How AI is used', '<a class="link" href="product/ai/">How AI is used')
sub1('<a class="link" href="#features">See reports', '<a class="link" href="product/analytics/">See reports')
sub1('<a class="who-item" href="#access"><span class="who-art a1">', '<a class="who-item" href="solutions/leaders/"><span class="who-art a1">')
sub1('<a class="who-item" href="#access"><span class="who-art a2">', '<a class="who-item" href="solutions/project-managers/"><span class="who-art a2">')
sub1('<a class="who-item" href="#access"><span class="who-art a3">', '<a class="who-item" href="solutions/employees/"><span class="who-art a3">')
sub1('<p>Two demo companies with four months of sample data. Sign in with one click.</p>', '<p>Two demo companies with four months of sample data. Sign in with one click.</p>\n      <a class="link" href="demo/">What to try in the demo <svg class="ico-s"><use href="#i-arrow"/></svg></a>')
sub1('<p>Every team is set up personally. Tell us about yours and we\'ll send a quote with your access.</p>', '<p>Every team is set up personally. Tell us about yours and we\'ll send a quote with your access.</p>\n      <a class="link" href="pricing/">Compare plans <svg class="ico-s"><use href="#i-arrow"/></svg></a>')
sub1('<a class="faq-ask" href="mailto:hello@orbit0.app">', '<a class="faq-ask" href="contact/">')
sub1('<a class="btn btn-outline btn-block" href="#access">Talk to us</a>', '<a class="btn btn-outline btn-block" href="contact/">Talk to us</a>')
# the hero's product window and the use-case carousel are generated, so they stay in step with the inner pages
from home_parts import hero_app, usecases
def block(start, end, html, anchor_re, before=False):
    global idx
    if start in idx:
        idx = re.sub(re.escape(start) + r".*?" + re.escape(end), lambda _: html, idx, count=1, flags=re.S)
    else:
        idx, n = re.subn(anchor_re, lambda m: html + ("\n\n" + m.group(0) if before else ""), idx, count=1, flags=re.S)
        assert n == 1, start
block("<!-- HERO APP -->", "<!-- /HERO APP -->", hero_app(), r'  <div class="wrap">\n    <div class="strip rise".*?</div>\n  </div>')
block("<!-- ============ USE CASES ============ -->", "<!-- /USE CASES -->", usecases(), r"<!-- ============ AI ============ -->", before=True)
idx = idx.replace('<br><span class="soft">', '<br> <span class="soft">')
# one voice: sentence case headings, brand orange for every Request access button
for old, new in [('data-a="Time Tracking and" data-b="Know where every">Time Tracking and<', 'data-a="Time tracking and" data-b="Know where every">Time tracking and<'),
                 ('data-a="Project Reports." data-b="hour goes.">Project Reports.<', 'data-a="project reports." data-b="hour goes.">project reports.<'),
                 ('<h2>Frequently Asked Questions.</h2>', '<h2>Frequently asked questions.</h2>'),
                 ('<h2>See what kept a project on budget.<br><span class="soft">The redesign finished under its hours.</span></h2>', '<h2>What kept a project<br><span class="soft">on budget.</span></h2>'),
                 ("<h2>Ask it like you'd ask your PM.<br><span class=\"soft\">Get answers in hours.</span></h2>", "<h2>Ask it like<br><span class=\"soft\">you'd ask your PM.</span></h2>"),
                 ('<a class="btn btn-dark btn-sm" href="request-access/"><svg', '<a class="btn btn-brand btn-sm" href="request-access/"><svg')]:
    idx = idx.replace(old, new)
for old, new in [('href="product/#ai"', 'href="product/ai/"'), ('href="product/#reports"', 'href="product/analytics/"'),
                 ('href="solutions/#leaders"', 'href="solutions/leaders/"'), ('href="solutions/#managers"', 'href="solutions/project-managers/"'),
                 ('href="solutions/#employees"', 'href="solutions/employees/"'), ('href="#access"', 'href="request-access/"')]:
    idx = idx.replace(old, new)
open(idx_path, "w").write(idx)

for slug, (title, desc, body) in PAGES.items():
    d = os.path.join(ROOT, slug); os.makedirs(d, exist_ok=True)
    p = "../" * (slug.count("/") + 1)
    open(os.path.join(d, "index.html"), "w").write(build(p, title, desc, body, sprite, final=slug not in ("contact", "request-access")))
print("built", len(PAGES), "pages")
