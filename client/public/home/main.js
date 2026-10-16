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
  $$(".tiles, .rel-grid, .tries, .c-side, .rq-side, .demo-row, .duo-co").forEach(function (g) {
    $$(":scope > .reveal", g).forEach(function (el, i) { el.style.setProperty("--i", i); });
  });
  $$(".ticks").forEach(function (t) { $$("li", t).forEach(function (li, i) { li.style.setProperty("--i", i); }); });

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

  /* ---------- typed timesheet cell (the editor widget's loop, see Widgets) ---------- */
  var typed = $(".typed"), cellEdit = $(".cell-edit");
  function typeCell() {
    if (!typed) return;
    var full = typed.dataset.text;
    typed.textContent = "";
    setTimeout(function () {
      cellEdit.classList.add("typing");
      var i = 0, t = setInterval(function () {
        typed.textContent = full.slice(0, ++i);
        if (i >= full.length) { clearInterval(t); setTimeout(function () { cellEdit.classList.remove("typing"); }, 1600); }
      }, 160);
    }, 2600);
  }
  if (typed) typed.textContent = typed.dataset.text;

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
      // off screen: stop drawing and look again in a moment
      if (flow.classList.contains("wx") && !flow.classList.contains("on")) { pkt.style.opacity = 0; t0 = null; setTimeout(function () { requestAnimationFrame(frame); }, 400); return; }
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
    aiBody._cur = i;
    var chat = aiBody.closest("[data-w]");
    if (chat && chat.classList.contains("wx")) askAI(chat);
    else { aiBody.classList.remove("swap"); void aiBody.offsetWidth; if (!reduce) aiBody.classList.add("swap"); }
  }
  if (aiBody) qBtns.forEach(function (b, i) { b.addEventListener("click", function () { aiBody._touched = true; showAI(i); }); });

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
  if (weekEl && range) { range.addEventListener("input", function () { range._touched = true; renderWeek(); }); renderWeek(); }

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

  /* ======================================================================
     Widgets. Every mock-up carries data-w="<name>". When one scrolls into view it
     plays its entrance (CSS keyed on .play, numbers marked .cu count up, text types
     out) and, while it stays on screen (.on), runs a small looping scene. Off screen
     the loop stops, CSS animations pause and the widget settles to its final state.
     With reduced motion none of this runs and the static markup is the final state.
     ====================================================================== */
  var motion = !reduce && "IntersectionObserver" in window && !!Element.prototype.animate;
  var WX = {};
  var ROWS = ".lr, .ap-row, .wr-row, .wr-kv, .lf-r, .bcard, .wt-row, .tl li, .cmp-r, .mc-r, .plan, .demo-card, .co, .try-i, .facts-mini > div, .rm-row, .node";

  function later(w, ms, fn) {
    var t = setTimeout(function () { if (w.classList.contains("on")) fn(); }, ms);
    (w._to || (w._to = [])).push(t);
  }
  function clearLater(w) { (w._to || []).forEach(clearTimeout); w._to = []; }

  // numbers: "184h", "92%", "5:00", "₹2,400", "+31%" count from 0 (or data-from) to their value
  function numParts(t) { return t.split(/(\d+:\d\d|\d[\d,]*(?:\.\d+)?)/); }
  function toVal(x) { if (x.indexOf(":") > 0) { var a = x.split(":"); return +a[0] * 60 + +a[1]; } return parseFloat(x.replace(/,/g, "")); }
  function fmtLike(x, v) {
    if (x.indexOf(":") > 0) { var m = Math.round(v); return Math.floor(m / 60) + ":" + ("0" + (m % 60)).slice(-2); }
    var d = (x.split(".")[1] || "").length, f = v.toFixed(d);
    return x.indexOf(",") > -1 ? Number(f).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : f;
  }
  function countUp(el, dur, fromText) {
    var to = el._cuText || (el._cuText = el.textContent), parts = numParts(to);
    var from = fromText || el.dataset.from, fromNums = from ? numParts(from).filter(function (_, i) { return i % 2; }).map(toVal) : [];
    cancelAnimationFrame(el._cuRaf);
    var t0 = performance.now();
    (function f(now) {
      var p = Math.min(1, (now - t0) / (dur || 1100)), e = 1 - Math.pow(1 - p, 3), k = 0;
      el.textContent = parts.map(function (x, i) {
        if (!(i % 2)) return x;
        var a = fromNums[k++] || 0;
        return fmtLike(x, a + (toVal(x) - a) * e);
      }).join("");
      if (p < 1) el._cuRaf = requestAnimationFrame(f);
    })(t0);
  }
  // text that streams in word by word, like a reply being written
  function typeWords(el, speed, done) {
    var full = el._full || (el._full = el.textContent), words = full.split(" "), i = 0;
    clearInterval(el._tw);
    el.textContent = ""; el.classList.add("typing");
    el._tw = setInterval(function () {
      el.textContent = words.slice(0, ++i).join(" ");
      if (i >= words.length) { clearInterval(el._tw); el.classList.remove("typing"); if (done) done(); }
    }, speed || 45);
  }
  // a demo pointer that glides to a control and clicks it
  function clickOn(w, target, done) {
    if (!target || !target.offsetParent) { if (done) done(); return; }
    var c = w._cur;
    if (!c) { c = w._cur = document.createElement("span"); c.className = "wcur"; c.setAttribute("aria-hidden", "true"); w.appendChild(c); }
    var wr = w.getBoundingClientRect(), r = target.getBoundingClientRect();
    var x = r.left - wr.left + r.width * .55, y = r.top - wr.top + r.height * .55;
    var fx = c._x != null ? c._x : wr.width * .82, fy = c._y != null ? c._y : wr.height + 6;
    var a = c.animate([
      { transform: "translate(" + fx + "px," + fy + "px)", opacity: c._x != null ? 1 : 0 },
      { transform: "translate(" + x + "px," + y + "px)", opacity: 1, offset: .82 },
      { transform: "translate(" + x + "px," + y + "px) scale(.8)", opacity: 1 }
    ], { duration: 950, easing: "cubic-bezier(.45,0,.2,1)" });
    c._x = x; c._y = y;
    c.style.transform = "translate(" + x + "px," + y + "px)"; c.style.opacity = 1;
    a.onfinish = function () {
      target.classList.add("w-press");
      setTimeout(function () { target.classList.remove("w-press"); }, 280);
      if (done) done();
    };
  }
  function hideCursor(w) {
    var c = w._cur; if (!c || c._x == null) return;
    c._x = c._y = null; c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300 }); c.style.opacity = 0;
  }
  function toast(w, text) {
    var t = document.createElement("span");
    t.className = "w-toast"; t.setAttribute("aria-hidden", "true");
    t.innerHTML = '<svg class="ico-s"><use href="#i-check"/></svg>' + text;
    w.appendChild(t);
    setTimeout(function () { t.classList.add("out"); setTimeout(function () { t.remove(); }, 400); }, 2000);
  }

  var widgets = $$("[data-w]");
  function shown(w) { var p = w.parentElement && w.parentElement.closest(".panel"); return !p || p.classList.contains("show"); }
  function number(w) {
    $$(ROWS, w).forEach(function (r, i) { r.style.setProperty("--i", i); });
    $$(".tg, .b4, .rm-bar, .cb, .who-art i, .tool, .cmp .ok, .at-r", w).forEach(function (r, i) { r.style.setProperty("--i", i); });
    $$(".sheet, .we-grid", w).forEach(function (g) {
      var cols = getComputedStyle(g).gridTemplateColumns.split(" ").length;
      $$(":scope > *", g).forEach(function (c, i) { c.style.setProperty("--c", i % cols); c.style.setProperty("--r", Math.floor(i / cols)); });
    });
  }
  function settle(w) {
    $$(".cu", w).forEach(function (el) { cancelAnimationFrame(el._cuRaf); if (el._cuText) el.textContent = el._cuText; });
    $$(".typing", w).forEach(function (el) { clearInterval(el._tw); el.classList.remove("typing"); if (el._full) el.textContent = el._full; });
    var b = WX[w.dataset.w]; if (b && b.settle) b.settle(w);
    hideCursor(w);
  }
  function play(w) {
    w._played = true;
    clearLater(w);
    w.classList.remove("play"); void w.offsetWidth; w.classList.add("play");
    $$(".cu", w).forEach(function (el, i) { countUp(el, 1000 + i * 70); });
    $$(".dots", w).forEach(function (d) { buildDots(d, true); });
    var b = WX[w.dataset.w]; if (b && b.enter) b.enter(w);
  }
  function startLoop(w) {
    var b = WX[w.dataset.w]; if (!b || !b.loop || w._iv) return;
    w._iv = setInterval(function () { if (!document.hidden) b.loop(w); }, b.every || 6000);
    if (b.first != null) later(w, b.first, function () { b.loop(w); });
  }
  function stopLoop(w) { clearInterval(w._iv); w._iv = null; clearLater(w); }
  function sync(w) {
    if (!motion) return;
    var on = !!w._vis && shown(w);
    if (on && !w.classList.contains("on")) { w.classList.add("on"); if (!w._played) play(w); startLoop(w); }
    else if (!on && w.classList.contains("on")) { w.classList.remove("on"); stopLoop(w); settle(w); }
  }
  function replay(w) { if (!motion) return; w._played = false; if (w.classList.contains("on")) { w.classList.remove("on"); stopLoop(w); settle(w); } sync(w); }

  /* ---- the scenes ---- */
  function btn(w, re) { return $$(".btn, .chip", w).filter(function (b) { return re.test(b.textContent); })[0]; }

  WX.time = { every: 7000, first: 2600, loop: function (w) {
    clickOn(w, btn(w, /Log time/), function () {
      var row = $(".lr.new", w); if (!row) return;
      row.classList.remove("again"); void row.offsetWidth; row.classList.add("again");
      $$(".cu", row).forEach(function (el) { countUp(el, 900); });
      $$(".pw-foot .cu", w).forEach(function (el) { countUp(el, 900); });
      later(w, 1600, function () { hideCursor(w); });
    });
  } };
  WX.sheet = { every: 7000, first: 2800, loop: function (w) {
    clickOn(w, $(".chip-brand", w), function () {
      w.classList.remove("exporting"); void w.offsetWidth; w.classList.add("exporting");
      toast(w, "Team timesheets.xlsx exported");
      later(w, 1400, function () { hideCursor(w); });
    });
  } };
  WX.bars = { every: 6500, first: 2600, loop: function (w) {
    clickOn(w, $(".b4.hot", w), function () {
      toast(w, "21 entries in QA · 5 people");
      later(w, 1500, function () { hideCursor(w); });
    });
  } };
  WX.approve = {
    every: 9000, first: 1800,
    enter: function (w) {
      $$(".ap-btns", w).forEach(function (b) {
        if (!b.nextElementSibling || !b.nextElementSibling.classList.contains("ap-ok")) b.insertAdjacentHTML("afterend", '<span class="pill pill-ok ap-ok">Approved</span>');
      });
      WX.approve.settle(w);
    },
    settle: function (w) { $$(".ap-row", w).forEach(function (r) { r.classList.remove("done"); }); var h = $(".pw-head .muted", w); if (h) h.textContent = "3 waiting"; },
    loop: function (w) {
      var rows = $$(".ap-row", w).filter(function (r) { return $(".ap-btns", r); }), h = $(".pw-head .muted", w);
      var approve = function (k) {
        var r = rows[k]; if (!r) return;
        clickOn(w, $(".btn-brand", r), function () { r.classList.add("done"); if (h) h.textContent = (2 - k) + " waiting"; });
      };
      approve(0);
      later(w, 2300, function () { approve(1); });
      later(w, 4300, function () { hideCursor(w); });
      later(w, 7200, function () { rows.forEach(function (r) { r.classList.add("undo"); }); });
      later(w, 7600, function () { rows.forEach(function (r) { r.classList.remove("done", "undo"); }); if (h) h.textContent = "3 waiting"; });
    }
  };
  function askAI(w) {
    var a = $(".ai-a", w) || $("#aiA", w); if (!a) return;
    clearInterval(a._tw);
    if (a.id === "aiA") a._full = a.textContent;           // the home chat swaps its text per question
    w.classList.remove("answered", "thinking"); void w.offsetWidth; w.classList.add("asking");
    var bub = $(".bubble", w); if (bub) { bub.classList.remove("in"); void bub.offsetWidth; bub.classList.add("in"); }
    a.textContent = "";
    clearTimeout(w._ai1); clearTimeout(w._ai2);
    w._ai1 = setTimeout(function () { w.classList.add("thinking"); }, 450);
    w._ai2 = setTimeout(function () {
      w.classList.remove("thinking");
      typeWords(a, 42, function () { w.classList.add("answered"); w.classList.remove("asking"); });
    }, 1500);
  }
  function settleAI(w) {
    clearTimeout(w._ai1); clearTimeout(w._ai2);
    var a = $(".ai-a", w) || $("#aiA", w); if (a && a._full) { clearInterval(a._tw); a.textContent = a._full; a.classList.remove("typing"); }
    w.classList.remove("thinking", "asking"); w.classList.add("answered");
  }
  WX.ai = { every: 14000, enter: askAI, loop: askAI, settle: settleAI };
  WX.aihome = { every: 9000, enter: askAI, settle: settleAI, loop: function (w) {
    if (aiBody._touched) return;
    showAI(((aiBody._cur || 0) + 1) % AI.length);
  } };
  WX.load = { every: 7000, first: 3000, loop: function (w) {
    var hi = $(".wr-row.hi .dots", w); if (hi) buildDots(hi, true);
    clickOn(w, btn(w, /Open workload/), function () { toast(w, "Meera has 18h free next week"); later(w, 1500, function () { hideCursor(w); }); });
  } };
  WX.result = { every: 7000, first: 2600, loop: function (w) {
    clickOn(w, btn(w, /Assign to Meera/), function () { toast(w, "Assigned to Meera · 6h"); later(w, 1500, function () { hideCursor(w); }); });
  } };
  WX.secure = {
    every: 6500,
    enter: function (w) { WX.secure.loop(w); },
    settle: function (w) { $$(".su-code span:not(.cur)", w).forEach(function (d) { if (d._v) d.textContent = d._v; }); w.classList.remove("verifying"); },
    loop: function (w) {
      var ds = $$(".su-code span:not(.cur)", w);
      ds.forEach(function (d) { d._v = d._v || d.textContent; d.textContent = ""; });
      w.classList.remove("verified");
      ds.forEach(function (d, i) { later(w, 350 + i * 220, function () { d.textContent = d._v; d.classList.remove("pop"); void d.offsetWidth; d.classList.add("pop"); }); });
      later(w, 350 + ds.length * 220 + 200, function () { w.classList.add("verified"); });
    }
  };
  WX.board = { every: 7000, first: 2200, loop: function (w) {
    var cols = $$(".bcol", w), card = $(".bcard.mover", w) || $$(".bcard", cols[1] || w).filter(function (c) { return !c.classList.contains("hi"); })[0];
    if (!card || cols.length < 3 || !cols[2].offsetParent) return;
    card.classList.add("mover");
    var dest = card.parentElement === cols[2] ? cols[1] : cols[2];
    clickOn(w, card, function () {
      var first = card.getBoundingClientRect();
      var head = $(".bh", dest);
      head.insertAdjacentElement("afterend", card);
      var last = card.getBoundingClientRect(), dx = first.left - last.left, dy = first.top - last.top;
      card.animate([{ transform: "translate(" + dx + "px," + dy + "px) rotate(-2deg)", boxShadow: "var(--shadow-lg)" }, { transform: "none" }], { duration: 650, easing: "cubic-bezier(.22,1,.36,1)" });
      var c = w._cur, cx = c._x - dx, cy = c._y - dy;
      c.animate([{ transform: "translate(" + c._x + "px," + c._y + "px) scale(.8)" }, { transform: "translate(" + (c._x - dx) + "px," + (c._y - dy) + "px) scale(.8)" }], { duration: 650, easing: "cubic-bezier(.22,1,.36,1)" });
      c._x = cx - 0; c._y = cy; c.style.transform = "translate(" + c._x + "px," + c._y + "px)";
      cols.forEach(function (col) { var em = $(".bh em", col); if (em) em.textContent = $$(".bcard", col).length + (col === cols[0] ? 1 : col === cols[2] ? 4 : 0); });
      later(w, 1200, function () { hideCursor(w); });
    });
  } };
  WX.leave = {
    every: 7500, first: 2200,
    settle: function (w) { var t = $(".lf-t .tg", w); if (t) t.classList.remove("on"); var l = $(".lf-t .muted", w); if (l) l.textContent = "Full days"; },
    loop: function (w) {
      var t = $(".lf-t .tg", w), l = $(".lf-t .muted", w);
      clickOn(w, t, function () { t.classList.add("on"); if (l) l.textContent = "Wed afternoon off"; });
      later(w, 1900, function () { clickOn(w, btn(w, /Send request/), function () { toast(w, "Sent to your manager"); }); });
      later(w, 4300, function () { hideCursor(w); });
      later(w, 6200, function () { WX.leave.settle(w); });
    }
  };
  WX.draft = {
    every: 11000, first: 4200,
    enter: function (w) { var p = $(".type-me", w); if (p) typeWords(p, 32); },
    settle: function (w) { var pill = $(".pw-head .pill", w); if (pill) { pill.textContent = "Not sent"; pill.classList.remove("pill-ok"); } },
    loop: function (w) {
      var pill = $(".pw-head .pill", w);
      clickOn(w, btn(w, /^Send$/), function () {
        if (pill) { pill.textContent = "Sent"; pill.classList.add("pill-ok"); }
        toast(w, "Sent · a copy is in the email log");
      });
      later(w, 2600, function () { hideCursor(w); });
      later(w, 5200, function () { WX.draft.settle(w); var p = $(".type-me", w); if (p) typeWords(p, 32); });
    }
  };
  WX.auto = {
    every: 4200, first: 2000,
    settle: function (w) { var t = $$(".lr .tg", w)[2]; if (t) t.classList.remove("on"); var f = $(".pw-foot b", w); if (f) f.textContent = "3 of 4 on"; },
    loop: function (w) {
      var t = $$(".lr .tg", w)[2], f = $(".pw-foot b", w); if (!t) return;
      var on = !t.classList.contains("on");
      t.classList.toggle("on", on);
      if (f) f.textContent = (on ? 4 : 3) + " of 4 on";
    }
  };
  WX.company = {
    every: 4200, first: 2400,
    loop: function (w) {
      var rows = $$(".lr", w); if (rows.length < 2) return;
      var a = rows[0].lastElementChild, b = rows[1].lastElementChild;
      var cur = $(".pill-brand", w), next = cur === a ? b : a, other = cur === a ? a : b;
      other.className = "muted xs"; other.textContent = "Switch";
      next.className = "pill pill-brand w-pop"; next.textContent = "Current";
      rows.forEach(function (r) { r.classList.toggle("cur", r.contains(next)); });
    }
  };
  WX.editor = { every: 6000, enter: function () { typeCell(); }, loop: function () { typeCell(); } };
  WX.who = { every: 2400, loop: function (w) {
    var items = $$(".who-item", w), k = ((w._k == null ? -1 : w._k) + 1) % items.length; w._k = k;
    items.forEach(function (it, i) { it.classList.toggle("hot", i === k); });
  }, settle: function (w) { $$(".who-item", w).forEach(function (it) { it.classList.remove("hot"); }); } };
  WX.minilist = { every: 2600, loop: function (w) {
    var items = $$("span", w), k = ((w._k == null ? 0 : w._k) + 1) % items.length; w._k = k;
    items.forEach(function (it, i) { it.classList.toggle("on", i === k); });
  } };
  WX.flow = { enter: function (w) {
    $$(".wires .w:not(.hot)", w).forEach(function (p, i) {
      var len = p.getTotalLength ? p.getTotalLength() : 0; if (!len) return;
      p.animate([{ strokeDasharray: len, strokeDashoffset: len }, { strokeDasharray: len, strokeDashoffset: 0 }], { duration: 900, delay: 200 + i * 90, easing: "cubic-bezier(.22,1,.36,1)", fill: "backwards" });
    });
  } };
  WX.bench = { enter: function () {
    if (!range || range._touched || range._auto) return;
    range._auto = true;
    var to = +range.value, v = 0;
    range.value = 0; renderWeek();
    var t = setInterval(function () {
      if (range._touched) { clearInterval(t); return; }
      range.value = ++v; renderWeek();
      if (v >= to) clearInterval(t);
    }, 90);
  } };

  if (motion) {
    widgets.forEach(function (w) { number(w); w.classList.add("wx"); });
    var wio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { e.target._vis = e.isIntersecting; sync(e.target); });
    }, { threshold: 0.2 });
    widgets.forEach(function (w) { wio.observe(w); });
    document.addEventListener("visibilitychange", function () { if (!document.hidden) widgets.forEach(sync); });
  } else if (typed) typed.textContent = typed.dataset.text;

  // numbers outside a widget count up on their own
  var looseCu = $$(".cu").filter(function (el) { return !el.closest("[data-w]"); });
  if (motion) {
    var lio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { lio.unobserve(e.target); countUp(e.target, 1200); } });
    }, { threshold: 0.6 });
    looseCu.forEach(function (el) { lio.observe(el); });
  }

  /* ======================================================================
     Scrollytelling: the steps scroll by while the stage stays put and swaps to
     the matching mock-up. Each step fills its own segment of the progress bar.
     On phones the stage is hidden and every step shows its own mock-up.
     ====================================================================== */
  $$("[data-scrolly]").forEach(function (sy) {
    var steps = $$(".sy-step", sy), panels = $$(".sy-stage > .panel", sy), segs = $$(".sy-seg", sy);
    var side = $(".sy-side", sy), count = $(".sy-count b", sy), cur = 0;
    function set(i) {
      if (i === cur) return;
      var back = i < cur; cur = i;
      sy.classList.toggle("back", back);
      steps.forEach(function (s, k) { s.classList.toggle("on", k === i); });
      segs.forEach(function (s, k) { s.classList.toggle("on", k === i); s.classList.toggle("done", k < i); });
      if (count) { count.textContent = i + 1; count.classList.remove("tick"); void count.offsetWidth; count.classList.add("tick"); }
      panels.forEach(function (p, k) {
        var on = k === i; p.classList.toggle("show", on); p.classList.toggle("past", k < i);
        var w = $("[data-w]", p); if (w) { if (on) w._played = false; sync(w); }
      });
    }
    function update() {
      if (side.offsetParent === null) return;
      var mid = innerHeight * .5, act = 0;
      steps.forEach(function (s, k) {
        var r = s.getBoundingClientRect();
        if (r.top <= mid) act = k;
        if (segs[k]) segs[k].style.setProperty("--p", Math.max(0, Math.min(1, (mid - r.top) / r.height)).toFixed(3));
      });
      set(act);
    }
    segs.forEach(function (b, k) {
      b.addEventListener("click", function () {
        var r = steps[k].getBoundingClientRect();
        scrollTo({ top: scrollY + r.top + r.height / 2 - innerHeight / 2, behavior: reduce ? "auto" : "smooth" });
      });
    });
    var tk = false;
    addEventListener("scroll", function () { if (!tk) { tk = true; requestAnimationFrame(function () { update(); tk = false; }); } }, { passive: true });
    addEventListener("resize", update);
    update();
  });
})();
