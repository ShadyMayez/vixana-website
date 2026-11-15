// The hero's moving picture, drawn on a canvas: white lines flow in from every side of the screen (many models),
// gather into the tines of the V and run down to its point (one answer). The V then turns solid and the rest of the
// name wipes in (CSS, timed to match). Afterwards the lines stay, faint, and light keeps travelling along them into
// the V. With reduced motion, or with this script missing, the page shows the finished picture or the plain name.
(function () {
  "use strict";

  var hero = document.querySelector(".hero");
  var canvas = hero && hero.querySelector(".hero-flow");
  var word = hero && hero.querySelector(".statement-word");
  if (!canvas || !word || !canvas.getContext || !word.getAttribute("data-v")) return;

  var ctx = canvas.getContext("2d");
  var motion = document.documentElement.classList.contains("motion");
  var V = word.getAttribute("data-v").split(" ").map(Number); // left edge, width, arm, slit (viewBox units)
  var VB = word.viewBox.baseVal;

  // timeline, seconds from the start of the CSS sequence
  var DRAW_FROM = 0.15, DRAW_SPREAD = 1.0, DRAW_TIME = 1.35; // each line draws itself in, staggered
  var DIM_AT = 3.0, DIM_TIME = 1.6, DIM_TO = 0.32;             // then the lines outside the V step back
  var PULSES_AT = 3.3;                                          // and light starts to travel along them

  var W = 0, H = 0, lines = [], pulses = [], P = { x: 0, y: 0 }, glow = 0;
  var pointer = null, inside = false, lamp = 0; // the visitor's pointer, and how far its light has come up
  var t0 = null, last = 0, raf = 0, visible = true;

  function random(seed) { // a fixed sequence, so the picture is the same on every visit
    return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  }

  function bezier(a, b, c, d, t) {
    var u = 1 - t;
    return {
      x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
      y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
    };
  }

  // one line: from a start S off the screen, curving in, entering the V's top at T along the tine, down to P
  function makeLine(T, side, rnd) {
    var r = rnd(), S;
    if (r < 0.42) S = { x: side ? W + 40 : -40, y: H * (0.04 + 0.92 * rnd()) };                 // from the side
    else if (r < 0.8) S = { x: side ? W * (0.3 + 0.7 * rnd()) : W * 0.5 * rnd(), y: -40 };      // from the top
    else S = { x: side ? W * (0.45 + 0.55 * rnd()) : W * 0.4 * rnd(), y: H + 40 };              // from below
    var dx = P.x - T.x, dy = P.y - T.y, dl = Math.hypot(dx, dy);
    var dir = { x: dx / dl, y: dy / dl };
    var reach = Math.hypot(T.x - S.x, T.y - S.y);
    var c2 = { x: T.x - dir.x * (0.32 * reach + 30), y: T.y - dir.y * (0.32 * reach + 30) };
    var bend = (rnd() - 0.5) * 0.55 * reach;
    var c1 = { x: S.x + (c2.x - S.x) * 0.35 - (c2.y - S.y) / reach * bend,
               y: S.y + (c2.y - S.y) * 0.35 + (c2.x - S.x) / reach * bend };
    var pts = [], n = 56, i;
    for (i = 0; i <= n; i++) pts.push(bezier(S, c1, c2, T, i / n));
    for (i = 1; i <= 10; i++) pts.push({ x: T.x + dx * i / 10, y: T.y + dy * i / 10 });
    var cum = [0];
    for (i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    return {
      pts: pts, cum: cum, len: cum[cum.length - 1], inV: cum[n] / cum[cum.length - 1],
      delay: DRAW_FROM + DRAW_SPREAD * rnd(), alpha: 0.32 + 0.5 * rnd(), width: 0.55 + 0.6 * rnd(),
    };
  }

  function layout() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var hr = hero.getBoundingClientRect(), wr = word.getBoundingClientRect();
    W = hr.width; H = hr.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var k = wr.width / VB.width, left = wr.left - hr.left + V[0] * k, top = wr.top - hr.top;
    var vw = V[1] * k, arm = V[2] * k, slit = V[3] * k;
    P = { x: left + vw / 2, y: top + VB.height * k };
    var rnd = random(11), step = Math.max(1.7, arm / 21);
    lines = [];
    for (var side = 0; side < 2; side++) {
      for (var a = step / 2; a < arm; a += step) {
        // leave the two slits open, so the tines show while the V is still only lines
        if (Math.abs(a - arm / 3) < slit / 2 + step * 0.35 || Math.abs(a - 2 * arm / 3) < slit / 2 + step * 0.35) continue;
        var T = { x: side ? left + vw - a : left + a, y: top };
        lines.push(makeLine(T, side, rnd), makeLine(T, side, rnd));
      }
    }
  }

  function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function clamp(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  function pointAt(line, d) { // the point at distance d along a line
    var cum = line.cum, lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (cum[mid] < d) lo = mid; else hi = mid; }
    var f = (d - cum[lo]) / ((cum[hi] - cum[lo]) || 1), a = line.pts[lo], b = line.pts[hi];
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, i: hi };
  }

  function strokeTo(line, d) {
    var pts = line.pts, end = pointAt(line, d);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < end.i; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    return end;
  }

  function draw(t, dt) {
    ctx.clearRect(0, 0, W, H);
    var dim = 1 - (1 - DIM_TO) * ease(clamp((t - DIM_AT) / DIM_TIME));
    ctx.lineCap = "round";
    for (var i = 0; i < lines.length; i++) {
      var L = lines[i], p = ease(clamp((t - L.delay) / DRAW_TIME));
      if (p <= 0) continue;
      ctx.strokeStyle = "rgba(255,255,255," + (L.alpha * dim).toFixed(3) + ")";
      ctx.lineWidth = L.width;
      var tip = strokeTo(L, p * L.len);
      if (p < 1) { // the drawing tip glows while it travels
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath(); ctx.arc(tip.x, tip.y, 1.4, 0, 6.2832); ctx.fill();
      }
    }
    if (!motion || t < PULSES_AT) return;
    // the pointer carries a soft light: the lines near it brighten
    lamp += ((inside ? 1 : 0) - lamp) * Math.min(1, dt * 4);
    if (lamp > 0.01 && pointer) {
      var lg = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 220);
      lg.addColorStop(0, "rgba(255,255,255," + (0.75 * lamp).toFixed(3) + ")");
      lg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.strokeStyle = lg;
      ctx.lineWidth = 1;
      for (var m = 0; m < lines.length; m++) strokeTo(lines[m], lines[m].len);
    }
    // light travelling into the V
    if (pulses.length < 26 && Math.random() < dt * 9) {
      pulses.push({ line: lines[(Math.random() * lines.length) | 0], s: 0, speed: 0.34 + Math.random() * 0.22 });
    }
    ctx.lineWidth = 1.3;
    for (var j = pulses.length - 1; j >= 0; j--) {
      var q = pulses[j], Lq = q.line;
      q.s += dt * q.speed;
      var head = q.s * Lq.len;
      if (q.s >= Lq.inV) { pulses.splice(j, 1); glow = Math.min(1, glow + 0.22); continue; }
      for (var seg = 0; seg < 6; seg++) {
        var a = pointAt(Lq, Math.max(0, head - (seg + 1) * 12)), b = pointAt(Lq, Math.max(0, head - seg * 12));
        ctx.strokeStyle = "rgba(255,255,255," + (0.85 * (1 - seg / 6)).toFixed(3) + ")";
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    // the V's point brightens a little as light arrives
    glow *= Math.pow(0.25, dt);
    if (glow > 0.01) {
      var g = ctx.createRadialGradient(P.x, P.y, 0, P.x, P.y, 46);
      g.addColorStop(0, "rgba(255,255,255," + (0.22 * glow).toFixed(3) + ")");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(P.x - 46, P.y - 46, 92, 92);
    }
  }

  function frame(now) {
    raf = 0;
    if (t0 === null) t0 = now;
    var t = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    draw(t, dt);
    if (visible) raf = requestAnimationFrame(frame);
  }

  function start() {
    // start the clock with the CSS sequence, so the lines reach the V as it turns solid
    var anim = word.querySelector(".word-v");
    var running = anim && anim.getAnimations ? anim.getAnimations()[0] : null;
    t0 = running && running.startTime != null ? running.startTime : null;
    if (motion) raf = requestAnimationFrame(frame);
    else draw(DIM_AT + DIM_TIME, 0); // the finished picture, still
  }

  layout();
  start();

  var pending = 0;
  function relayout() {
    if (pending) return;
    pending = requestAnimationFrame(function () {
      pending = 0;
      layout();
      pulses = [];
      if (!motion) draw(DIM_AT + DIM_TIME, 0);
    });
  }
  if (window.ResizeObserver) new ResizeObserver(relayout).observe(hero);
  else window.addEventListener("resize", relayout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);

  // the pointer's light, for mouse and pen (a finger has no hover)
  if (motion && window.matchMedia("(hover: hover)").matches) {
    hero.addEventListener("pointermove", function (e) {
      var r = hero.getBoundingClientRect();
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
      inside = true;
    });
    hero.addEventListener("pointerleave", function () { inside = false; });
  }

  // rest when the hero is off the screen or the tab is hidden
  function setVisible(v) {
    visible = v;
    if (v && motion && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) { setVisible(entries[0].isIntersecting && !document.hidden); }).observe(hero);
  }
  document.addEventListener("visibilitychange", function () { setVisible(!document.hidden); });
})();
