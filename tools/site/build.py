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
base_syms = re.sub(r'  <symbol id="i-(shield|lock|users|key|log|mail|building|bolt|inbox|search|moon|leave|receipt)".*?</symbol>\n', "", base_syms)
sprite = '<svg width="0" height="0" style="position:absolute" aria-hidden="true">\n' + base_syms + EXTRA_ICONS + '</svg>\n'

# ---- home page: shared nav, footer and closing card, plus the design refresh ----
idx = idx[:m.start()] + sprite + idx[m.end():]
idx = re.sub(r'<header class="nav" id="nav">.*?</header>', lambda _: nav().replace("{p}", ""), idx, flags=re.S)
idx = re.sub(r'<footer class="foot">.*?</footer>', lambda _: footer().replace("{p}", ""), idx, flags=re.S)
idx = re.sub(r'<!-- ============ FINAL CTA ============ -->\n<section class="sec sec-last" id="access">.*?</section>', lambda _: "<!-- ============ FINAL CTA ============ -->\n" + final_cta().replace("{p}", ""), idx, flags=re.S)

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
# one voice: sentence case headings, brand orange for every Request access button
from chars import char
idx = idx.replace('<div class="orbits" aria-hidden="true"><i></i><i></i><i></i><span class="planet p1"></span><span class="planet p2"></span></div>',
                  char("astro", "hero-ch hc-l") + char("pointer", "hero-ch hc-r"))
idx = decorate(idx) if 'class="faq-ch' not in idx else idx.replace('<br><span class="soft">', '<br> <span class="soft">')
for old, new in [('<div class="ai reveal">', '<div class="ai reveal">' + char("typist", "peek pk-r")),
                 ('<div class="duo reveal">', '<div class="duo reveal">' + char("walker", "peek pk-l"))]:
    if new not in idx: idx = idx.replace(old, new, 1)
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
