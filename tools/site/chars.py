# Small flat vector characters used as decoration across the site, drawn by hand for Orbit0.
# One style for all of them: no outlines, soft shading shapes, round heads with dot eyes,
# brand orange and neutrals for clothes. Every colour comes from a CSS custom property
# ("Characters" in styles.css), so they follow light and dark mode, and moving parts are
# wrapped in groups (.k-*) that styles.css animates. All share one 120 x 150 canvas, so
# the heads come out the same size wherever two characters stand side by side.

def _f(v):
    return f"{v:g}"

def face(cx, cy, hair="", skin="k-skin", brows=True, look=0):
    """A front-facing head centred on (cx, cy): ears, face, eyes, brows, cheeks and a small smile.
    `hair` is drawn in two parts: anything before '|' goes behind the face, the rest on top."""
    back, _, front = hair.partition("|")
    e = 4.6
    lx = look
    return (
        back
        + f'<ellipse class="{skin}" cx="{_f(cx-12)}" cy="{_f(cy+2.5)}" rx="2.6" ry="3.4"/>'
        + f'<ellipse class="{skin}" cx="{_f(cx+12)}" cy="{_f(cy+2.5)}" rx="2.6" ry="3.4"/>'
        + f'<ellipse class="{skin}" cx="{_f(cx)}" cy="{_f(cy)}" rx="12" ry="13"/>'
        + f'<path class="k-shade" d="M{_f(cx+3)} {_f(cy+12.6)}a12 13 0 0 0 9-12.6a12.5 13.5 0 0 1-9 12.6z"/>'
        + front
        + f'<g class="k-eyes"><circle class="k-ink" cx="{_f(cx-e+lx)}" cy="{_f(cy+1.6)}" r="1.55"/><circle class="k-ink" cx="{_f(cx+e+lx)}" cy="{_f(cy+1.6)}" r="1.55"/></g>'
        + (f'<path class="k-brow" d="M{_f(cx-e-2.2+lx)} {_f(cy-2.6)}q2.2-1.3 4.4 0M{_f(cx+e-2.2+lx)} {_f(cy-2.6)}q2.2-1.3 4.4 0"/>' if brows else "")
        + f'<circle class="k-cheek" cx="{_f(cx-7.6+lx)}" cy="{_f(cy+5.8)}" r="2.1"/><circle class="k-cheek" cx="{_f(cx+7.6+lx)}" cy="{_f(cy+5.8)}" r="2.1"/>'
        + f'<path class="k-mouth" d="M{_f(cx-3+lx)} {_f(cy+6.6)}q{_f(3)} 2.6 6 0"/>'
    )

def bob(cx, cy):
    # chin-length bob with a swept fringe
    back = (f'<path class="k-hair" d="M{_f(cx-14.5)} {_f(cy+9)}C{_f(cx-17)} {_f(cy-9)} {_f(cx-9)} {_f(cy-16.5)} {_f(cx)} {_f(cy-16.5)}'
            f'C{_f(cx+10)} {_f(cy-16.5)} {_f(cx+17)} {_f(cy-9)} {_f(cx+14.5)} {_f(cy+9)}q-.6 3.6-4.4 3.6h-20.2q-3.8 0-4.4-3.6z"/>')
    front = (f'<path class="k-hair" d="M{_f(cx-12.6)} {_f(cy-.5)}C{_f(cx-12.6)} {_f(cy-10)} {_f(cx-5)} {_f(cy-14)} {_f(cx+2)} {_f(cy-13.4)}'
             f'C{_f(cx+9)} {_f(cy-12.8)} {_f(cx+13)} {_f(cy-6.5)} {_f(cx+12.6)} {_f(cy+.5)}C{_f(cx+9)} {_f(cy-5)} {_f(cx+3)} {_f(cy-6.8)} {_f(cx-3.5)} {_f(cy-5.8)}'
             f'C{_f(cx-7.5)} {_f(cy-5.2)} {_f(cx-10.5)} {_f(cy-3.6)} {_f(cx-12.6)} {_f(cy-.5)}z"/>')
    return back + "|" + front

def crop(cx, cy):
    # short hair with a side part
    return "|" + (f'<path class="k-hair" d="M{_f(cx-12.8)} {_f(cy+1)}C{_f(cx-14.5)} {_f(cy-10)} {_f(cx-7)} {_f(cy-16.5)} {_f(cx+1)} {_f(cy-16)}'
                  f'C{_f(cx+10)} {_f(cy-15.6)} {_f(cx+15)} {_f(cy-9)} {_f(cx+12.8)} {_f(cy+1)}C{_f(cx+11.6)} {_f(cy-4)} {_f(cx+9)} {_f(cy-7)} {_f(cx+4)} {_f(cy-7.6)}'
                  f'C{_f(cx-1)} {_f(cy-8.2)} {_f(cx-5)} {_f(cy-6.5)} {_f(cx-8)} {_f(cy-8.6)}C{_f(cx-10)} {_f(cy-6.4)} {_f(cx-11.8)} {_f(cy-3)} {_f(cx-12.8)} {_f(cy+1)}z"/>')

def curls(cx, cy):
    # rounded curls on top
    pts = [(-10.5, -5, 6), (-6, -11, 6.6), (1, -13, 6.8), (7.6, -10.6, 6.2), (11.4, -4.6, 5.2), (-12.6, 0, 4), (12.8, 0.6, 3.8)]
    return "|" + "".join(f'<circle class="k-hair" cx="{_f(cx+x)}" cy="{_f(cy+y)}" r="{_f(r)}"/>' for x, y, r in pts)

def _svg(name, body, vb="0 0 120 150"):
    return f'<svg class="ch ch-{name}" viewBox="{vb}" aria-hidden="true" focusable="false">{body}</svg>'

def _shadow(cx, w=34, y=146):
    return f'<ellipse class="k-ground" cx="{_f(cx)}" cy="{y}" rx="{_f(w/2)}" ry="3"/>'

# ---------------------------------------------------------------- Maya: waves, holds a tablet
cx, cy = 54, 32
MAYA = _svg("maya", _shadow(cx, 40) + '<g class="k-float">'
  # legs and shoes
  + f'<path class="k-pants" d="M{cx-13} 86h26l-1.2 52h-9.6l-2.7-38h-.9l-2.7 38h-9.6z"/>'
  + f'<path class="k-shoe" d="M{cx-13.6} 137h10.6q1.6 0 1.6 2v1.6q0 2.4-2.4 2.4h-13q-2.2 0-2.2-2.2 0-3.8 5.4-3.8z"/>'
  + f'<path class="k-shoe" d="M{cx+13.6} 137h-10.6q-1.6 0-1.6 2v1.6q0 2.4 2.4 2.4h13q2.2 0 2.2-2.2 0-3.8-5.4-3.8z"/>'
  # neck and body
  + f'<rect class="k-skin-s" x="{cx-4.5}" y="{cy+9}" width="9" height="10" rx="3"/>'
  + f'<path class="k-top" d="M{cx-15} {cy+30}c0-8 3.6-12.6 10-12.6h10c6.4 0 10 4.6 10 12.6l-1.2 28h-27.6z"/>'
  + f'<path class="k-top-s" d="M{cx+9} {cy+18.2}c4 1.8 6 6 6 11.8l-1.2 28h-5z"/>'
  + f'<path class="k-skin" d="M{cx-4.6} {cy+17.4}l4.6 5.6 4.6-5.6z"/>'
  # arm holding the tablet (character's right, viewer's left)
  + f'<path class="s-top" d="M{cx-12} {cy+22}l-4.5 15"/>'
  + f'<path class="k-tablet" d="M{cx-9} {cy+30}l17-3.4 4 20-17 3.4z"/><path class="k-tablet-s" d="M{cx-6.8} {cy+32.2}l12.6-2.5 3 14.6-12.6 2.5z"/>'
  + f'<path class="k-brand" d="M{cx-4.6} {cy+35}l7.2-1.4.4 2-7.2 1.4zM{cx-4} {cy+38.6}l4.6-.9.4 2-4.6.9z"/>'
  + f'<path class="s-skin" d="M{cx-16.5} {cy+37}l7 6.5"/><circle class="k-skin" cx="{cx-8.5}" cy="{cy+44}" r="4"/>'
  # waving arm
  + f'<g class="k-wave"><path class="s-top" d="M{cx+12} {cy+22}l7.5-9"/><g class="k-hand"><path class="s-skin" d="M{cx+19.5} {cy+13}l2.5-12"/>'
  + f'<circle class="k-skin" cx="{cx+22.4}" cy="{cy-1.6}" r="4.4"/><path class="s-skin s-thin" d="M{cx+18.4} {cy+1}l-2.2-2.6"/></g></g>'
  + face(cx, cy, bob(cx, cy))
  + '</g>'
  + '<path class="k-spark s1" d="M100 26l1.8 4.2 4.2 1.8-4.2 1.8-1.8 4.2-1.8-4.2-4.2-1.8 4.2-1.8z"/>'
  + '<path class="k-spark s2" d="M14 58l1.1 2.6 2.6 1.1-2.6 1.1-1.1 2.6-1.1-2.6-2.6-1.1 2.6-1.1z"/>')

# ---------------------------------------------------------------- Dev: points at a chart that grows
cx, cy = 38, 32
DEV = _svg("dev", _shadow(64, 92)
  # the chart board
  + '<path class="k-easel" d="M80 104l-7 40M104 104l7 40M92 104v36"/>'
  + '<rect class="k-board" x="66" y="40" width="52" height="66" rx="5"/>'
  + '<path class="k-board-l" d="M73 96h38M73 82h38M73 68h38M73 54h38"/>'
  + '<g class="k-bars"><rect class="k-bar b1" x="76" y="78" width="8" height="18" rx="2"/><rect class="k-bar b2" x="88" y="66" width="8" height="30" rx="2"/>'
  + '<rect class="k-bar b3" x="100" y="50" width="8" height="46" rx="2"/></g>'
  + '<path class="k-trend" d="M77 72l12-12 10 4 9-14"/>'
  # the person
  + f'<path class="k-pants" d="M{cx-13} 86h26l-1.2 52h-9.6l-2.7-38h-.9l-2.7 38h-9.6z"/>'
  + f'<path class="k-shoe" d="M{cx-13.6} 137h10.6q1.6 0 1.6 2v1.6q0 2.4-2.4 2.4h-13q-2.2 0-2.2-2.2 0-3.8 5.4-3.8z"/>'
  + f'<path class="k-shoe" d="M{cx+13.6} 137h-10.6q-1.6 0-1.6 2v1.6q0 2.4 2.4 2.4h13q2.2 0 2.2-2.2 0-3.8-5.4-3.8z"/>'
  + f'<rect class="k-skin2-s" x="{cx-4.5}" y="{cy+9}" width="9" height="10" rx="3"/>'
  + f'<path class="k-knit" d="M{cx-15} {cy+30}c0-8 3.6-12.6 10-12.6h10c6.4 0 10 4.6 10 12.6l-1.2 28h-27.6z"/>'
  + f'<path class="k-knit-s" d="M{cx+9} {cy+18.2}c4 1.8 6 6 6 11.8l-1.2 28h-5z"/>'
  + f'<path class="k-collar" d="M{cx-6} {cy+17.6}q6 6 12 0"/>'
  + f'<path class="s-knit" d="M{cx-12} {cy+22}l-3.4 17 1.4 12"/><circle class="k-skin2" cx="{cx-13.8}" cy="{cy+55}" r="4"/>'
  + f'<g class="k-point"><path class="s-knit" d="M{cx+12} {cy+22}l12 7 10-5"/>'
  + f'<circle class="k-skin2" cx="{cx+37.5}" cy="{cy+22.4}" r="4"/><path class="s-skin2 s-thin" d="M{cx+39} {cy+21.6}l5.4-2.2"/></g>'
  + face(cx, cy, crop(cx, cy), skin="k-skin2", look=1.2)
  + '<path class="k-spark s1" d="M112 20l1.8 4.2 4.2 1.8-4.2 1.8-1.8 4.2-1.8-4.2-4.2-1.8 4.2-1.8z"/>')

# ---------------------------------------------------------------- Sam: types at a desk, a reply bubble above
cx, cy = 60, 50
SAM = _svg("sam", _shadow(60, 100)
  + '<g class="k-bubble"><rect class="k-board" x="74" y="6" width="34" height="18" rx="9"/><path class="k-board" d="M80 22l-3 7 9-6z"/>'
  + '<circle class="k-dot d1" cx="83" cy="15" r="2.2"/><circle class="k-dot d2" cx="91" cy="15" r="2.2"/><circle class="k-dot d3" cx="99" cy="15" r="2.2"/></g>'
  + f'<rect class="k-skin3-s" x="{cx-4.5}" y="{cy+9}" width="9" height="10" rx="3"/>'
  + f'<path class="k-pants" d="M{cx-17} 104c0-22 4-34.6 12-34.6h10c8 0 12 12.6 12 34.6z"/>'
  + f'<path class="k-top" d="M{cx-4.8} {cy+19.6}l4.8 6 4.8-6z"/>'
  + face(cx, cy, curls(cx, cy), skin="k-skin3", look=0)
  # forearms reach the keyboard behind the lid
  + f'<g class="k-type-l"><path class="s-pants" d="M{cx-14} {cy+28}q-9 6-9.6 15.4T{cx-14} {cy+51}"/><circle class="k-skin3" cx="{cx-14}" cy="{cy+51}" r="4"/></g>'
  + f'<g class="k-type-r"><path class="s-pants" d="M{cx+14} {cy+28}q9 6 9.6 15.4T{cx+14} {cy+51}"/><circle class="k-skin3" cx="{cx+14}" cy="{cy+51}" r="4"/></g>'
  + '<path class="k-lid" d="M41 74h38l-2.4 30H43.4z"/><circle class="k-brand" cx="60" cy="88" r="4.4"/><circle class="k-lid" cx="60" cy="88" r="1.8"/>'
  + '<rect class="k-desk" x="6" y="103" width="108" height="6" rx="3"/><path class="k-easel" d="M18 109v36M102 109v36"/>'
  # a mug with steam, and a small plant
  + '<path class="k-mug" d="M92 90h10v10q0 3-3 3h-4q-3 0-3-3z"/><path class="k-mug-h" d="M102 93h1.6q2.4 0 2.4 2.6t-2.4 2.6H102"/>'
  + '<path class="k-steam" d="M95 86q-2-3 0-5.5t0-5.5M99.5 86q-2-3 0-5.5t0-5.5"/>'
  + '<path class="k-pot" d="M15 92h14l-1.8 11h-10.4z"/><path class="k-leaf" d="M22 92q-9-4-8-14 8 2 8 14zM22 92q8-6 9-15-9 3-9 15zM22 92q-1-9 1-18 3 9-1 18z"/>')

# ---------------------------------------------------------------- Astro: the Orbit0 astronaut, floating
ASTRO = _svg("astro", '<g class="k-float">'
  + '<path class="k-tether" d="M28 84q-14 12-6 28t-8 30"/>'
  + '<rect class="k-pack" x="34" y="56" width="52" height="40" rx="10"/>'
  # legs
  + '<g class="k-legs"><rect class="k-suit" x="44" y="80" width="14" height="34" rx="7" transform="rotate(8 51 84)"/><rect class="k-suit" x="62" y="80" width="14" height="32" rx="7" transform="rotate(-14 69 84)"/>'
  + '<rect class="k-boot" x="42" y="108" width="16" height="10" rx="4.5" transform="rotate(8 51 84)"/><rect class="k-boot" x="61" y="104" width="16" height="10" rx="4.5" transform="rotate(-14 69 84)"/></g>'
  # body
  + '<rect class="k-suit" x="40" y="54" width="40" height="44" rx="14"/><path class="k-suit-s" d="M70 55.6c6 2.4 10 7.6 10 14.4v14c0 7-4 12.6-10 14.4z"/>'
  + '<rect class="k-panel" x="50" y="66" width="20" height="14" rx="3"/><circle class="k-brand" cx="55" cy="73" r="2.4"/><rect class="k-panel-l" x="60" y="70" width="6.5" height="2" rx="1"/><rect class="k-panel-l" x="60" y="74" width="4.5" height="2" rx="1"/>'
  + '<rect class="k-brand" x="40.6" y="86" width="38.8" height="4" rx="2"/>'
  # arms: one relaxed, one waving
  + '<path class="s-suit" d="M44 62q-10 6-12 20"/><circle class="k-glove" cx="32" cy="84" r="5"/>'
  + '<g class="k-wave a2"><path class="s-suit" d="M76 62q10-2 14-14"/><circle class="k-glove" cx="91" cy="45" r="5"/></g>'
  # helmet
  + '<circle class="k-suit" cx="60" cy="36" r="22"/><path class="k-suit-s" d="M66 15q16 6 16 21t-16 21q12-8 12-21t-12-21z"/>'
  + '<rect class="k-visor" x="44" y="25" width="32" height="24" rx="12"/>'
  + '<path class="k-visor-hi" d="M50 31q4-3 9-3"/><circle class="k-visor-dot" cx="69" cy="41" r="1.6"/>'
  + '<rect class="k-brand" x="57" y="12" width="6" height="5" rx="1.5"/>'
  + '</g>'
  + '<path class="k-spark s1" d="M14 22l1.8 4.2 4.2 1.8-4.2 1.8-1.8 4.2-1.8-4.2-4.2-1.8 4.2-1.8z"/>'
  + '<path class="k-spark s2" d="M104 96l1.2 2.8 2.8 1.2-2.8 1.2-1.2 2.8-1.2-2.8-2.8-1.2 2.8-1.2z"/>'
  + '<circle class="k-planet" cx="104" cy="22" r="6"/><path class="k-ring" d="M94 25q10-6 20-6"/>')

# ---------------------------------------------------------------- Ravi: walks along, swinging his arms (profile)
RAVI = _svg("ravi", _shadow(60, 36)
  + '<g class="k-bob">'
  + '<g class="k-leg-b"><path class="s-pants-d" d="M58 88v26l2 18"/><path class="k-shoe-d" d="M55.6 129h9.4q4.4 0 4.4 3.6v.4q0 2-2 2H55.6z"/></g>'
  + '<g class="k-arm-b"><path class="s-top-d" d="M58 56l-1 24"/><circle class="k-skin-s" cx="57" cy="83" r="4"/></g>'
  + '<rect class="k-skin-s" x="54" y="37" width="8" height="12" rx="3"/>'
  + '<path class="k-top" d="M46.5 62c0-9.4 4.6-14 11.5-14s11.5 4.6 11.5 14l.8 30H45.7z"/><path class="k-top-s" d="M62 48.6c5 1.6 7.5 6 7.5 13.4l.8 30h-5.4z"/>'
  + '<g class="k-leg-a"><path class="s-pants" d="M58 88v26l2 18"/><path class="k-shoe" d="M55.6 129h9.4q4.4 0 4.4 3.6v.4q0 2-2 2H55.6z"/></g>'
  + '<ellipse class="k-skin" cx="59" cy="28" rx="11.5" ry="12.5"/><path class="k-skin" d="M69.6 25.4q4.6 2.4 1.4 5z"/>'
  + '<path class="k-hair" d="M47.6 31C45 18.6 51.4 13.4 59.6 13.8c8 .4 12.4 4.8 12 10.6-4.4-.6-8.4-2.6-10.6-5.4-1 4.6-3.8 7.6-8 8.6l-.4 4.4z"/>'
  + '<ellipse class="k-skin" cx="53.4" cy="30.4" rx="2.4" ry="3.2"/>'
  + '<g class="k-eyes"><circle class="k-ink" cx="65.6" cy="28.4" r="1.5"/></g><path class="k-brow" d="M63.4 24.6q2.2-1.2 4.4 0"/>'
  + '<circle class="k-cheek" cx="64.4" cy="33" r="2"/><path class="k-mouth" d="M65.4 35.2q2.2 1.4 3.8-.2"/>'
  + '<g class="k-arm-a"><path class="s-top" d="M58 56l1 24"/><circle class="k-skin" cx="59" cy="83" r="4"/></g>'
  + '</g>')

CHARS = {"maya": MAYA, "dev": DEV, "sam": SAM, "astro": ASTRO, "ravi": RAVI}

def char(name, cls=""):
    return f'<span class="char {cls}" aria-hidden="true">{CHARS[name]}</span>'
