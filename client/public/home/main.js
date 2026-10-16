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

  /* ---------- links ---------- */
  $$('[data-link="signin"]').forEach(function (a) { a.href = CONFIG.signInUrl; });
  $$('[data-link="demo"]').forEach(function (a) { a.href = CONFIG.demoUrl + a.dataset.role; });

  /* ---------- current page in the nav ---------- */
  var here = location.pathname.replace(/index\.html$/, "");
  $$(".nav-links a, .dd-menu a, .mobile-menu a").forEach(function (a) {
    var u = a.getAttribute("href") || "";
    if (u.indexOf("#") === -1 && u === here) a.setAttribute("aria-current", "page");
  });

  /* ---------- mobile menu ---------- */
  var menuBtn = $("#menuBtn"), menu = $("#mobileMenu");
  function setMenu(open) { menu.classList.toggle("open", open); menuBtn.setAttribute("aria-expanded", String(open)); }
  menuBtn.addEventListener("click", function () { setMenu(!menu.classList.contains("open")); });
  $$("a", menu).forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });

  /* ---------- dot bars ---------- */
  function buildDots(el, animate) {
    var n = +el.dataset.n, on = +el.dataset.on, html = "";
    for (var i = 0; i < n; i++) html += '<i class="' + (i < on ? "on" : "") + '" style="--i:' + i + '"></i>';
    el.innerHTML = html;
    if (animate) { el.classList.remove("anim"); void el.offsetWidth; el.classList.add("anim"); }
  }
  $$(".dots").forEach(function (d) { buildDots(d, false); });

  /* ---------- scroll reveal ---------- */
  var revealEls = $$(".reveal");
  if (!("IntersectionObserver" in window) || reduce) {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        $$(".dots", e.target).forEach(function (d) { buildDots(d, true); });
        io.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.12 });
    revealEls.forEach(function (el) { io.observe(el); });
  }

  /* ---------- hero: swap the headline, show a filled week ---------- */
  var hero = $(".hero"), heroBtn = $("#heroPlay"), lines = $$(".ht-line");
  function splitWords(line, text, cls) {
    line.innerHTML = text.split(" ").map(function (w, i, a) {
      return '<span class="w ' + cls + '" style="--i:' + i + '">' + w + (i < a.length - 1 ? " " : "") + "</span>";
    }).join("");
  }
  function setHero(played) {
    hero.classList.toggle("played", played);
    heroBtn.setAttribute("aria-pressed", String(played));
    lines.forEach(function (line, li) {
      var next = played ? line.dataset.b : line.dataset.a;
      if (reduce) { line.textContent = next; return; }
      splitWords(line, line.textContent, "out");
      setTimeout(function () { splitWords(line, next, "in"); }, 260 + li * 60);
    });
    if (played) $$(".hero-live .dots").forEach(function (d) { buildDots(d, true); });
  }
  if (hero && heroBtn) heroBtn.addEventListener("click", function () { setHero(!hero.classList.contains("played")); });

  /* ---------- typed timesheet cell ---------- */
  var typed = $(".typed"), cellEdit = $(".cell-edit");
  if (typed) {
    var full = typed.dataset.text;
    if (reduce) { typed.textContent = full; }
    else {
      var typeLoop = function () {
        typed.textContent = "";
        setTimeout(function () {
          cellEdit.classList.add("typing");
          var i = 0;
          var t = setInterval(function () {
            typed.textContent = full.slice(0, ++i);
            if (i >= full.length) { clearInterval(t); setTimeout(function () { cellEdit.classList.remove("typing"); }, 1600); }
          }, 160);
        }, 2600);
      };
      typeLoop(); setInterval(typeLoop, 6000);
    }
  }

  /* ---------- accordions ---------- */
  function accordion(root, onOpen) {
    var items = $$(".acc-item", root);
    function open(idx) {
      items.forEach(function (it, i) {
        var on = i === idx;
        it.classList.toggle("open", on);
        $(".acc-btn", it).setAttribute("aria-expanded", String(on));
      });
      if (onOpen) onOpen(idx);
    }
    items.forEach(function (it, i) {
      $(".acc-btn", it).addEventListener("click", function () {
        if (it.classList.contains("open") && !onOpen) { it.classList.remove("open"); $(".acc-btn", it).setAttribute("aria-expanded", "false"); return; }
        open(i); if (root.__stop) root.__stop();
      });
    });
    return open;
  }
  var featAcc = $("#featAcc"), panels = $$(".stage .panel");
  var openFeat = featAcc && accordion(featAcc, function (i) {
    panels.forEach(function (p) { p.classList.toggle("show", +p.dataset.for === i); });
  });
  // Auto-advance the feature accordion until someone clicks it.
  if (featAcc && !reduce && "IntersectionObserver" in window) {
    var featIdx = 0, featTimer = null;
    var startFeat = function () { featTimer = setInterval(function () { featIdx = (featIdx + 1) % 3; openFeat(featIdx); }, 7000); };
    featAcc.__stop = function () { clearInterval(featTimer); };
    var fio = new IntersectionObserver(function (e) {
      if (e[0].isIntersecting && !featTimer) startFeat();
      else if (!e[0].isIntersecting && featTimer) { clearInterval(featTimer); featTimer = null; }
    }, { threshold: 0.3 });
    fio.observe(featAcc);
  }
  $$(".faq-acc").forEach(function (f) { accordion(f); });

  /* ---------- flow: wires from each node to the hub, packets on the hot ones ---------- */
  var flow = $(".flow"), wires = $(".wires"), hub = $(".hub");
  var NS = "http://www.w3.org/2000/svg", hotIn = null, hotOut = null;
  function drawWires() {
    if (!flow || getComputedStyle(wires).display === "none") return;
    var fb = flow.getBoundingClientRect(), hb = hub.getBoundingClientRect();
    wires.setAttribute("viewBox", "0 0 " + fb.width + " " + fb.height);
    wires.innerHTML = "";
    var hy = hb.top - fb.top + hb.height / 2, hl = hb.left - fb.left, hr = hb.right - fb.left;
    $$(".flow-col", flow).forEach(function (col, ci) {
      $$(".node", col).forEach(function (n) {
        var nb = n.getBoundingClientRect(), y = nb.top - fb.top + nb.height / 2, d;
        if (ci === 0) { var x = nb.right - fb.left, mx = (x + hl) / 2; d = "M" + x + " " + y + " C" + mx + " " + y + " " + mx + " " + hy + " " + hl + " " + hy; }
        else { var x2 = nb.left - fb.left, mx2 = (hr + x2) / 2; d = "M" + hr + " " + hy + " C" + mx2 + " " + hy + " " + mx2 + " " + y + " " + x2 + " " + y; }
        var p = document.createElementNS(NS, "path");
        p.setAttribute("d", d); p.setAttribute("class", "w" + (n.classList.contains("hot") ? " hot" : ""));
        wires.appendChild(p);
        if (n.classList.contains("hot")) { if (ci === 0) hotIn = p; else hotOut = p; }
      });
    });
  }
  function runPacket(pkt, getPath, dur, delay) {
    var t0 = null;
    function frame(ts) {
      if (t0 === null) t0 = ts + delay;
      var path = getPath(), p = (ts - t0) / dur;
      if (path && p >= 0 && p <= 1) {
        var pt = path.getPointAtLength(path.getTotalLength() * p);
        pkt.style.transform = "translate(" + pt.x + "px," + pt.y + "px)";
        pkt.style.opacity = p < 0.1 ? p * 10 : p > 0.9 ? (1 - p) * 10 : 1;
      } else pkt.style.opacity = 0;
      if (p > 1.7) t0 = ts;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  if (flow) {
    drawWires();
    window.addEventListener("resize", drawWires);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawWires);
    if (!reduce) {
      runPacket($(".p-in"), function () { return hotIn; }, 1300, 0);
      runPacket($(".p-out"), function () { return hotOut; }, 1300, 1000);
    }
  }

  /* ---------- Ask AI ---------- */
  var AI = [
    { q: "Which project used the most hours last month?", ctx: "Checked timesheets for Northwind Studio, September",
      a: "Website redesign used the most: 184h of a 200h budget. Spring campaign went 18% over its budget.",
      h: ["Project", "Hours", "Budget", "Used"],
      rows: [["Website redesign", "184h", "200h", "92%"], ["Spring campaign", "142h", "120h", "118%"], ["Brand sprint", "132h", "170h", "78%"], ["Mobile app · v2", "96h", "240h", "40%"]], hi: 1,
      s: "Spring campaign is over budget. Want me to draft a client update about it?", b: "Draft update" },
    { q: "Who has room for more work next week?", ctx: "Checked workload and approved leave for week 43",
      a: "Meera has the most room: 18 free hours. Ana is fully booked and has a day of leave on Thursday.",
      h: ["Person", "Planned", "Leave", "Free"],
      rows: [["Ana R.", "32h", "8h", "0h"], ["Karan S.", "38h", "—", "2h"], ["Vikram T.", "30h", "—", "10h"], ["Meera P.", "22h", "—", "18h"]], hi: 3,
      s: "Want me to suggest which open tasks Meera could take?", b: "Suggest tasks" },
    { q: "How much of last week was billable?", ctx: "Checked time entries for week 41",
      a: "86% of last week was billable: 172h of 200h. Internal tools took most of the rest.",
      h: ["Project", "Hours", "Billable", "Share"],
      rows: [["Website redesign", "64h", "64h", "100%"], ["Brand sprint", "58h", "58h", "100%"], ["Mobile app · v2", "50h", "50h", "100%"], ["Internal tools", "28h", "0h", "0%"]], hi: 3,
      s: "Want this as an Excel report grouped by client?", b: "Export Excel" },
    { q: "Summarise the Brand sprint for the client.", ctx: "Read the Brand sprint project, its tasks and milestones",
      a: "Brand sprint is 78% through its hours and on track for its 31 Oct milestone. Logo and type are done; the guidelines are in review.",
      h: ["Milestone", "Due", "Hours", "Status"],
      rows: [["Logo", "3 Oct", "38h", "Done"], ["Type system", "14 Oct", "41h", "Done"], ["Guidelines", "24 Oct", "36h", "Review"], ["Handover", "31 Oct", "17h", "Next"]], hi: 2,
      s: "I drafted a client update from these facts. Review it before it's sent?", b: "Review draft" }
  ];
  var qBtns = $$(".q"), aiBody = $("#aiBody");
  function showAI(i) {
    var d = AI[i];
    qBtns.forEach(function (b, j) {
      b.classList.toggle("on", j === i);
      b.innerHTML = AI[j].q + (j === i ? ' <svg class="ico-s"><use href="#i-arrow"/></svg>' : "");
    });
    $("#aiQ").textContent = d.q; $("#aiCtx").textContent = d.ctx; $("#aiA").textContent = d.a; $("#aiS").textContent = d.s;
    $(".ai-sugg .btn-brand").textContent = d.b;
    var t = '<div class="at-h">' + d.h.map(function (c, k) { return "<span" + (k ? ' class="r"' : "") + ">" + c + "</span>"; }).join("") + "</div>";
    d.rows.forEach(function (r, k) {
      t += '<div class="at-r' + (k === d.hi ? " hi" : "") + '">' + r.map(function (c, m) { return "<span" + (m ? ' class="r"' : "") + ">" + c + "</span>"; }).join("") + "</div>";
    });
    $("#aiT").innerHTML = t;
    aiBody.classList.remove("swap"); void aiBody.offsetWidth; if (!reduce) aiBody.classList.add("swap");
  }
  if (aiBody) qBtns.forEach(function (b, i) { b.addEventListener("click", function () { showAI(i); }); });

  /* ---------- week to report ---------- */
  var weekEl = $("#benchWeek"), range = $("#benchRange");
  // 4 weeks x 5 days; each day logs a mix of three projects. Day 9 is leave.
  var DAYS = [];
  for (var w = 0; w < 4; w++) for (var dd = 0; dd < 5; dd++) {
    var idx = w * 5 + dd;
    DAYS.push(idx === 8 ? null : [[3.5, 2.5, 1.5], [3, 3, 2], [4, 2, 1.5], [2.5, 3.5, 1.5], [4, 2.5, 1]][dd]);
  }
  var hdr = ["M", "T", "W", "T", "F"].map(function (x) { return '<span class="day-h">' + x + "</span>"; }).join("");
  function renderWeek() {
    var n = +range.value, html = hdr, tot = [0, 0, 0];
    DAYS.forEach(function (d, i) {
      if (i < n && d) { tot[0] += d[0]; tot[1] += d[1]; tot[2] += d[2]; }
      var inner = i < n && d ? '<i class="b1" style="width:' + d[0] * 12 + '%"></i><i class="b2" style="width:' + d[1] * 12 + '%"></i><i class="b3" style="width:' + d[2] * 12 + '%"></i>' : "";
      html += '<span class="' + (i < n ? (d ? "on" : "leave") : "") + '" title="' + (d ? "" : "Leave") + '">' + inner + "</span>";
    });
    weekEl.innerHTML = html;
    var max = 70;
    tot.forEach(function (v, k) { $("#rb" + k).style.width = Math.min(100, v / max * 100) + "%"; $("#rv" + k).textContent = v.toFixed(0) + "h"; });
    $("#rvT").textContent = (tot[0] + tot[1] + tot[2]).toFixed(0) + "h";
    var logged = DAYS.slice(0, n).filter(Boolean).length;
    $("#benchStat").textContent = n + " of 20 days · " + logged + " logged" + (n > 8 ? " · 1 leave" : "");
    var st = n < 8 ? 0 : n < 16 ? 1 : 2;
    $$("#steps li").forEach(function (li, i) { li.classList.toggle("on", i === st); });
  }
  if (weekEl && range) { range.addEventListener("input", renderWeek); renderWeek(); }

  /* ---------- count-up ---------- */
  var counters = $$("[data-count]");
  if ("IntersectionObserver" in window) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target, to = +el.dataset.count, t0 = performance.now();
        if (reduce) { el.textContent = to; return; }
        (function tick(ts) { var p = Math.min(1, (ts - t0) / 900); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(tick); })(t0);
        cio.unobserve(el);
      });
    }, { threshold: 0.5 });
    counters.forEach(function (c) { cio.observe(c); });
  } else counters.forEach(function (c) { c.textContent = c.dataset.count; });

  /* ---------- request access ---------- */
  var form = $("#accessForm"), msg = $("#accessMsg");
  if (form) form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var email = form.email.value.trim();
    msg.className = "form-msg";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = "Enter a work email, like you@company.com."; msg.classList.add("err"); form.email.focus(); return; }
    var done = function () { msg.textContent = "Thanks. We'll email you at " + email + " when your Orbit0 workspace is ready."; msg.classList.add("ok"); form.reset(); };
    if (!CONFIG.accessEndpoint) return done();
    fetch(CONFIG.accessEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email }) })
      .then(function (r) { if (!r.ok) throw new Error(); done(); })
      .catch(function () { msg.textContent = "That didn't go through. Please try again in a moment."; msg.classList.add("err"); });
  });
})();
