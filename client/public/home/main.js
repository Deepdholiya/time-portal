/* Orbit0 marketing site. Plain JS, no build step. */
(function () {
  "use strict";

  // Where the buttons go. Point these at the portal once its domain is decided.
  var CONFIG = {
    signInUrl: "/login",
    demoUrl: "/login?demo=",          // role is appended: admin | manager | employee
    accessEndpoint: ""                // POST { email, name, company, teamSize, role, companies, message } here; empty = show the thank-you only
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
    if ((a.getAttribute("href") || "").indexOf("#") === -1 && a.pathname.replace(/index\.html$/, "") === here) a.setAttribute("aria-current", "page");
  });

  /* ---------- nav dropdowns: click toggles, hover opens where hover exists (in CSS), Esc and outside click close ---------- */
  var dds = $$("[data-dd]");
  function closeDds(except) {
    dds.forEach(function (d) { if (d !== except) { d.classList.remove("open"); $(".dd-btn", d).setAttribute("aria-expanded", "false"); } });
  }
  dds.forEach(function (d) {
    var btn = $(".dd-btn", d);
    btn.addEventListener("click", function () {
      var open = !d.classList.contains("open");
      closeDds(d);
      d.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", String(open));
    });
    d.addEventListener("mouseleave", function () { if (window.matchMedia("(hover: hover)").matches) closeDds(); });
    d.addEventListener("focusout", function (e) { if (!d.contains(e.relatedTarget)) closeDds(); });
  });
  document.addEventListener("click", function (e) { if (!e.target.closest("[data-dd]")) closeDds(); });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var open = dds.filter(function (d) { return d.classList.contains("open"); })[0];
    closeDds();
    if (open) $(".dd-btn", open).focus();
    if (menu.classList.contains("open")) { setMenu(false); menuBtn.focus(); }
  });

  /* ---------- mobile menu ---------- */
  var menuBtn = $("#menuBtn"), menu = $("#mobileMenu");
  function setMenu(open) { menu.classList.toggle("open", open); menuBtn.setAttribute("aria-expanded", String(open)); document.body.classList.toggle("menu-open", open); }
  menuBtn.addEventListener("click", function () { setMenu(!menu.classList.contains("open")); });
  $$("a", menu).forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });
  // open the group that holds the current page
  $$("details", menu).forEach(function (g) { if ($('[aria-current="page"]', g)) g.open = true; });

  /* ---------- dot bars ---------- */
  function buildDots(el, animate) {
    var n = +el.dataset.n, on = +el.dataset.on, html = "";
    for (var i = 0; i < n; i++) html += '<i class="' + (i < on ? "on" : "") + '" style="--i:' + i + '"></i>';
    el.innerHTML = html;
    if (animate) { el.classList.remove("anim"); void el.offsetWidth; el.classList.add("anim"); }
  }
  $$(".dots").forEach(function (d) { buildDots(d, false); });

  /* ---------- stagger: number the items in each group so they arrive one after another ---------- */
  $$(".tiles, .rel-grid, .tries, .c-side, .rq-side").forEach(function (g) {
    $$(":scope > .reveal", g).forEach(function (el, i) { el.style.setProperty("--i", i); });
  });
  $$(".ticks").forEach(function (t) { $$("li", t).forEach(function (li, i) { li.style.setProperty("--i", i); }); });
  $$(".hero-shot, .frow-v").forEach(function (v) {
    $$(".lr, .bcard, .ap-row, .wr-row, .at-r, .lf-r, .cb", v).forEach(function (r, i) { r.style.setProperty("--i", i); });
  });

  /* ---------- scroll reveal ---------- */
  var revealEls = $$(".reveal");
  if (!("IntersectionObserver" in window) || reduce) {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        // once it has arrived, hover effects shouldn't wait for the stagger delay
        setTimeout(function () { e.target.style.removeProperty("--i"); }, 1400);
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
  if (form) {
    var pre = new URLSearchParams(location.search).get("email");
    if (pre) form.email.value = pre;
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var data = {};
      $$("input, select, textarea", form).forEach(function (f) { if (f.name) data[f.name] = f.value.trim(); });
      var email = data.email;
      msg.className = "form-msg";
      form.email.removeAttribute("aria-invalid");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        msg.textContent = "Enter a work email, like you@company.com."; msg.classList.add("err");
        form.email.setAttribute("aria-invalid", "true"); form.email.focus(); return;
      }
      var done = function () {
        msg.textContent = "Thanks" + (data.name ? ", " + data.name.split(" ")[0] : "") + ". We'll email you at " + email + " with a quote and your access.";
        msg.classList.add("ok"); form.classList.add("sent"); form.reset();
      };
      if (!CONFIG.accessEndpoint) return done();
      fetch(CONFIG.accessEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
        .then(function (r) { if (!r.ok) throw new Error(); done(); })
        .catch(function () { msg.textContent = "That didn't go through. Please try again in a moment."; msg.classList.add("err"); });
    });
  }
  /* ---------- nav: shadow once scrolled, and a reading-progress line ---------- */
  var nav = $("#nav");
  if (nav) {
    var bar = document.createElement("span"); bar.className = "nav-progress"; bar.setAttribute("aria-hidden", "true"); nav.appendChild(bar);
    var onScroll = function () {
      var max = document.documentElement.scrollHeight - innerHeight;
      nav.classList.toggle("scrolled", scrollY > 8);
      bar.style.setProperty("--p", max > 0 ? Math.min(1, scrollY / max) : 0);
    };
    addEventListener("scroll", onScroll, { passive: true }); onScroll();
  }

  /* ---------- cards: a soft light follows the pointer ---------- */
  $$(".tile, .rel-card, .c-link, .demo-card, .plan, .dd-card, .try, .hero-shot").forEach(function (c) {
    c.classList.add("spot");
    c.addEventListener("pointermove", function (e) {
      var r = c.getBoundingClientRect();
      c.style.setProperty("--mx", (e.clientX - r.left) + "px");
      c.style.setProperty("--my", (e.clientY - r.top) + "px");
    });
  });

  /* ---------- product hero shot: tilted back, flattens as it scrolls into place ---------- */
  var shots = $$("[data-tilt]");
  if (shots.length && !reduce) {
    var tilt = function () {
      shots.forEach(function (s) {
        var top = s.getBoundingClientRect().top, p = Math.max(0, Math.min(1, 1 - (top - innerHeight * 0.25) / (innerHeight * 0.55)));
        s.style.setProperty("--tilt", (14 * (1 - p)).toFixed(2) + "deg");
        s.style.setProperty("--sc", (0.94 + 0.06 * p).toFixed(3));
      });
    };
    var ticking = false;
    addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(function () { tilt(); ticking = false; }); } }, { passive: true });
    tilt();
  }

  /* ---------- solution pages: Without / With Orbit0 ---------- */
  $$(".pf-switch").forEach(function (sw) {
    var box = sw.closest(".wrap").querySelector("[data-pf-box]"), btns = $$("button", sw), touched = false;
    var set = function (on) {
      sw.classList.toggle("on", on); box.classList.toggle("on", on);
      btns.forEach(function (b) { b.setAttribute("aria-pressed", String((b.dataset.pf === "1") === on)); });
      $$(".pf-a", box).forEach(function (a) { a.setAttribute("aria-hidden", String(on)); });
      $$(".pf-b", box).forEach(function (b) { b.setAttribute("aria-hidden", String(!on)); });
    };
    btns.forEach(function (b) { b.addEventListener("click", function () { touched = true; set(b.dataset.pf === "1"); }); });
    // show the fix on its own once, a moment after the problems have been read
    if (!reduce && "IntersectionObserver" in window) {
      var pio = new IntersectionObserver(function (en) {
        if (!en[0].isIntersecting) return;
        pio.disconnect();
        setTimeout(function () { if (!touched) set(true); }, 2600);
      }, { threshold: 0.35 });
      pio.observe(box);
    }
  });
  /* ---------- headings: words rise in one by one as each heading scrolls into view ---------- */
  if (!reduce && "IntersectionObserver" in window && Element.prototype.animate) {
    var heads = $$(".sec-head h2, .frow-t h2, .faq-l h2, .story h2, .final h2, .page-hero h1, .c-form h2");
    var splitWords = function (el) {
      var words = [];
      (function walk(node) {
        Array.prototype.slice.call(node.childNodes).forEach(function (n) {
          if (n.nodeType === 3) {
            var parts = n.textContent.split(/(\s+)/), frag = document.createDocumentFragment();
            parts.forEach(function (t) {
              if (!t) return;
              if (/^\s+$/.test(t)) { frag.appendChild(document.createTextNode(t)); return; }
              var w = document.createElement("span"); w.className = "w"; w.textContent = t; w.style.opacity = "0";
              frag.appendChild(w); words.push(w);
            });
            n.parentNode.replaceChild(frag, n);
          } else if (n.nodeType === 1 && n.tagName !== "BR") walk(n);
        });
      })(el);
      el.classList.add("words");
      return words;
    };
    var hio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        hio.unobserve(e.target);
        e.target._words.forEach(function (w, i) {
          var a = w.animate([
            { opacity: 0, transform: "translateY(.5em) rotate(2deg)", filter: "blur(6px)" },
            { opacity: 1, transform: "none", filter: "blur(0)" }
          ], { duration: 650, delay: 120 + i * 55, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" });
          a.onfinish = function () { w.style.opacity = ""; a.cancel(); };
        });
      });
    }, { threshold: 0.4 });
    heads.forEach(function (h) { h._words = splitWords(h); hio.observe(h); });
  }

  /* ---------- characters: pop in when seen, then drift a little with the scroll ---------- */
  var chars = $$(".char");
  if (chars.length && !reduce) {
    if ("IntersectionObserver" in window && Element.prototype.animate) {
      var chio = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          chio.unobserve(e.target);
          e.target.querySelector("svg").animate([
            { opacity: 0, transform: "translateY(16px) scale(.6) rotate(-8deg)" },
            { opacity: 1, transform: "translateY(-4px) scale(1.06) rotate(2deg)", offset: .7 },
            { opacity: 1, transform: "none" }
          ], { duration: 800, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" });
        });
      }, { threshold: 0.3 });
      chars.forEach(function (c) { chio.observe(c); });
    }
    var drift = function () {
      chars.forEach(function (c) {
        if (c.classList.contains("hs-walker") || c.classList.contains("faq-ch")) return;
        var r = c.getBoundingClientRect(); if (r.bottom < -200 || r.top > innerHeight + 200) return;
        c.style.setProperty("--py", ((r.top + r.height / 2 - innerHeight / 2) * -0.08).toFixed(1) + "px");
      });
    };
    var dtick = false;
    addEventListener("scroll", function () { if (!dtick) { dtick = true; requestAnimationFrame(function () { drift(); dtick = false; }); } }, { passive: true });
    drift();
  }
})();
