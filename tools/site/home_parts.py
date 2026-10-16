# Generated parts of the home page: the hero's product window and the use-case carousel.
import re
from shared import icon, ARROW, LOGO_SVG, ROLES, TEAMS, ticks
from detail import SOLUTION_DATA

def hero_app():
    """A product window under the hero copy. It assembles itself on load (CSS), its numbers count up,
    and while it is on screen new time entries arrive in the feed (main.js, widget "app")."""
    side = "".join(f'<span class="hs-i{" on" if t == "Analytics" else ""}">{icon(i, "ico-s")}<span>{t}</span>{f"<em>{n}</em>" if n else ""}</span>'
                   for i, t, n in [("clock", "Time", ""), ("grid", "Timesheets", ""), ("task", "Projects", ""), ("chart", "Analytics", ""), ("inbox", "Approvals", "3")])
    kpis = "".join(f'<div class="kpi{" hot" if h else ""}"><span>{k}</span><b class="cu"{f" data-from={chr(34)}{fr}{chr(34)}" if fr else ""}>{v}</b><em>{e}</em></div>'
                   for k, v, e, h, fr in [("Logged this week", "186h", "+12% on last week", False, ""), ("Billable", "86%", "172h of 200h", False, ""),
                                          ("Utilisation", "81%", "Target 80%", False, ""), ("At risk", "1", "QA is over budget", True, "")])
    days = [("Mon", 78, 14), ("Tue", 70, 22), ("Wed", 88, 8), ("Thu", 64, 18), ("Fri", 52, 12)]  # Friday is today: its bar grows as entries arrive
    bars = "".join(f'<div class="hc-col{" today" if d == "Fri" else ""}" style="--a:{a}%;--b:{b}%"><span class="hc-stack"><i class="hc-b"></i><i class="hc-a"></i></span><em>{d}</em></div>' for d, a, b in days)
    feed = "".join(f'<div class="hf"><span class="av" style="--c:{c}">{av}</span><div><b>{p}</b><span>{t}</span></div><em class="num">{h}</em></div>'
                   for c, av, p, t, h in [("#f97316", "AR", "Website redesign", "Homepage QA · Ana R.", "1:30"),
                                          ("#6366f1", "KS", "Brand sprint", "Moodboard round 2 · Karan S.", "2:00"),
                                          ("#10b981", "MP", "Internal tools", "Sprint planning · Meera P.", "0:45")])
    teams = ["Agencies", "Design studios", "Consultancies", "Dev shops", "In-house teams", "Service firms", "Marketing teams", "Architecture firms"]
    row = "".join(f'<span class="mq-i plain">{t}</span>' for t in teams)
    return f'''<!-- HERO APP -->
  <div class="wrap hero-stage">
    <div class="happ" data-w="app" aria-hidden="true">
      <div class="happ-bar"><span class="happ-dots"><i></i><i></i><i></i></span><span class="happ-url">{icon("lock", "ico-s")}app.orbit0.io/analytics</span><span class="happ-live"><i class="live"></i>Live</span></div>
      <div class="happ-body">
        <div class="happ-side"><span class="happ-co"><span class="logo-mark sm">{LOGO_SVG}</span><b>Northwind</b></span>{side}</div>
        <div class="happ-main">
          <div class="happ-head"><b>Week 42</b><span class="muted hide-xs">Northwind Studio</span><span class="grow"></span><span class="chip">This week</span><span class="chip chip-brand">{icon("file", "ico-s")}Export</span></div>
          <div class="kpis">{kpis}</div>
          <div class="happ-grid">
            <div class="hbox hchart"><div class="hbox-h"><b>Hours by day</b><span class="hc-key"><i></i>Billable <i class="k2"></i>Internal</span></div><div class="hc-bars">{bars}</div></div>
            <div class="hbox hfeed"><div class="hbox-h"><b>Just logged</b><span class="hc-key"><i class="live"></i>Team</span></div><div class="hf-list">{feed}</div></div>
          </div>
        </div>
      </div>
    </div>
    <span class="hchip hc1" aria-hidden="true"><span class="fc-ico">{icon("check", "ico-s")}</span>Day submitted at 23:59</span>
    <span class="hchip hc2" aria-hidden="true"><span class="fc-ico">{icon("file", "ico-s")}</span>Week 42 report · Excel ready</span>
  </div>
  <div class="wrap"><div class="hero-built rise" style="--d:.5s"><span class="xs muted">Built for teams that bill by the hour</span><div class="mq" aria-hidden="true"><div class="mq-t">{row}{row}</div></div></div></div>
<!-- /HERO APP -->'''

def _plain(h):
    return re.sub(r"<[^>]+>", "", h.replace("<br>", " ")).replace("  ", " ").strip()

def usecases():
    """A scroll-snap carousel of the solution pages, with prev / next buttons and a progress bar."""
    cards = ""
    for n, (slug, ic, name, short) in enumerate(ROLES + TEAMS):
        d = SOLUTION_DATA[slug]
        fixes = [f for f, _ in d["fixes"][:3]]
        cards += (f'<a class="uc" href="solutions/{slug}/"><span class="uc-top"><span class="tile-ico">{icon(ic)}</span><span class="uc-n">{n + 1:02d}</span></span>'
                  f'<span class="eyebrow">{d["eyebrow"]}</span><b class="uc-h">{_plain(d["h1"])}</b><span class="uc-p">{d["sub"]}</span>'
                  + ticks(fixes) + f'<span class="go">See how {ARROW}</span></a>')
    return f'''<!-- ============ USE CASES ============ -->
<section class="sec" id="use-cases">
  <div class="wrap">
    <div class="uc-head reveal">
      <div><span class="eyebrow">Use cases</span><h2>Built for how<br> <span class="soft">your team works.</span></h2></div>
      <div class="uc-nav"><button class="uc-btn" type="button" data-uc="-1" aria-label="Previous use case">{icon("arrow", "ico-s")}</button><button class="uc-btn" type="button" data-uc="1" aria-label="Next use case">{icon("arrow", "ico-s")}</button></div>
    </div>
    <div class="uc-track reveal" data-carousel tabindex="0" aria-label="Use cases">{cards}</div>
    <div class="uc-prog" aria-hidden="true"><i></i></div>
  </div>
</section>
<!-- /USE CASES -->'''
