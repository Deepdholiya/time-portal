# Shared pieces for the Orbit0 site pages. Templates use {p} for the path back to the site root.
import re

LOGO_SVG = '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="3.4" fill="#fff"/><circle cx="10" cy="10" r="6.6" fill="none" stroke="#fff" stroke-width="1.5" stroke-dasharray="2.2 2.4"/></svg>'
FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Crect width='20' height='20' rx='5' fill='%23ff4c00'/%3E%3Ccircle cx='10' cy='10' r='3.4' fill='white'/%3E%3Ccircle cx='10' cy='10' r='6.6' fill='none' stroke='white' stroke-width='1.5' stroke-dasharray='2.2 2.4'/%3E%3C/svg%3E"

EXTRA_ICONS = '''  <symbol id="i-shield" viewBox="0 0 16 16"><path d="M8 1.8l5 2v4c0 3.1-2.1 5.4-5 6.4-2.9-1-5-3.3-5-6.4v-4z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M5.8 8.1l1.5 1.5 2.9-3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></symbol>
  <symbol id="i-lock" viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" stroke-width="1.4"/></symbol>
  <symbol id="i-users" viewBox="0 0 16 16"><circle cx="6" cy="5.5" r="2.4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M1.8 13.5c.5-2.4 2.2-3.6 4.2-3.6s3.7 1.2 4.2 3.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M10.6 3.4a2.3 2.3 0 0 1 0 4.4M12 9.9c1.1.4 1.9 1.6 2.2 3.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></symbol>
  <symbol id="i-key" viewBox="0 0 16 16"><circle cx="5.5" cy="10.5" r="3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M7.7 8.3L13.5 2.5M11.5 4.5l1.6 1.6M10 6l1.2 1.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></symbol>
  <symbol id="i-log" viewBox="0 0 16 16"><path d="M3 3.5h10M3 6.5h10M3 9.5h6M3 12.5h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></symbol>
  <symbol id="i-mail" viewBox="0 0 16 16"><rect x="2" y="3.5" width="12" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2.5 4.5L8 8.6l5.5-4.1" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></symbol>
  <symbol id="i-building" viewBox="0 0 16 16"><path d="M3 14V3.5L9 2v12M9 6h4v8M1.5 14h13M5 5.5h2M5 8h2M5 10.5h2M11 8.5v.01M11 11v.01" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></symbol>
  <symbol id="i-bolt" viewBox="0 0 16 16"><path d="M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></symbol>
  <symbol id="i-inbox" viewBox="0 0 16 16"><path d="M2.5 9.5l1.6-5.2a1.5 1.5 0 0 1 1.4-1.1h5a1.5 1.5 0 0 1 1.4 1.1l1.6 5.2v3a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M2.5 9.5h3l1 1.5h3l1-1.5h3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></symbol>
  <symbol id="i-search" viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.2 10.2l3.3 3.3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></symbol>
  <symbol id="i-moon" viewBox="0 0 16 16"><path d="M13 9.6A5.5 5.5 0 0 1 6.4 3a5.5 5.5 0 1 0 6.6 6.6z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></symbol>
  <symbol id="i-leave" viewBox="0 0 16 16"><path d="M2 13.5h12M4 13.5c0-4 1.8-7 4-9 2.2 2 4 5 4 9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 4.5v9" stroke="currentColor" stroke-width="1.4"/></symbol>
  <symbol id="i-receipt" viewBox="0 0 16 16"><path d="M3.5 2h9v12l-1.8-1.2L9 14l-1-1.2L7 14l-1.7-1.2L3.5 14z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M6 5.5h4M6 8h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></symbol>
'''

def icon(name, cls="ico"):
    return f'<svg class="{cls}"><use href="#i-{name}"/></svg>'

ARROW = '<svg class="ico-s"><use href="#i-arrow"/></svg>'
CHEV = '<svg class="ico-s"><use href="#i-chev"/></svg>'

def dd_item(href, ic, title, sub):
    return f'<a href="{href}"><span class="dd-ico">{icon(ic)}</span><span><b>{title}</b><small>{sub}</small></span></a>'

# Every product and solution page, in nav order: (slug, icon, title, one-line summary).
PRODUCTS = [
    ("time-tracking", "clock", "Time tracking", "Log a day in a minute"),
    ("timesheets", "grid", "Timesheets", "Table and calendar views"),
    ("leave", "leave", "Leave and expenses", "Requests, holidays, approvals"),
    ("projects", "task", "Projects and roadmap", "Plan work, drag to reschedule"),
    ("analytics", "chart", "Analytics and reports", "Budgets, workload, exports"),
    ("ai", "spark", "Ask AI", "Answers about your time"),
    ("admin", "users", "Admin and permissions", "Roles, companies, automations"),
]
ROLES = [
    ("leaders", "chart", "Leaders", "Utilisation, budgets, health"),
    ("project-managers", "task", "Project managers", "Plan and stay on track"),
    ("employees", "clock", "Employees", "Log time, get back to work"),
]
TEAMS = [
    ("agencies", "building", "Agencies", "Clients, retainers, reports"),
    ("design-studios", "spark", "Design studios", "Phases and creative work"),
    ("consultancies", "users", "Consultancies", "Billable time and utilisation"),
]
COMPANY = [
    ("about", "spark", "About", "Why we built Orbit0"),
    ("security", "shield", "Security", "How we protect your data"),
    ("contact", "mail", "Contact", "Talk to the team"),
]

def dd(key, label, inner):
    return (f'<div class="dd" data-dd><button class="dd-btn" type="button" aria-expanded="false" aria-controls="dd-{key}">{label} {CHEV}</button>'
            f'<div class="dd-menu" id="dd-{key}">{inner}</div></div>')

def nav():
    prod1 = "".join(dd_item("{p}product/" + s + "/", i, t, d) for s, i, t, d in PRODUCTS[:3])
    prod2 = "".join(dd_item("{p}product/" + s + "/", i, t, d) for s, i, t, d in PRODUCTS[3:])
    product = (f'<div class="dd-box dd-mega"><div class="dd-col"><span class="dd-h">Track time</span>{prod1}</div>'
               f'<div class="dd-col"><span class="dd-h">Plan and report</span>{prod2}</div>'
               f'<div class="dd-side"><span class="dd-h">Get to know Orbit0</span>'
               f'<a class="dd-card" href="{{p}}product/"><b>Product overview</b><small>Every feature on one page</small>{ARROW}</a>'
               f'<a class="dd-card" href="{{p}}demo/"><b>Live demo</b><small>Sample data, one-click sign in</small>{ARROW}</a>'
               f'<a class="dd-card" href="{{p}}security/"><b>Security</b><small>Sign-in, access and audit log</small>{ARROW}</a></div></div>')
    roles = "".join(dd_item("{p}solutions/" + s + "/", i, t, d) for s, i, t, d in ROLES)
    teams = "".join(dd_item("{p}solutions/" + s + "/", i, t, d) for s, i, t, d in TEAMS)
    solutions = (f'<div class="dd-box dd-two"><div class="dd-col"><span class="dd-h">By role</span>{roles}</div>'
                 f'<div class="dd-col"><span class="dd-h">By team</span>{teams}</div>'
                 f'<div class="dd-foot"><a class="link" href="{{p}}solutions/">All solutions {ARROW}</a></div></div>')
    company = ('<div class="dd-box dd-one"><div class="dd-col">' + "".join(dd_item("{p}" + s + "/", i, t, d) for s, i, t, d in COMPANY) + '</div></div>')

    def group(label, links):
        return f'<details class="mm-group"><summary>{label} {CHEV}</summary><div>' + "".join(f'<a href="{h}">{t}</a>' for h, t in links) + '</div></details>'
    mobile = (group("Product", [("{p}product/", "Overview")] + [("{p}product/" + s + "/", t) for s, i, t, d in PRODUCTS]) +
              group("Solutions", [("{p}solutions/", "All solutions")] + [("{p}solutions/" + s + "/", t) for s, i, t, d in ROLES + TEAMS]) +
              group("Company", [("{p}" + s + "/", t) for s, i, t, d in COMPANY]) +
              '<a class="mm-link" href="{p}pricing/">Pricing</a><a class="mm-link" href="{p}demo/">Live demo</a><a class="mm-link" data-link="signin" href="/login">Sign in</a>'
              '<a class="btn btn-brand btn-block" href="{p}request-access/">Request access</a>')
    return f'''<header class="nav" id="nav">
  <div class="wrap nav-inner">
    <a href="{{p}}./" class="logo" aria-label="Orbit0 home">
      <span class="logo-mark" aria-hidden="true">{LOGO_SVG}</span>
      <span class="logo-word">orbit0</span>
    </a>
    <nav class="nav-links" aria-label="Main">
      {dd("product", "Product", product)}
      {dd("solutions", "Solutions", solutions)}
      <a href="{{p}}pricing/">Pricing</a>
      <a href="{{p}}demo/">Live demo</a>
      {dd("company", "Company", company)}
    </nav>
    <div class="nav-actions">
      <a class="nav-login" data-link="signin" href="/login">Sign in</a>
      <a class="btn btn-outline btn-sm hide-sm" data-link="demo" data-role="admin" href="/login">Try the demo</a>
      <a class="btn btn-dark btn-sm" href="{{p}}request-access/">Request access</a>
      <button class="menu-btn" id="menuBtn" aria-label="Open menu" aria-expanded="false" aria-controls="mobileMenu"><span></span><span></span></button>
    </div>
  </div>
  <div class="mobile-menu" id="mobileMenu">{mobile}</div>
</header>'''

def footer():
    col = lambda title, links: f'<div><b>{title}</b>' + "".join(f'<a href="{h}">{t}</a>' for h, t in links) + "</div>"
    return f'''<footer class="foot">
  <div class="wrap foot-grid">
    <div class="foot-brand">
      <a href="{{p}}./" class="logo"><span class="logo-mark">{LOGO_SVG}</span><span class="logo-word">orbit0</span></a>
      <p class="muted">Time tracking, projects, leave and reports for agencies, studios and service teams.</p>
      <a class="btn btn-outline btn-sm" href="{{p}}request-access/">Request access</a>
    </div>
    {col("Product", [("{p}product/" + s + "/", t) for s, i, t, d in PRODUCTS])}
    {col("Solutions", [("{p}solutions/" + s + "/", t) for s, i, t, d in ROLES + TEAMS])}
    {col("Company", [("{p}about/", "About"), ("{p}pricing/", "Pricing"), ("{p}demo/", "Live demo"), ("{p}security/", "Security"), ("{p}contact/", "Contact"), ("/login", "Sign in")])}
  </div>
  <div class="wrap foot-bottom">
    <span class="muted">© 2026 Orbit0. All rights reserved.</span>
    <span class="muted">Made for teams that bill by the hour.</span>
  </div>
  <div class="wrap foot-word" aria-hidden="true">orbit0</div>
</footer>'''

def final_cta(title="Request access to Orbit0.", text="Tell us your work email. We set up your company and email you an invite and a quote."):
    return f'''<section class="sec sec-last" id="access">
  <div class="wrap">
    <div class="final reveal">
      <div class="final-l">
        <span class="eyebrow on-dark">Get started</span>
        <h2>{title}</h2>
        <p>{text}</p>
        <form class="access" action="{{p}}request-access/" method="get">
          <label class="sr" for="ctaEmail">Work email</label>
          <input id="ctaEmail" type="email" name="email" placeholder="you@company.com" autocomplete="email" required>
          <button class="btn btn-brand" type="submit">Request access</button>
        </form>
        <span class="xs fine">Pricing on request · Set up personally · No card needed</span>
      </div>
      <div class="final-r" aria-hidden="true">
        <div class="orbits sm"><i></i><i></i><i></i></div>
        <div class="mini-list"><span>Website redesign</span><span>Brand sprint</span><span>Mobile app · v2</span></div>
        <div class="mini-card">
          <div class="mc-h"><b>Website redesign · report</b><span class="pill pill-brand">On budget</span></div>
          <div class="mc-r"><span>Logged</span><span class="dots" data-n="20" data-on="18"></span><span class="r">184h</span></div>
          <div class="mc-r hi"><span>Billable</span><span class="dots brand" data-n="20" data-on="17"></span><span class="r">171h</span></div>
          <div class="mc-f"><strong>92%</strong><span class="xs muted">of budget used · 6 people · Excel ready</span></div>
        </div>
      </div>
    </div>
  </div>
</section>'''

def head(title, desc, p, sprite):
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<link rel="icon" href="{FAVICON}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400..700&family=Caveat:wght@600&display=swap">
<link rel="stylesheet" href="{p}styles.css">
</head>
<body>

{sprite}
'''

def page_hero(eyebrow, h1, sub, ctas):
    return f'''<section class="page-hero">
  <div class="orbits" aria-hidden="true"><i></i><i></i><i></i></div>
  <div class="wrap ph-inner">
    <span class="eyebrow rise">{eyebrow}</span>
    <h1 class="rise" style="--d:.05s">{h1}</h1>
    <p class="rise" style="--d:.1s">{sub}</p>
    <div class="hero-ctas rise" style="--d:.15s">{ctas}</div>
  </div>
</section>'''

def ctas_default(second="demo"):
    s = '<a class="btn btn-brand" href="{p}request-access/">Request access</a>'
    if second == "demo":
        s += '<a class="btn btn-outline" href="{p}demo/">' + icon("play") + 'Try the live demo</a>'
    return s

def build(p, title, desc, body, sprite, final=True, final_args=None):
    html = head(title, desc, p, sprite) + nav() + "\n\n<main id=\"top\">\n\n" + body + "\n\n" + (final_cta(**(final_args or {})) if final else "") + "\n\n</main>\n\n" + footer() + f'\n\n<script src="{p}main.js"></script>\n</body>\n</html>\n'
    return html.replace("{p}", p)

def ticks(items, grey=False):
    return '<ul class="ticks' + (" grey" if grey else "") + '">' + "".join(f'<li><svg><use href="#i-check"/></svg>{t}</li>' for t in items) + "</ul>"

def frow(id_, eyebrow, h2, p, items, visual, flip=False, link=None):
    l = f'<a class="link" href="{link[1]}">{link[0]} {ARROW}</a>' if link else ""
    return f'''<div class="frow{' flip' if flip else ''} reveal" id="{id_}">
  <div class="frow-t"><span class="eyebrow">{eyebrow}</span><h2>{h2}</h2><p>{p}</p>{ticks(items)}{l}</div>
  <div class="frow-v">{visual}</div>
</div>'''

def tiles(items, cols=3):
    out = f'<div class="tiles c{cols}">'
    for ic, b, t in items:
        out += f'<div class="tile reveal"><span class="tile-ico">{icon(ic)}</span><b>{b}</b><p>{t}</p></div>'
    return out + "</div>"

def sec(body, cls="", id_=None):
    i = f' id="{id_}"' if id_ else ""
    return f'<section class="sec {cls}"{i}>\n  <div class="wrap">\n{body}\n  </div>\n</section>'

def sec_head(h2, p="", eyebrow=None, center=False):
    e = f'<span class="eyebrow">{eyebrow}</span>' if eyebrow else ""
    return f'<div class="sec-head{" center" if center else ""} reveal">{e}<h2>{h2}</h2>' + (f"<p>{p}</p>" if p else "") + "</div>"

def faq(items, id_="faqAcc"):
    out = f'<div class="acc faq-acc" id="{id_}">'
    for i, (q, a) in enumerate(items):
        o = i == 0
        out += f'<div class="acc-item{" open" if o else ""}"><button class="acc-btn" type="button" aria-expanded="{"true" if o else "false"}"><span>{q}</span><svg class="ico-s pm"><use href="#i-plus"/></svg></button><div class="acc-body"><div><p>{a}</p></div></div></div>'
    return out + "</div>"
