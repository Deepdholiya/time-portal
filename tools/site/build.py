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
idx = re.sub(r'<!-- ============ FINAL CTA ============ -->\n<section class="sec sec-last" id="access">.*?</section>', lambda _: "<!-- ============ FINAL CTA ============ -->\n" + final_cta(), idx, flags=re.S)

def sub1(old, new):
    global idx
    if new in idx: return
    assert old in idx, old[:60]
    idx = idx.replace(old, new, 1)

sub1('<section class="hero">\n  <div class="wrap hero-inner">\n',
     '<section class="hero">\n  <div class="orbits" aria-hidden="true"><i></i><i></i><i></i><span class="planet p1"></span><span class="planet p2"></span></div>\n  <div class="wrap hero-inner">\n    <a class="announce rise" href="product/#ai"><span class="pill pill-brand">New</span>Ask AI about your team\'s time <svg class="ico-s"><use href="#i-arrow"/></svg></a>\n')
heads = {
  '<h2>Find where the hours go, then fix it.</h2>': "Projects",
  '<h2>See what kept a project on budget.': "Budgets",
  '<h2>Works with how your team logs time.</h2>': "Logging",
  '<h2>Ask it like you\'d ask your PM.': "Ask AI",
  '<h2>How a week of time becomes a report.</h2>': "Reports",
  '<h2>Try it as anyone on the team.</h2>': "Live demo",
  '<h2>Pricing on request.</h2>': "Pricing",
}
for h, e in heads.items():
    sub1('reveal">\n      ' + h, f'reveal">\n      <span class="eyebrow">{e}</span>\n      ' + h)
sub1('<a class="link" href="#features">See project health', '<a class="link" href="product/#reports">See project health')
sub1('<a class="link" href="#faq">How AI is used', '<a class="link" href="product/#ai">How AI is used')
sub1('<a class="link" href="#features">See reports', '<a class="link" href="product/#reports">See reports')
sub1('<a class="who-item" href="#access"><span class="who-art a1">', '<a class="who-item" href="solutions/#leaders"><span class="who-art a1">')
sub1('<a class="who-item" href="#access"><span class="who-art a2">', '<a class="who-item" href="solutions/#managers"><span class="who-art a2">')
sub1('<a class="who-item" href="#access"><span class="who-art a3">', '<a class="who-item" href="solutions/#employees"><span class="who-art a3">')
sub1('<p>Two demo companies with four months of sample data. Sign in with one click.</p>', '<p>Two demo companies with four months of sample data. Sign in with one click.</p>\n      <a class="link" href="demo/">What to try in the demo <svg class="ico-s"><use href="#i-arrow"/></svg></a>')
sub1('<p>Every team is set up personally. Tell us about yours and we\'ll send a quote with your access.</p>', '<p>Every team is set up personally. Tell us about yours and we\'ll send a quote with your access.</p>\n      <a class="link" href="pricing/">Compare plans <svg class="ico-s"><use href="#i-arrow"/></svg></a>')
sub1('<a class="faq-ask" href="mailto:hello@orbit0.app">', '<a class="faq-ask" href="contact/">')
open(idx_path, "w").write(idx)

for slug, (title, desc, body) in PAGES.items():
    d = os.path.join(ROOT, slug); os.makedirs(d, exist_ok=True)
    open(os.path.join(d, "index.html"), "w").write(build("../", title, desc, body, sprite, final=(slug != "contact")))
print("built", ", ".join(PAGES))
