/* Orbit0 marketing site. Plain JS, no build step. */
(function () {
  "use strict";

  // Where the buttons go. Point these at the portal once its domain is decided.
  var CONFIG = {
    signInUrl: "/login",
    demoUrl: "/login?demo=",          // role is appended: admin | manager | employee
    accessEndpoint: ""                // POST { email } here; empty = show the thank-you only
  };

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var wait = function (ms) { return new Promise(function (res) { setTimeout(res, reduce ? 0 : ms); }); };
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  /* ---------- links ---------- */
  $$('[data-link="signin"]').forEach(function (a) { a.href = CONFIG.signInUrl; });
  $$('[data-link="demo"]').forEach(function (a) { a.href = CONFIG.demoUrl + a.dataset.role; });

  /* ---------- nav ---------- */
  var nav = $("#nav");
  function onScroll() {
    nav.classList.toggle("scrolled", window.scrollY > 8);
    var f = $("#frame");
    if (f && !reduce && window.innerWidth > 760) {
      var p = Math.min(1, window.scrollY / 420);
      f.style.setProperty("--tilt", (10 - 10 * p).toFixed(2) + "deg");
      f.style.setProperty("--scale", (0.96 + 0.04 * p).toFixed(3));
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  var menuBtn = $("#menuBtn"), menu = $("#mobileMenu");
  menuBtn.addEventListener("click", function () {
    var open = menu.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", String(open));
  });
  $$("a", menu).forEach(function (a) { a.addEventListener("click", function () { menu.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); }); });

  /* ---------- reveal on scroll (content stays visible if JS never runs) ---------- */
  var onView = function (el, fn, threshold) {
    if (!("IntersectionObserver" in window)) { fn(); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { io.disconnect(); fn(); } });
    }, { threshold: threshold || 0.15 });
    io.observe(el);
  };
  $$(".reveal").forEach(function (el) {
    if (el.getBoundingClientRect().top < window.innerHeight) return; // already on screen: leave it be
    onView(el, function () { el.classList.add("in"); }, 0.05);
  });

  /* ---------- hero parallax ---------- */
  var stage = $("#stage");
  if (stage && !reduce && window.matchMedia("(pointer: fine)").matches) {
    var floats = $$(".float", stage);
    stage.addEventListener("pointermove", function (e) {
      var r = stage.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      floats.forEach(function (f, i) {
        var d = (i + 1) * 8;
        f.style.transform = "translate(" + (x * d).toFixed(1) + "px," + (y * d).toFixed(1) + "px)";
      });
    });
    stage.addEventListener("pointerleave", function () { floats.forEach(function (f) { f.style.transform = ""; }); });
  }

  /* ---------- helpers ---------- */
  function fmt(min) { return Math.floor(min / 60) + ":" + String(min % 60).padStart(2, "0"); }
  function countUp(el, to, ms, render) {
    if (reduce) { el.textContent = render(to); return; }
    var t0 = performance.now();
    (function step(t) {
      var p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3);
      el.textContent = render(Math.round(to * e));
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }
  async function typeInto(el, text, speed) {
    el.textContent = "";
    var caret = document.createElement("span"); caret.className = "caret";
    for (var i = 0; i < text.length; i++) {
      el.textContent = text.slice(0, i + 1);
      el.appendChild(caret);
      await wait(speed || 45);
    }
    caret.remove();
  }

  /* ---------- hero timesheet (sample week) ---------- */
  var rows = [
    { c: "var(--brand)", p: "Website redesign", s: "Northwind Studio", d: [150, 180, 210, null, 330] },
    { c: "var(--violet)", p: "Brand sprint", s: "Northwind Studio › Identity", d: [120, 90, 150, null, 180] },
    { c: "var(--info)", p: "Internal tools", s: "Bridge UX", d: [90, 120, 60, null, 60] },
    { c: "var(--muted)", p: "Leave", s: "Annual leave", d: [null, null, null, "leave", null] }
  ];
  var tb = $("#ts tbody");
  rows.forEach(function (r, ri) {
    var tr = document.createElement("tr");
    var h = '<td><div class="proj"><i class="sw" style="background:' + r.c + '"></i><div>' + r.p + "<small>" + r.s + "</small></div></div></td>";
    r.d.forEach(function (v, di) {
      if (v === "leave") h += '<td><span class="leave">Leave</span></td>';
      else h += '<td><span class="cell empty" data-r="' + ri + '" data-d="' + di + '">–</span></td>';
    });
    h += '<td class="num" data-rt="' + ri + '">0:00</td>';
    tr.innerHTML = h;
    tb.appendChild(tr);
  });
  var cur = rows.map(function () { return [0, 0, 0, 0, 0]; });
  function totals() {
    var grand = 0;
    for (var d = 0; d < 5; d++) {
      var s = 0; cur.forEach(function (r) { s += r[d]; });
      $('#ts tfoot [data-day="' + d + '"]').textContent = fmt(s);
      grand += s;
    }
    cur.forEach(function (r, i) { $('#ts [data-rt="' + i + '"]').textContent = fmt(r.reduce(function (a, b) { return a + b; }, 0)); });
    $("#grand").textContent = fmt(grand);
  }
  (async function fillSheet() {
    await wait(900);
    var order = [];
    for (var d = 0; d < 4; d++) rows.forEach(function (r, ri) { if (typeof r.d[d] === "number") order.push([ri, d]); });
    for (var k = 0; k < order.length; k++) {
      var ri = order[k][0], di = order[k][1], cell = $('#ts .cell[data-r="' + ri + '"][data-d="' + di + '"]');
      cur[ri][di] = rows[ri].d[di];
      cell.textContent = fmt(rows[ri].d[di]);
      cell.classList.remove("empty"); cell.classList.add("fill");
      totals();
      await wait(110);
    }
    // Friday: someone types into the cells
    for (var r2 = 0; r2 < 3; r2++) {
      var c = $('#ts .cell[data-r="' + r2 + '"][data-d="4"]'), txt = fmt(rows[r2].d[4]);
      c.classList.remove("empty"); c.classList.add("typing"); c.textContent = "";
      for (var j = 1; j <= txt.length; j++) { c.textContent = txt.slice(0, j); await wait(140); }
      await wait(250);
      c.classList.remove("typing");
      cur[r2][4] = rows[r2].d[4];
      totals();
      await wait(350);
    }
  })();

  /* ---------- running timer ---------- */
  var clock = $("#clock"), secs = 1 * 3600 + 24 * 60 + 37;
  setInterval(function () {
    secs++;
    var h = Math.floor(secs / 3600), m = Math.floor(secs % 3600 / 60), s = secs % 60;
    clock.textContent = [h, m, s].map(function (n) { return String(n).padStart(2, "0"); }).join(":");
  }, 1000);

  /* ---------- marquee: duplicate for a seamless loop ---------- */
  var mq = $("#marquee"); mq.innerHTML += mq.innerHTML;

  /* ---------- log time widget ---------- */
  var logW = $("#logWidget");
  var lf = {}; $$("[data-lf]", logW).forEach(function (el) { lf[el.dataset.lf] = el; });
  var samples = [
    { dur: "1h 30m", proj: "Northwind › Website redesign", desc: "Homepage hero QA and fixes", start: "14:30 – 16:00" },
    { dur: "45m", proj: "Northwind › Brand sprint", desc: "Logo review with client", start: "16:00 – 16:45" },
    { dur: "2h", proj: "Halcyon › Mobile app", desc: "Onboarding screens, round 2", start: "09:00 – 11:00" }
  ];
  async function logLoop() {
    var i = 0;
    for (;;) {
      var s = samples[i++ % samples.length];
      lf.dur.textContent = ""; lf.proj.innerHTML = ""; lf.desc.textContent = "";
      lf.btn.textContent = "Log time"; lf.btn.classList.remove("done");
      lf.start.textContent = "Start fills from your last entry";
      lf.dur.classList.add("focus"); await typeInto(lf.dur, s.dur, 90); lf.dur.classList.remove("focus");
      lf.start.innerHTML = 'Fills <b class="num">' + s.start + "</b>";
      lf.proj.classList.add("focus"); await wait(400);
      lf.proj.innerHTML = '<span class="crumb">' + s.proj + "</span>";
      await wait(400); lf.proj.classList.remove("focus");
      lf.desc.classList.add("focus"); await typeInto(lf.desc, s.desc, 40); lf.desc.classList.remove("focus");
      await wait(400);
      lf.btn.textContent = "✓ Logged"; lf.btn.classList.add("done");
      await wait(2200);
      if (reduce) return;
    }
  }
  onView(logW, logLoop);

  /* ---------- week calendar ---------- */
  var cal = $("#cal");
  var days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  var evs = [
    [["a", 4, 30, "Website"], ["b", 40, 22, "Internal"], ["c", 66, 26, "Brand"]],
    [["c", 6, 20, "Brand"], ["a", 30, 40, "Website"], ["b", 76, 16, "Sync"]],
    [["a", 4, 52, "Website"], ["c", 62, 30, "Brand"]],
    [["hol", 0, 100, "Holiday"]],
    [["b", 6, 18, "Internal"], ["a", 28, 36, "Website"], ["c", 70, 24, "Brand"]]
  ];
  days.forEach(function (d, i) {
    var day = document.createElement("div"); day.className = "day";
    var h = '<div class="dh">' + d + '</div><div class="col">';
    evs[i].forEach(function (e, k) {
      var style = e[0] === "hol" ? "" : 'top:' + e[1] + '%;height:' + e[2] + '%;';
      h += '<div class="ev ' + e[0] + '" style="' + style + 'animation-delay:' + (i * 120 + k * 90) + 'ms">' + e[3] + "</div>";
    });
    day.innerHTML = h + "</div>";
    cal.appendChild(day);
  });

  /* ---------- roadmap drag ---------- */
  var bar = $("#dragBar");
  if (!reduce) {
    var fwd = true;
    setInterval(function () {
      bar.classList.add("drag");
      bar.style.left = fwd ? "42%" : "30%";
      fwd = !fwd;
      setTimeout(function () { bar.classList.remove("drag"); }, 1300);
    }, 3200);
  }

  /* ---------- donut ---------- */
  var donut = $("#donut");
  onView(donut, function () {
    var C = 2 * Math.PI * 46;
    $$(".seg-anim", donut).forEach(function (c) {
      var v = +c.dataset.v, o = +c.dataset.o;
      c.style.strokeDashoffset = String(-o * C);
      requestAnimationFrame(function () { c.setAttribute("stroke-dasharray", (v * C - 2).toFixed(1) + " " + C.toFixed(1)); });
    });
    countUp($("#donutTotal"), 307, 1400, function (n) { return n + "h"; });
    var rowsEl = $$("#drill > div:not(.exports)"), k = 0;
    if (!reduce) setInterval(function () { rowsEl.forEach(function (r, i) { r.classList.toggle("active", i === k % rowsEl.length); }); k++; }, 1600);
  });

  /* ---------- approvals stack ---------- */
  var stack = $("#stack");
  var reqs = [
    ["AR", "var(--violet)", "Ana R.", "Leave · Thu 16 Oct"],
    ["DK", "var(--info)", "Dev K.", "Taxi to client · ₹640"],
    ["ML", "var(--brand)", "Mia L.", "Leave · 20–21 Oct"],
    ["SJ", "var(--ok)", "Sam J.", "Software licence · $24"]
  ];
  var cards = reqs.map(function (r) {
    var el = document.createElement("div"); el.className = "ap-card";
    el.innerHTML = '<span class="av" style="background:' + r[1] + '">' + r[0] + "</span><div><b>" + r[2] + "</b><span>" + r[3] + '</span></div><div class="ap-act"><i>✕</i><i class="yes">✓</i></div>';
    stack.appendChild(el); return el;
  });
  var badge = document.createElement("span"); badge.className = "ap-badge"; stack.appendChild(badge);
  var approved = 0;
  function layout(start) {
    cards.forEach(function (c, i) {
      var pos = (i - start + cards.length) % cards.length;
      c.classList.remove("approved");
      c.style.zIndex = String(10 - pos);
      c.style.opacity = pos > 2 ? "0" : String(1 - pos * 0.25);
      c.style.transform = "translateY(" + pos * 14 + "px) scale(" + (1 - pos * 0.05) + ")";
    });
    badge.textContent = approved + " approved today";
  }
  var top = 0; layout(0);
  if (!reduce) setInterval(function () {
    var c = cards[top];
    c.style.transform = ""; c.classList.add("approved");
    approved++;
    setTimeout(function () { top = (top + 1) % cards.length; layout(top); }, 600);
  }, 2600);

  /* ---------- roles toggles + brand colour ---------- */
  var flips = $$("[data-flip]");
  if (!reduce) setInterval(function () { flips.forEach(function (t) { t.classList.toggle("on"); }); }, 2400);
  $$(".swatches button").forEach(function (b) {
    b.addEventListener("click", function () {
      $$(".swatches button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      var root = document.documentElement.style;
      if (b.dataset.c === "#ff4c00") { root.removeProperty("--brand"); root.removeProperty("--brand-soft"); return; }
      root.setProperty("--brand", b.dataset.c);
      root.setProperty("--brand-soft", "color-mix(in srgb, " + b.dataset.c + " 14%, var(--surface))");
    });
  });

  /* ---------- tour ---------- */
  var TOUR_MS = 6000;
  var panels = [
    '<div class="app-head"><h4>Log time</h4><span class="week">Today · Tue 14 Oct</span></div>' +
    '<div class="list">' +
      '<div><span>Website redesign · Homepage hero QA</span><span class="num">09:00–10:30</span><b class="num">1:30</b></div>' +
      '<div><span>Brand sprint · Moodboard round 2</span><span class="num">10:30–12:00</span><b class="num">1:30</b></div>' +
      '<div><span>Internal tools · Sprint planning</span><span class="num">12:45–13:30</span><b class="num">0:45</b></div>' +
      '<div><span>Website redesign · Client call notes</span><span class="num">13:30–14:30</span><b class="num">1:00</b></div>' +
      '<div style="background:var(--brand-soft)"><span><b>Day total</b> · submits at 23:59</span><span></span><b class="num" style="color:var(--brand)">4:45</b></div>' +
    "</div>",
    '<div class="app-head"><h4>Website redesign · Tasks</h4><div class="seg"><span>List</span><span class="on">Board</span></div></div>' +
    '<div class="tp-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">' +
      col("To do", [["Footer links", "0:00"], ["Pricing page copy", "0:00"]]) +
      col("In progress", [["Homepage hero", "6:30"], ["Nav mobile menu", "2:15"]]) +
      col("Done", [["Wireframes", "12:00"], ["Design tokens", "4:45"]]) +
    "</div>",
    '<div class="tp-grid">' +
      '<div class="kpi"><span>Logged this month</span><b class="num">307h</b><em>On plan</em></div>' +
      '<div class="kpi"><span>Brand sprint budget</span><b class="num">92%</b><em class="warn">At risk · 8 days left</em></div>' +
    "</div>" +
    '<svg class="area" viewBox="0 0 400 160" preserveAspectRatio="none" aria-hidden="true">' +
      '<line class="gr" x1="0" y1="40" x2="400" y2="40"/><line class="gr" x1="0" y1="80" x2="400" y2="80"/><line class="gr" x1="0" y1="120" x2="400" y2="120"/>' +
      '<path class="fl" d="M0 130 L57 112 L114 118 L171 90 L228 84 L285 60 L342 66 L400 38 L400 160 L0 160Z"/>' +
      '<path class="ln" d="M0 130 L57 112 L114 118 L171 90 L228 84 L285 60 L342 66 L400 38"/>' +
    "</svg>",
    '<div class="app-head"><h4>Approvals</h4><span class="week">4 waiting</span></div>' +
    '<div class="list">' +
      '<div><span>Ana R. · Annual leave · 16 Oct</span><span class="status ok">Approved</span><b class="num">1 day</b></div>' +
      '<div><span>Dev K. · Taxi to client site</span><span class="status wait">Waiting</span><b class="num">₹640</b></div>' +
      '<div><span>Mia L. · Annual leave · 20–21 Oct</span><span class="status wait">Waiting</span><b class="num">2 days</b></div>' +
      '<div><span>Sam J. · Software licence</span><span class="status info">Receipt added</span><b class="num">$24</b></div>' +
      '<div><span style="color:var(--muted)">Every change is kept in the audit log</span><span></span><span></span></div>' +
    "</div>"
  ];
  function col(name, items) {
    return '<div style="display:grid;gap:8px;align-content:start;min-width:0"><span style="font-size:12px;color:var(--muted);font-weight:600">' + name + "</span>" +
      items.map(function (it, i) { return '<div class="kpi" style="animation:rowIn .4s ' + i * 90 + 'ms both"><span style="color:var(--ink);font-weight:500;font-size:13px">' + it[0] + '</span><span class="num">' + it[1] + " logged</span></div>"; }).join("") + "</div>";
  }
  var tabs = $$(".tour-tab"), view = $("#tourView"), ti = 0, timer = null;
  document.documentElement.style.setProperty("--tour-ms", TOUR_MS + "ms");
  function show(i, user) {
    ti = i;
    tabs.forEach(function (t, k) { t.setAttribute("aria-selected", String(k === i)); });
    view.innerHTML = '<div class="tour-panel">' + panels[i] + "</div>";
    clearTimeout(timer);
    if (!reduce && !user) timer = setTimeout(function () { show((ti + 1) % tabs.length); }, TOUR_MS);
  }
  tabs.forEach(function (t, k) { t.addEventListener("click", function () { show(k, true); }); });
  show(0);

  /* ---------- AI chat ---------- */
  var chat = $("#chat");
  onView(chat, async function () {
    await typeInto($("#chatQ"), "How many hours did Northwind take this month?", 35);
    await wait(500);
    await typeInto($("#chatA"), "108.5 hours across three projects. Website redesign took most of it; Brand sprint is at 92% of budget.", 18);
    $("#chatBars").classList.add("show");
  });

  /* ---------- request access forms ---------- */
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  $$(".js-access").forEach(function (form) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var input = $("input[type=email]", form), email = input.value.trim();
      var err = $(".form-error", form);
      if (!EMAIL.test(email)) {
        if (!err) { err = document.createElement("div"); err.className = "form-error"; form.appendChild(err); }
        err.textContent = "Enter a work email like you@company.com.";
        input.focus();
        return;
      }
      if (CONFIG.accessEndpoint) {
        try {
          await fetch(CONFIG.accessEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email }) });
        } catch (x) { /* show the thank-you anyway; the team follows up by email */ }
      }
      var box = document.createElement("div");
      box.className = "thanks"; box.setAttribute("role", "status");
      box.innerHTML = '<svg width="18" height="18"><use href="#i-check"/></svg><div></div>';
      box.lastChild.textContent = "Thanks. We'll email you at " + email + " when your Orbit0 workspace is ready.";
      form.replaceWith(box);
    });
  });

  /* ---------- theme ---------- */
  var themeBtns = $$("#themeToggle button");
  function applyTheme(t) {
    if (t === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    themeBtns.forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.t === t)); });
  }
  applyTheme(store("orbit0-theme") || "system");
  themeBtns.forEach(function (b) { b.addEventListener("click", function () { applyTheme(b.dataset.t); store("orbit0-theme", b.dataset.t); }); });
})();
