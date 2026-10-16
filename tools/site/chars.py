# Small vector characters used as decoration across the site. Each is an inline SVG
# coloured by CSS classes (see "Characters" in styles.css), so they follow light and dark mode.

def _svg(name, body, label=""):
    return f'<svg class="ch ch-{name}" viewBox="0 0 96 96" aria-hidden="true" focusable="false">{body}</svg>'

ASTRO = _svg("astro", '''
<path class="c-star s1" d="M12 16l1.6 3.6 3.6 1.6-3.6 1.6L12 26.4l-1.6-3.6L6.8 21.2l3.6-1.6z"/>
<path class="c-star s2" d="M84 66l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1z"/>
<g class="c-float">
  <ellipse class="c-ring" cx="48" cy="33" rx="30" ry="7" transform="rotate(-14 48 33)"/>
  <rect class="c-suit" x="34" y="46" width="28" height="26" rx="10"/>
  <rect class="c-suit" x="20" y="52" width="17" height="8" rx="4" transform="rotate(28 28 56)"/>
  <g class="c-wave"><rect class="c-suit" x="59" y="31" width="8" height="19" rx="4"/></g>
  <rect class="c-suit" x="37" y="67" width="9" height="14" rx="4.5"/>
  <rect class="c-suit" x="50" y="67" width="9" height="14" rx="4.5"/>
  <circle class="c-suit" cx="48" cy="31" r="17"/>
  <path class="c-visor" d="M36 30a12 10 0 0 1 24 0v3a12 9 0 0 1-24 0z"/>
  <ellipse class="c-shine" cx="42" cy="29" rx="3.2" ry="1.6"/>
  <circle class="c-brand" cx="54" cy="57" r="3"/>
  <rect class="c-brand" x="39" y="55" width="7" height="2.6" rx="1.3"/>
</g>''')

TYPIST = _svg("typist", '''
<g class="c-bubble">
  <rect class="c-suit" x="54" y="6" width="30" height="15" rx="7.5"/>
  <circle class="c-dot d1" cx="62" cy="13.5" r="2"/><circle class="c-dot d2" cx="69" cy="13.5" r="2"/><circle class="c-dot d3" cx="76" cy="13.5" r="2"/>
</g>
<ellipse class="c-shadow" cx="50" cy="89" rx="34" ry="3"/>
<rect class="c-seat" x="16" y="62" width="30" height="6" rx="3"/>
<path class="c-leg" d="M30 62h26v22"/>
<rect class="c-shoe" x="53" y="82" width="12" height="5" rx="2.5"/>
<rect class="c-brand" x="20" y="34" width="21" height="30" rx="9"/>
<circle class="c-skin" cx="31" cy="23" r="10"/>
<path class="c-hair" d="M21 23a10 10 0 0 1 20-2c-4-.4-8-2.4-10-5.4-2 3-6 5.8-10 7.4z"/>
<circle class="c-eye" cx="36.5" cy="24.5" r="1.4"/>
<path class="c-screen" d="M76 60l7-26h4l-7 26z"/>
<rect class="c-ink" x="44" y="58" width="38" height="4" rx="2"/>
<g class="c-type"><path class="c-arm" d="M34 42q8 12 20 14"/></g>''')

POINTER = _svg("pointer", '''
<path class="c-base" d="M46 84h40"/>
<rect class="c-bar b1" x="50" y="58" width="9" height="26" rx="2"/>
<rect class="c-bar b2" x="62" y="46" width="9" height="38" rx="2"/>
<rect class="c-bar b3" x="74" y="30" width="9" height="54" rx="2"/>
<path class="c-star s1" d="M84 14l1.4 3.2 3.2 1.4-3.2 1.4L84 23.2l-1.4-3.2-3.2-1.4 3.2-1.4z"/>
<path class="c-leg" d="M22 64v20M31 64v20"/>
<rect class="c-shirt" x="16" y="36" width="20" height="30" rx="9"/>
<circle class="c-skin" cx="26" cy="24" r="10"/>
<path class="c-hair" d="M16 24c0-6 4.5-10 10-10s10 4 10 10c-3 0-6-2-8-5-3 3-7 5-12 5z"/>
<circle class="c-eye" cx="30.5" cy="25" r="1.4"/>
<g class="c-point"><path class="c-arm" d="M31 44l16-11"/></g>''')

WALKER = _svg("walker", '''
<ellipse class="c-shadow" cx="44" cy="89" rx="30" ry="3"/>
<g class="c-bob">
  <g class="c-leg-a"><path class="c-leg" d="M25 60v24"/></g>
  <g class="c-leg-b"><path class="c-leg" d="M32 60v24"/></g>
  <rect class="c-brand" x="18" y="34" width="20" height="28" rx="9"/>
  <circle class="c-skin" cx="28" cy="22" r="10"/>
  <path class="c-hair" d="M18 22a10 10 0 0 1 20 0c-5 0-9-2-11-5-1 3-5 5-9 5z"/>
  <circle class="c-eye" cx="33" cy="23" r="1.4"/>
  <circle class="c-suit" cx="62" cy="42" r="17"/>
  <path class="c-tick" d="M62 28v3M62 53v3M48 42h3M73 42h3"/>
  <g class="c-hand-m"><path class="c-ink-s" d="M62 42V31"/></g>
  <g class="c-hand-h"><path class="c-ink-s" d="M62 42h7"/></g>
  <circle class="c-brand" cx="62" cy="42" r="2.4"/>
  <path class="c-arm" d="M34 42l12 2"/>
</g>''')

CHARS = {"astro": ASTRO, "typist": TYPIST, "pointer": POINTER, "walker": WALKER}

def char(name, cls=""):
    return f'<span class="char {cls}" aria-hidden="true">{CHARS[name]}</span>'
