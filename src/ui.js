// DOM UI: top bar (clock, speeds, save/load/new, seed), info panel, event log with tabs, bottom sheet on phones,
// canvas fit, and map input (wheel/pinch/+- zoom in whole steps, drag pan, tap to select).
(function (G) {
  const $ = id => document.getElementById(id), UI = {};
  const bar = (v, max, cls) => '<div class="bar ' + (cls || "") + '"><i style="width:' + Math.max(0, Math.min(100, v / max * 100)).toFixed(1) + '%"></i></div>';
  const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  const LC = () => G.data.config.log, ZC = () => G.data.config.render.zoom;
  const kindOf = text => { for (const k of LC().kinds || []) if (new RegExp(k.match, "i").test(text)) return k.kind; return "info"; };
  UI.tab = "all";
  const waterKnown = a => { const k = [...new Set(Object.values(a.knowledge.water || {}))].sort(); return k.length ? "the " + k.join(" and the ") : "no water yet"; };
  const inTab = text => { const T = LC().tabs || [], t = T.find(x => x.key === UI.tab); if (!t) return true;
    if (t.rest) return !T.some(x => x.match && new RegExp(x.match, "i").test(text)); // "rest" tab: lines no other tab claims
    return !t.match || new RegExp(t.match, "i").test(text); };
  const isSheet = () => getComputedStyle($("side")).position === "fixed"; // phone landscape: collapsible bottom sheet

  UI.openSheet = function (open) { const s = $("side"); s.classList.toggle("open", !!open); $("sheet-handle").setAttribute("aria-expanded", !!open); $("sheet-arrow").textContent = open ? "▼" : "▲"; };

  function initMap(app) {
    const cv = $("cv"), R = G.Render, pts = new Map(); let press = null, pinch = null, wheelAcc = 0;
    const zoomUI = () => { $("zoom-in").disabled = R.view.z >= ZC().max; $("zoom-out").disabled = R.view.z <= 1; };
    UI.zoomUI = zoomUI;
    $("zoom-in").onclick = () => { R.zoomBy(1); zoomUI(); };
    $("zoom-out").onclick = () => { R.zoomBy(-1); zoomUI(); };
    cv.addEventListener("wheel", e => { // whole-number steps around the cursor; trackpads accumulate small deltas
      e.preventDefault(); wheelAcc += e.deltaMode ? e.deltaY * 40 : e.deltaY;
      if (Math.abs(wheelAcc) < ZC().wheelStep) return;
      const f = R.frac(e.clientX, e.clientY); R.zoomBy(wheelAcc < 0 ? 1 : -1, f.fx, f.fy); wheelAcc = 0; zoomUI();
    }, { passive: false });
    cv.addEventListener("pointerdown", e => {
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
      if (e.isPrimary) { pts.clear(); pinch = null; }   // a primary pointer starts a new gesture: drop any pointer whose up/cancel never arrived
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) press = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, pan: false };
      else if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1 }; press = null; }
    });
    cv.addEventListener("pointermove", e => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size >= 2) { // pinch: one whole zoom step each time the finger distance changes by pinchStep
        const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), f = R.frac((a.x + b.x) / 2, (a.y + b.y) / 2), k = ZC().pinchStep;
        if (d / pinch.d >= k) { R.zoomBy(1, f.fx, f.fy); pinch.d = d; zoomUI(); } else if (pinch.d / d >= k) { R.zoomBy(-1, f.fx, f.fy); pinch.d = d; zoomUI(); }
        return;
      }
      if (!press || press.id !== e.pointerId) return;
      if (!press.pan && Math.hypot(e.clientX - press.x0, e.clientY - press.y0) >= ZC().tapSlop) { press.pan = true; cv.classList.add("panning"); }
      if (press.pan) { R.panBy(e.clientX - press.x, e.clientY - press.y); }
      press.x = e.clientX; press.y = e.clientY;
    });
    const up = e => {
      if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
      if (press && press.id === e.pointerId) {
        if (!press.pan && e.type === "pointerup") { const t = R.toTile(press.x0, press.y0); app.clickTile(t.x, t.y); } // under tapSlop px = a tap
        press = null; cv.classList.remove("panning");
      }
      if (pts.size < 2) pinch = null;
    };
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    zoomUI();
  }

  UI.init = function (app) {
    const sp = $("speeds");
    G.data.config.time.speeds.forEach(s => { const b = document.createElement("button"); b.textContent = s ? s + "x" : "Pause"; b.dataset.speed = s; b.id = "speed-" + s; b.title = (s ? s + "x speed" : "Pause") + " (key " + G.data.config.time.speeds.indexOf(s) + (s ? ")" : ", Space toggles)"); b.onclick = () => app.setSpeed(s); sp.appendChild(b); });
    const tabs = $("tabs");
    (LC().tabs || []).forEach(t => { const b = document.createElement("button"); b.textContent = t.label; b.id = "tab-" + t.key; b.setAttribute("role", "tab"); b.onclick = () => { UI.tab = t.key; UI._logKey = null; UI.update(app); }; tabs.appendChild(b); });
    $("btn-save").onclick = () => app.save(true);
    $("btn-load").onclick = () => app.load();
    $("btn-new").onclick = () => app.newWorld($("seed").value);
    $("btn-menu").onclick = () => { const o = $("top").classList.toggle("menu-open"); $("btn-menu").setAttribute("aria-expanded", o); };
    document.addEventListener("pointerdown", e => { if (!$("top").contains(e.target)) { $("top").classList.remove("menu-open"); $("btn-menu").setAttribute("aria-expanded", false); } });
    $("seed").addEventListener("keydown", e => { if (e.key === "Enter") app.newWorld($("seed").value); e.stopPropagation(); });
    $("info-close").onclick = () => app.select(null);
    $("sheet-handle").onclick = () => UI.openSheet(!$("side").classList.contains("open"));
    initMap(app);
    window.addEventListener("keydown", e => { if (e.code === "Space") { app.setSpeed(app.speed ? 0 : (app.lastSpeed || 1)); e.preventDefault(); }
      const sp = G.data.config.time.speeds, n = /^[0-9]$/.test(e.key) ? +e.key : -1; if (n >= 0 && n < sp.length) app.setSpeed(sp[n]); }); // 0 pause, 1 = 1x, 2 = 10x, 3 = 60x
    window.addEventListener("resize", UI.fit); UI.fit();
  };
  UI.fit = function () { // largest map-shaped (3:2) canvas that fits the stage; the canvas backing size stays fixed (crisp, pixelated)
    const st = $("stage"), cv = $("cv"), M = G.data.config.map, portrait = innerHeight > innerWidth, pad = 12;
    const k = Math.min((st.clientWidth - pad) / M.w, ((portrait ? innerHeight * 0.6 : st.clientHeight) - pad) / M.h);
    cv.style.width = Math.floor(M.w * k) + "px"; cv.style.height = Math.floor(M.h * k) + "px";
  };
  UI.toast = function (t) { const el = $("toast"); el.textContent = t; el.style.opacity = 1; clearTimeout(UI._tt); UI._tt = setTimeout(() => el.style.opacity = 0, 1600); };

  UI.update = function (app) {
    const sim = app.sim, c = G.Time.at(sim.tick);
    $("clock").textContent = "Year " + c.year + " · " + c.season + " " + c.dayOfSeason + " · Day " + c.day + " · " + G.Time.hhmm(c);
    $("seedshow").textContent = "seed " + sim.seed;
    document.querySelectorAll("#speeds button").forEach(b => { const on = +b.dataset.speed === app.speed; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    document.querySelectorAll("#tabs button").forEach(b => { const on = b.id === "tab-" + UI.tab; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    const a = sim.agents.find(q => q.id === app.selected), info = $("info");
    info.hidden = !a;
    if (a) {
      const A = G.Agent, PC = G.data.config.person, known = Object.keys(a.knowledge.bushes).length, n = a.needs;
      const need = (label, v, cls, word, tip) => '<div class="row need" title="' + tip + '"><span>' + label + '</span>' + bar(v, 100, cls).replace('</div>', '<em>' + word + '</em></div>') + '<b>' + Math.round(v) + '/100</b></div>';
      $("info-body").innerHTML = '<h3>' + esc(a.name) + '</h3><div class="sub">' + Math.floor(a.age) + ' years · ' + A.doing(a) + '</div>' +
        '<div class="sec">Needs (0-100, full = good)</div>' +
        need("Fullness", n.fullness, n.fullness < A.fullnessThreshold(a) ? "hot" : "", A.fullnessWord(n.fullness), "100 = stuffed, " + PC.fullness.mealFillTo + " = full after a meal; eats below " + A.fullnessThreshold(a) + "; 0 = starving") +
        need("Water", n.water, n.water < A.waterThreshold(a) ? "hot" : "water", A.waterWord(n.water), "100 = just drank; drinks below " + A.waterThreshold(a) + "; 0 = parched") +
        need("Energy", n.energy, n.energy < 25 ? "hot" : "energy", n.energy <= 0 ? "exhausted" : n.energy < PC.energy.sleepBelow ? "tired" : "rested", "100 = rested; sleeps after dusk under " + PC.energy.sleepBelow) +
        (a.act.type === "sleep" ? '<div class="sub">asleep since ' + G.Time.hhmm(G.Time.at(a.act.since)) + '</div>' : '') +
        '<div class="sec">Traits (0-100, 50 = avg)</div>' + Object.entries(a.traits).map(([k, v]) => '<div class="row" title="' + esc(G.data.config.person.traits[k] || "") + '"><span>' + k + '</span>' + bar(v, 100, "trait") + '<b>' + Math.round(v) + '/100</b></div>').join("") +
        '<div class="sec">Knows</div><div class="sub">' + known + ' berry bush' + (known === 1 ? "" : "es") + ' · ' + waterKnown(a) + '</div>' +
        '<div class="sub">' + a.stats.meals + ' meal' + (a.stats.meals === 1 ? "" : "s") + ' · ' + (a.stats.drinks || 0) + ' drink' + (a.stats.drinks === 1 ? "" : "s") + ' · ' + (a.stats.sleeps || 0) + ' sleep' + (a.stats.sleeps === 1 ? "" : "s") + '</div>';
    }
    const last = sim.log[sim.log.length - 1], key = UI.tab + "|" + sim.log.length + "|" + (last && last.t) + "|" + (last && last.text);
    if (UI._logKey !== key) {
      UI._logKey = key;
      const rows = sim.log.filter(e => inTab(e.text)).slice(-40).reverse();
      $("log").innerHTML = rows.length ? rows.map(e => '<div class="ev ' + kindOf(e.text) + '"><time>' + G.Time.stamp(e.t) + '</time>' + esc(e.text) + '</div>').join("") : '<div class="empty">Nothing here yet.</div>';
      $("sheet-peek").textContent = last ? G.Time.stamp(last.t) + "  " + last.text : "Log";
    }
    if (UI.zoomUI) UI.zoomUI();
  };
  G.UI = UI;
})(this.GS = this.GS || {});
