// DOM UI: top bar (clock, speeds, save/load/new, seed), info panel, event log with tabs, bottom sheet on phones,
// canvas fit, and map input (wheel/pinch/+- zoom in whole steps, drag pan, tap to select).
(function (G) {
  const $ = id => document.getElementById(id), UI = {};
  const bar = (v, max, cls) => '<div class="bar ' + (cls || "") + '"><i style="width:' + Math.max(0, Math.min(100, v / max * 100)).toFixed(1) + '%"></i></div>';
  const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  const LC = () => G.data.config.log, ZC = () => G.data.config.render.zoom;
  const kindOf = text => { for (const k of LC().kinds || []) if (new RegExp(k.match, "i").test(text)) return k.kind; return "info"; };
  UI.tab = "all";
  UI.personTab = "needs";   // v25: person card tab (Needs / Mind / Kin / Knows / Log); session only
  const waterKnown = a => { const k = [...new Set(Object.values(a.knowledge.water || {}))].sort(); return k.length ? "the " + k.join(" and the ") : "no water yet"; };
  const inTab = text => { const T = LC().tabs || [], t = T.find(x => x.key === UI.tab); if (!t) return true;
    if (t.rest) return (t.also && new RegExp(t.also, "i").test(text)) || !T.some(x => x.match && new RegExp(x.match, "i").test(text)); // "rest" tab: lines no other tab claims
    return !t.match || new RegExp(t.match, "i").test(text); };
  const isSheet = () => getComputedStyle($("side")).position === "fixed"; // phone landscape: collapsible bottom sheet

  // phone landscape sheet; its open/closed state is kept in localStorage godsim.ui (sheet) like the Log tab (panel). restore = boot, don't re-save.
  UI.openSheet = function (open, restore) { const s = $("side"); s.classList.toggle("open", !!open); $("sheet-handle").setAttribute("aria-expanded", !!open); $("sheet-arrow").textContent = open ? "▼" : "▲";
    if (!restore) savePrefs(Object.assign(prefs(), { sheet: !!open })); UI.layout(); };
  // Any open panel (UI.panel != null: Log or Discoveries) and the inspect card decide how much room the map gets. The panel area sits above the bottom tab bar:
  // body.log-off = no panel open; #side.bare / body.side-off = nothing to show, the panel area goes away; #side.solo = only one of card/panel.
  // Refits the canvas whenever that, the sheet or the window size changes.
  UI.layout = function () {
    const side = $("side"); if (!side || UI.panel === undefined) return;
    const on = UI.panel != null, info = !$("info").hidden, bare = !on && !info, open = side.classList.contains("open");
    const k = on + "|" + info + "|" + open + "|" + UC().panels.map(p => UI.panelEl(p).classList.contains("closed")).join() + "|" + innerWidth + "x" + innerHeight; if (k === UI._layKey) return; UI._layKey = k;
    const pb = $("panelbar"); if (pb) document.documentElement.style.setProperty("--pbh", Math.max(0, innerHeight - pb.getBoundingClientRect().top) + "px");   // v19: the phone power row sits on the bar
    document.body.classList.toggle("log-off", !on); document.body.classList.toggle("side-off", bare);
    side.classList.toggle("bare", bare); side.classList.toggle("solo", !(on && info));
    UI.fit();
  };

  // ---- bottom tab bar: built only from config.ui.panels (see data/config.js); each button opens/closes its panel above the bar ----
  UI.panelRender = {};   // optional per-panel fill functions: UI.panelRender[key] = (app, el) => {...}
  // the kit's 24px line icons (src/icons.js = data/ui/icons/*.svg), inlined so they take currentColor; decorative (the button has a label)
  UI.icon = name => { const s = name && G.icons && G.icons[name]; return s ? s.replace("<svg ", '<svg aria-hidden="true" focusable="false" data-icon="' + name + '" ') : ""; };
  const UC = () => G.data.config.ui;
  const prefs = () => { try { return JSON.parse(localStorage.getItem(UC().prefsKey)) || {}; } catch (e) { return {}; } };
  const savePrefs = p => { try { localStorage.setItem(UC().prefsKey, JSON.stringify(p)); } catch (e) { /* private mode: not remembered */ } };
  UI.panelEl = p => document.getElementById(p.el || "panel-" + p.key);
  function initPanels(app) {
    const bar = $("panelbar"), P = UC().panels, pr = prefs();
    UI.panel = "panel" in pr ? pr.panel : ((P.find(p => p.open) || {}).key || null);
    if (UI.panel && !P.some(p => p.key === UI.panel)) UI.panel = null;
    P.forEach(p => {
      if (!UI.panelEl(p)) { const d = document.createElement("div"); d.id = "panel-" + p.key; d.className = "panel"; $("side").appendChild(d); }
      const b = document.createElement("button"); b.innerHTML = UI.icon(p.icon) + '<span class="lbl">' + esc(p.label) + '</span>'; b.id = "ptab-" + p.key; b.setAttribute("role", "tab"); b.setAttribute("aria-label", p.label); b.title = p.label;
      b.onclick = () => { UI.panel = UI.panel === p.key ? null : p.key; savePrefs(Object.assign(prefs(), { panel: UI.panel })); UI._logKey = null;
        if (UI.panel && isSheet()) UI.openSheet(true);   // phone landscape: opening a panel opens the sheet above the bar (closing one with nothing inspected hides the sheet: #side.bare)
        UI.update(app); };
      bar.appendChild(b);
    });
    // v19: the Powers tab (shown only on portrait phones < 700px, by CSS): opens / closes the power row; highlighted while a power waits for its spot
    const PT = UC().powersTab; if (PT && $("powers")) { const b = document.createElement("button"); b.id = "ptab-powers"; b.innerHTML = UI.icon(PT.icon) + '<span class="lbl">' + esc(PT.label) + '</span>';
      b.setAttribute("aria-label", PT.label); b.title = PT.label; b.setAttribute("aria-expanded", "false"); b.setAttribute("aria-controls", "powers"); b.onclick = () => UI.powerRow(app, !UI.rowOpen()); bar.appendChild(b); }
  }
  UI.rowOpen = () => document.body.classList.contains("pw-open");
  UI.powerRow = function (app, open) { if (open && pickOpen()) showPick(false);   // v19: opening the row closes an open picker (it sits in the same spot)
    document.body.classList.toggle("pw-open", !!open); const b = $("ptab-powers"); if (b) { b.setAttribute("aria-expanded", !!open); b.classList.toggle("on", !!open); } if (app) UI.updatePowers(app); };
  // ---- v19 (step 24) Find: centre the map on a person (zoom >= find.zoom), pulse their ring for find.pulseMs and follow them until a pan or a tap elsewhere.
  // On a phone an open panel (Log / People / ...) is closed first so the map gets the room. Works from the map card, the People tab and the Log (all open the same card).
  const phone = () => innerWidth <= 700 || innerHeight <= 500;
  UI.focusFrac = function () {   // the middle of the map part not under a card / sheet that floats over it (phones)
    const c = $("cv").getBoundingClientRect(); let top = c.top, bot = c.bottom;
    for (const id of ["info", "side"]) { const e = $(id); if (!e || e.hidden || getComputedStyle(e).position !== "fixed") continue; const r = e.getBoundingClientRect();
      if (r.height && r.top > c.top + 40 && r.top < bot && r.left < c.right && r.right > c.left) bot = r.top; }
    return { fx: 0.5, fy: c.height ? Math.max(0, Math.min(1, ((top + bot) / 2 - c.top) / c.height)) : 0.5 };
  };
  G.Render.focusFrac = UI.focusFrac;
  UI.find = function (app, id) {
    const a = app.sim.agents.find(q => q.id === id), F = UC().find, R = G.Render; if (!a || !F) return false;
    if (phone() && UI.panel != null) { UI.panel = null; UI._logKey = null; }   // not saved: the tab comes back as it was next time
    if (UI.rowOpen()) UI.powerRow(app, false);
    app.select(id);
    const f = UI.focusFrac(); R.centerOn(a.pos.x, a.pos.y, F.zoom, f.fx, f.fy); if (UI.zoomUI) UI.zoomUI();
    R.follow = id; R.pulse = { id, t0: performance.now(), ms: F.pulseMs }; return true;
  };
  // v36 §39: cycle list = same sort/filter as People tab (oldest→youngest); ← → on inspect card
  UI.peopleCycleList = function (sim) {
    let rows = (sim.agents || []).slice();
    if (UI.peopleFilter !== "all") rows = rows.filter(a => a.group === UI.peopleFilter);
    rows.sort((p, q) => q.age - p.age || p.id - q.id);
    return rows;
  };
  UI.cyclePerson = function (app, dir) {
    const list = UI.peopleCycleList(app.sim); if (!list.length) return false;
    let i = list.findIndex(a => a.id === app.selected);
    if (i < 0) i = dir > 0 ? -1 : 0;
    const n = list.length, j = ((i + (dir < 0 ? -1 : 1)) % n + n) % n;
    app.select(list[j].id); return true;
  };
  function updatePanels(app) {
    for (const p of UC().panels) { const on = UI.panel === p.key, el = UI.panelEl(p), b = $("ptab-" + p.key);
      el.classList.toggle("closed", !on); b.classList.toggle("on", on); b.setAttribute("aria-selected", on); b.setAttribute("aria-expanded", on);
      if (on && UI.panelRender[p.key]) UI.panelRender[p.key](app, el); }
  }

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
      if (!press.pan && Math.hypot(e.clientX - press.x0, e.clientY - press.y0) >= ZC().tapSlop) { press.pan = true; R.follow = null; cv.classList.add("panning"); }   // v19: a pan ends Find's follow
      if (press.pan) { R.panBy(e.clientX - press.x, e.clientY - press.y); }
      press.x = e.clientX; press.y = e.clientY;
    });
    const up = e => {
      if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
      if (press && press.id === e.pointerId) {
        if (!press.pan && e.type === "pointerup") { const t = R.toTile(press.x0, press.y0); R.follow = null;   // v19: so does a tap on the map
          if (UI.power) app.castPower(UI.power, Math.floor(t.x), Math.floor(t.y)); else app.clickTile(t.x, t.y); } // under tapSlop px = a tap (step 22: an armed power lands there)
        press = null; cv.classList.remove("panning");
      }
      if (pts.size < 2) pinch = null;
    };
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    zoomUI();
  }

  // ---- step 22 / 24: god powers bar. Tap a power (Rain / Lightning / Spawn open a picker first), then the map; tap again to cancel. No cooldowns. ----
  const PW = () => G.data.config.powers;
  UI.power = null;
  UI.spawnKind = null; UI.rainStr = null; UI.boltMode = null; UI.pickFor = null;
  function initPowers(app) {
    const box = $("powers"); if (!box || !PW()) return;
    // §40 / v37 item 8: labelled categories (config.powers.categories), icon + text label on every button, hint line under them
    const mk = k => { const b = document.createElement("button"), L = PW().labels[k];
      b.id = "power-" + k; b.className = "pw"; b.dataset.power = k; b.setAttribute("aria-pressed", "false"); b.title = L + ": " + ((PW().hints || {})[k] || "") + " (tap, then tap the map; tap again to cancel)";
      b.innerHTML = UI.icon(k) + '<span class="lbl">' + L + '</span><span class="cd"></span>'; b.onclick = () => UI.armPower(app, k); return b; };
    const cats = document.createElement("div"); cats.className = "pw-cats"; const done = {};
    for (const c of (PW().categories || [{ key: "all", label: "Powers", powers: PW().order }])) { const g = document.createElement("div"), row = document.createElement("div");
      g.className = "pw-cat"; g.id = "pwcat-" + c.key; g.setAttribute("role", "group"); g.setAttribute("aria-label", c.label);
      g.innerHTML = '<h4>' + c.label + '</h4>'; row.className = "pw-row"; for (const k of c.powers) if (PW().order.indexOf(k) >= 0) { row.appendChild(mk(k)); done[k] = 1; }
      g.appendChild(row); cats.appendChild(g); }
    const rest = PW().order.filter(k => !done[k]); if (rest.length) { const g = document.createElement("div"), row = document.createElement("div"); g.className = "pw-cat"; g.innerHTML = "<h4>Other</h4>"; row.className = "pw-row"; rest.forEach(k => row.appendChild(mk(k))); g.appendChild(row); cats.appendChild(g); }
    box.appendChild(cats); const hint = document.createElement("p"); hint.className = "pw-hint"; hint.id = "pw-hint"; hint.setAttribute("aria-live", "polite"); hint.textContent = "Pick a power"; box.appendChild(hint);
    // shared picker (Rain strengths / Lightning modes / Spawn kinds); id kept as spawnpick for the existing CSS
    const pk = document.createElement("div"); pk.id = "spawnpick"; pk.setAttribute("role", "group"); pk.setAttribute("aria-label", "power options"); pk.hidden = true;
    box.parentNode.appendChild(pk);
    const cv = $("cv");
    cv.addEventListener("pointermove", e => { if (!UI.power || e.pointerType === "touch") { G.Render.aim = null; return; }
      const t = G.Render.toTile(e.clientX, e.clientY), rAim = UI.power === "spawn" ? 0 : UI.power === "lightning" ? (UI.boltMode === "barrage" ? (PW().lightning.modes.barrage.scatterTiles || PW().radiusTiles) : 0) : PW().radiusTiles;
      G.Render.aim = { x: Math.floor(t.x), y: Math.floor(t.y), r: rAim }; });
    cv.addEventListener("pointerleave", () => { G.Render.aim = null; });
  }
  const pickOpen = () => { const p = $("spawnpick"); return !!p && !p.hidden; };
  const showPick = on => { const p = $("spawnpick"); if (p) p.hidden = !on; if (!on) UI.pickFor = null; };
  function fillPick(app, kind) {
    const pk = $("spawnpick"); if (!pk) return; pk.innerHTML = ""; UI.pickFor = kind;
    if (kind === "spawn") { const SP = PW().spawn; pk.setAttribute("aria-label", "spawn which animal");
      Object.keys(SP.kinds).forEach(k => { const b = document.createElement("button"), L = SP.kindLabels[k] || k; b.id = "spawn-" + k; b.dataset.kind = k; b.textContent = L; b.setAttribute("aria-label", "Spawn a " + L.toLowerCase());
        b.onclick = () => UI.pickSpawn(app, k); pk.appendChild(b); }); }
    else if (kind === "rain") { const R = PW().rain; pk.setAttribute("aria-label", "rain strength");
      (R.strengthOrder || Object.keys(R.strengths)).forEach(k => { const S = R.strengths[k], b = document.createElement("button"); b.id = "rain-" + k; b.dataset.str = k;
        b.innerHTML = UI.icon("rain_" + k) + '<span class="lbl">' + S.label + '</span>'; b.setAttribute("aria-label", "Rain: " + S.label);
        b.onclick = () => UI.pickRain(app, k); pk.appendChild(b); }); }
    else if (kind === "lightning") { const L = PW().lightning; pk.setAttribute("aria-label", "lightning mode");
      (L.modeOrder || Object.keys(L.modes)).forEach(k => { const M = L.modes[k], b = document.createElement("button"); b.id = "bolt-" + k; b.dataset.mode = k;
        b.innerHTML = UI.icon("bolt_" + k) + '<span class="lbl">' + M.label + '</span>'; b.setAttribute("aria-label", "Lightning: " + M.label);
        b.onclick = () => UI.pickBolt(app, k); pk.appendChild(b); }); }
    pk.hidden = false;
  }
  UI.armPower = function (app, k) {
    const L = PW().labels[k]; if (UI.rowOpen()) UI.powerRow(null, false);   // v19: picking a power closes the phone row
    if (UI.power === k || (pickOpen() && UI.pickFor === k)) { UI.power = null; showPick(false); G.Render.aim = null; UI.toast(L + " cancelled"); }
    else { showPick(false);
      if (k === "spawn" || k === "rain" || k === "lightning") { UI.power = null; fillPick(app, k);
        UI.toast(k === "spawn" ? "Spawn which animal?" : k === "rain" ? "Rain: Light, Medium or Heavy?" : "Lightning: Single bolt or Barrage?"); }
      else { UI.power = k; UI.toast("Tap the map: " + L); } }
    UI.updatePowers(app);
  };
  UI.pickSpawn = function (app, kind) { showPick(false); UI.spawnKind = kind; UI.power = "spawn"; UI.toast("Tap the land: " + (PW().spawn.kindLabels[kind] || kind)); UI.updatePowers(app); };
  UI.pickRain = function (app, str) { showPick(false); UI.rainStr = str; UI.power = "rain"; UI.toast("Tap the map: " + PW().rain.strengths[str].label + " rain"); UI.updatePowers(app); };
  UI.pickBolt = function (app, mode) { showPick(false); UI.boltMode = mode; UI.power = "lightning"; UI.toast("Tap the map: " + PW().lightning.modes[mode].label); UI.updatePowers(app); };
  UI.updatePowers = function (app) {
    if (!PW()) return; $("cv").classList.toggle("aiming", !!UI.power);
    const pt = $("ptab-powers"); if (pt) { const w = !!UI.power || pickOpen(); const wait = UI.power ? PW().labels[UI.power] + " waiting: tap the map" : UI.pickFor === "rain" ? "pick a rain strength" : UI.pickFor === "lightning" ? "pick a lightning mode" : "pick an animal";
      pt.classList.toggle("armed", w); pt.setAttribute("aria-label", UC().powersTab.label + (w ? ", " + wait : "")); }
    const hint = $("pw-hint"); if (hint) { const k = UI.power || (pickOpen() && UI.pickFor);
      hint.textContent = UI.power ? PW().labels[UI.power] + " waiting: tap " + (UI.power === "heal" ? "a person" : UI.power === "resurrect" ? "a body" : "the map")
        : k ? PW().labels[k] + ": pick an option" : "Pick a power"; }
    for (const k of PW().order) { const b = $("power-" + k); if (!b) continue; const on = UI.power === k, picking = pickOpen() && UI.pickFor === k;
      b.classList.toggle("on", on || picking); b.classList.remove("cooling"); b.setAttribute("aria-pressed", on);
      const cd = b.querySelector(".cd"); if (cd && cd.textContent) cd.textContent = "";
      b.setAttribute("aria-label", PW().labels[k] + (on ? ", tap the map" : picking ? ", pick an option" : "")); }
  };
  UI.init = function (app) {
    const sp = $("speeds");
    // §40 / v37: the Artist's body figure (parts coloured on the card); on file:// a fetch may fail and the plain figure image is shown instead
    try { const BF = G.data.config.bodyFigure; if (BF && typeof fetch === "function") fetch(BF.src).then(r => r.ok ? r.text() : null).then(t => { if (t) UI.bodySvg = t.replace(/<!--[\s\S]*?-->/g, "").trim(); }).catch(() => {}); } catch (e) {}
    document.querySelectorAll(".ico[data-icon]").forEach(el => { el.outerHTML = UI.icon(el.dataset.icon); });   // static buttons in index.html
    G.data.config.time.speeds.forEach((s, i) => { const b = document.createElement("button"); b.innerHTML = UI.icon(UC().speedIcons[i]) + '<span class="lbl">' + (s ? s + "x" : "Pause") + '</span>'; b.dataset.speed = s; b.setAttribute("aria-label", s ? s + "x speed" : "Pause"); b.id = "speed-" + s; b.title = (s ? s + "x speed" : "Pause") + " (key " + G.data.config.time.speeds.indexOf(s) + (s ? ")" : ", Space toggles)"); b.onclick = () => app.setSpeed(s); sp.appendChild(b); });
    const tabs = $("tabs");
    (LC().tabs || []).forEach(t => { const b = document.createElement("button"); b.textContent = t.label; b.id = "tab-" + t.key; b.setAttribute("role", "tab"); b.onclick = () => { UI.tab = t.key; UI._logKey = null; UI.update(app); }; tabs.appendChild(b); });
    $("btn-save").onclick = () => app.save(true);
    $("btn-load").onclick = () => app.load();
    $("btn-new").onclick = () => app.newWorld($("seed").value);
    $("btn-menu").onclick = () => { const o = $("top").classList.toggle("menu-open"); $("btn-menu").setAttribute("aria-expanded", o); };
    document.addEventListener("pointerdown", e => { if (!$("top").contains(e.target)) { $("top").classList.remove("menu-open"); $("btn-menu").setAttribute("aria-expanded", false); } });
    // step 19: Parents / Children / partner names on the card select that person (the card is rebuilt each update, so delegate on pointerup;
    // a keyboard press on the button arrives as a click with detail 0)
    const selLink = e => { const b = e.target.closest && e.target.closest("[data-sel]"); if (!b) return; e.preventDefault(); app.select(+b.dataset.sel); };
    $("info-body").addEventListener("pointerup", selLink); $("info-body").addEventListener("click", e => { if (e.detail === 0) selLink(e); });
    // v19: Find on the card; a person's name in the Log opens their card (same delegation: the log is rebuilt as lines arrive)
    const findLink = e => { const b = e.target.closest && e.target.closest("[data-find]"); if (!b) return; e.preventDefault(); UI.find(app, +b.dataset.find); };
    $("info-body").addEventListener("pointerup", findLink); $("info-body").addEventListener("click", e => { if (e.detail === 0) findLink(e); });
    // 26b: person-card tabs (Needs / Mind / Kin / Knows)
    const personTabLink = e => { const b = e.target.closest && e.target.closest("[data-ptab]"); if (!b) return; e.preventDefault();
      const k = b.getAttribute("data-ptab"); if (!k || k === UI.personTab) return; UI.personTab = k; UI._personCardKey = null; UI.update(app); };
    $("info-body").addEventListener("pointerup", personTabLink); $("info-body").addEventListener("click", e => { if (e.detail === 0) personTabLink(e); });
    // v36 §39: ← → on inspect card
    const cycleLink = e => { const b = e.target.closest && e.target.closest("[data-pcycle]"); if (!b) return; e.preventDefault(); UI.cyclePerson(app, +b.getAttribute("data-pcycle")); };
    $("info-body").addEventListener("pointerup", cycleLink); $("info-body").addEventListener("click", e => { if (e.detail === 0) cycleLink(e); });
    $("log").addEventListener("pointerup", selLink); $("log").addEventListener("click", e => { if (e.detail === 0) selLink(e); });
    $("seed").addEventListener("keydown", e => { if (e.key === "Enter") app.newWorld($("seed").value); e.stopPropagation(); });
    $("info-close").onclick = () => app.select(null);
    $("sheet-handle").onclick = () => { const o = !$("side").classList.contains("open");
      if (o && !UI.panel && $("info").hidden) { UI.panel = "log"; savePrefs(Object.assign(prefs(), { panel: "log" })); UI._logKey = null; }   // opening an empty sheet opens the Log
      UI.openSheet(o); UI.update(app); };
    initPanels(app); initPowers(app);
    if (isSheet() && prefs().sheet) UI.openSheet(true, true);
    initMap(app);
    window.addEventListener("keydown", e => { if (e.key === "Escape" && (UI.power || pickOpen())) { UI.armPower(app, UI.power || UI.pickFor || "spawn"); return; }
      if (e.key === "Escape" && UI.rowOpen()) { UI.powerRow(app, false); return; }
      if (e.code === "Space") { app.setSpeed(app.speed ? 0 : (app.lastSpeed || 1)); e.preventDefault(); }
      const sp = G.data.config.time.speeds, n = /^[0-9]$/.test(e.key) ? +e.key : -1; if (n >= 0 && n < sp.length) app.setSpeed(sp[n]); }); // 0 pause, 1 = 1x, 2 = 10x, 3 = 60x
    window.addEventListener("resize", UI.layout); UI.layout(); UI.fit();
  };
  // ---- person card helpers: trait names, experience scores (step 13-14), chips, and the personal log (.plog, only this person's events) ----
  const TRAIT = { speed: "Speed", appetite: "Appetite", curiosity: "Curiosity", coldFear: "Cold fear", fireFear: "Fire fear", faith: "Faith", corpseFear: "Corpse fear" };
  const EXP = { fire: "Fire", huddle: "Huddling", shelter: "Shelter" };
  const traitName = k => TRAIT[k] || k;
  const chip = (t, cls) => '<span class="chip' + (cls ? " " + cls : "") + '">' + t + '</span>';
  // step 18: group line + Relations (top 5 by familiarity; liking word warm 70+, neutral 40-69, wary under 40; the two numbers 0-100)
  // step 19: a clickable name (44 px tall), "(died)" when only a body is left; plain text when nothing is left at all
  // v19 (step 24): the Find button on a person's card (the kit's locate crosshair + "Find", 44px+); see UI.find
  const findBtn = a => { const F = UC().find; return F ? '<button class="findbtn" data-find="' + a.id + '" aria-label="' + esc(F.label) + ' ' + esc(a.name) + ' on the map" title="Centre the map on ' + esc(a.name) + ' and follow">' + UI.icon(F.icon) + '<span>' + esc(F.label) + '</span></button>' : ''; };
  // v19: the names of the people a log line is about (e.ids) become buttons that open their card (44px tap area, the line's look kept: theme in index.html)
  const reEsc = t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function logNames(sim, e) { let h = esc(e.text); if (!e.ids) return h;
    for (const id of e.ids) { const w = G.Family.who(sim, id); if (!w) continue; const n = esc(w.name);
      h = h.replace(new RegExp("(^|[^\\w>])(" + reEsc(n) + ")(?![\\w<])"), '$1<button class="logn" data-sel="' + w.id + '">$2</button>'); }
    return h; }
  function who(sim, id, name) { const w = G.Family.who(sim, id);
    if (!w) return '<span class="lnk-gone">' + esc(name || "?") + ' (gone)</span>';
    return '<button class="lnk" data-sel="' + w.id + '">' + esc(w.name) + (w.alive ? '' : ' (died)') + '</button>'; }
  function familyRows(sim, a) {
    const m = a.mate != null && sim.agents.find(q => q.id === a.mate), kids = a.children || [];
    return '<div class="sec">Family</div><div class="sub">' + G.Family.sexWord(a) + (a.preg ? ' · with child, due ' + G.Time.stamp(a.preg.due) : '') + '</div>' +
      '<div class="row fam"><span>Partner</span><div class="lnks">' + (m ? who(sim, m.id) : '<span class="dim">none</span>') + '</div></div>' +
      '<div class="row fam"><span>Parents</span><div class="lnks">' + (a.parents ? a.parents.map((id, i) => who(sim, id, a.parentNames && a.parentNames[i])).join("") : '<span class="dim">none (founder)</span>') + '</div></div>' +
      '<div class="row fam"><span>Children</span><div class="lnks">' + (kids.length ? kids.map(id => who(sim, id)).join("") : '<span class="dim">none</span>') + '</div></div>' +
      (G.Family.isChild(a) ? '<div class="row fam"><span>Keeps close to</span><div class="lnks">' + (a.guard != null ? who(sim, a.guard) : '<span class="dim">no one (on ' + G.Family.poss(a) + ' own)</span>') + '</div></div>' : '');
  }
  // step 20: "Learned from: Zol (fire), Lom (huddling)" - who she copied or watched, per action
  function learnedRow(sim, a) {
    const L = G.Learn.learnedFrom(a); if (!L.length) return '<div class="row fam learned"><span>Learned from</span><div class="lnks"><span class="dim">no one yet</span></div></div>';
    return '<div class="row fam learned"><span>Learned from</span><div class="lnks">' + L.map(x => { const w = G.Family.who(sim, x.from);
      return (w ? '<button class="lnk" data-sel="' + w.id + '" title="' + x.how + '">' + esc(w.name) + (w.alive ? '' : ' (died)') : '<span class="lnk-gone">' + esc(x.name)) + ' (' + esc(G.Learn.short(x.key)) + ')' + (w ? '</button>' : '</span>'); }).join("") + '</div></div>';
  }
  // traits; a baby's show ▲ / ▼ against the parents' average (a mutation is marked *)
  function traitRows(o) {
    const T = Object.entries(o.traits).map(([k, v]) => { const h = o.inh && o.inh[k], arr = h ? (v > h.avg ? ' ▲' : v < h.avg ? ' ▼' : ' =') + (h.mut ? '*' : '') : '';
      return '<div class="row" title="' + esc(G.data.config.person.traits[k] || "") + (h ? ' · parents\' average ' + Math.round(h.avg) : '') + '"><span>' + traitName(k) + '</span>' + bar(v, 100, "trait") + '<b>' + Math.round(v) + (arr || '/100') + '</b></div>'; }).join("");
    const L = o.inh && o.inh.lifespan;
    return T + (L ? '<div class="sub">lifespan ' + Math.round(L.v) + ' years' + (L.v > L.avg ? ' ▲' : L.v < L.avg ? ' ▼' : '') + (L.mut ? '*' : '') + ' (parents\' average ' + Math.round(L.avg) + ')</div>' : '');
  }
  function relRows(sim, a) {
    const S = G.Social, g = S.group(sim, a), top = S.top(sim, a);
    const speechLbl = G.Speech ? G.Speech.cardLabel(sim, a) : "Speech: none";
    const grp = g ? '<div class="row rel"><span><i class="ring" style="border-color:' + S.color(sim, g) + '"></i>' + esc(S.groupName(sim, g)) + '</span><b>' + g.members.length + ' people</b></div>' +
        '<div class="sub">keeps with ' + esc(g.members.filter(id => id !== a.id).map(id => (sim.agents.find(b => b.id === id) || {}).name).filter(Boolean).join(", ")) + ' · knows: ' + (S.skills(sim, g).map(k => esc(G.Learn.label(k))).join(", ") || "nothing yet") + ' · ' + esc(speechLbl) + '</div>'
      : '<div class="sub">no group · keeps to no one yet · ' + esc(speechLbl) + '</div>';
    return '<div class="sec">Relations (familiarity / liking, 0-100, 50 = avg liking)</div>' + grp +
      (top.length ? top.map(r => '<div class="row rel"><span>' + esc(r.name) + '</span><em class="w-' + r.word + '">' + r.word + '</em><b>' + r.f + ' / ' + r.l + '</b></div>').join("") : '<div class="sub">has met no one yet</div>');
  }
  function expRows(sim, a) {
    return Object.keys(G.data.config.learn.actions).map(k => { const e = a.exp && a.exp[k], v = e ? e.score : G.data.config.learn.start;
      const lbl = EXP[k] || k;
      const notes = e ? [e.n ? e.n + ' good time' + (e.n === 1 ? "" : "s") : '', e.burns ? 'burned ' + e.burns + '×' : '', e.copied ? 'copied from ' + esc(e.copied.name) : ''].filter(Boolean) : [];
      return '<div class="row exp" data-exp="' + k + '" title="' + esc(G.Learn.label(k)) + ': rises when it warmed her, drops sharply on a burn; copied from a nearby success"><span>' + lbl + '</span>' + bar(v, 100, v < 30 ? "hot" : "trait") + '<b>' + Math.round(v) + '/100</b></div>' +
        (notes.length ? '<div class="exp-note">' + notes.join(" · ") + '</div>' : ''); }).join("");
  }
  // v25: personal log HTML for the Log tab (no under-card strip)
  function plogHtml(sim, id) {
    if (id == null) return '<div class="empty">Nothing yet.</div>';
    const L = G.Sim.plogOf(sim, id);
    return L.length
      ? '<div class="plog in-tab" role="log">' + L.slice().reverse().map(e => '<div class="ev' + (e.k ? " " + e.k : "") + '"><time>' + G.Time.stamp(e.t) + '</time>' + esc(e.text) + '</div>').join("") + '</div>'
      : '<div class="empty">Nothing yet.</div>';
  }
  function hidePlogStrip() {
    const sec = $("plog-sec"), el = $("plog");
    if (sec) { sec.hidden = true; sec.textContent = ""; }
    if (el) { el.hidden = true; el.innerHTML = ""; }
    UI._plogKey = ""; UI._plogId = null;
  }
  UI.fit = function () { // largest map-shaped (3:2) canvas that fits the stage; the canvas backing size stays fixed (crisp, pixelated)
    const st = $("stage"), cv = $("cv"), M = G.data.config.map, portrait = innerHeight > innerWidth, pad = 12;
    // phone portrait with the Log closed: the canvas fills the freed stage and shows a full-height slice of the map (pan sideways)
    const sw = st.clientWidth - pad, sh = st.clientHeight - pad;
    if (document.body.classList.contains("log-off") && matchMedia("(max-width: 700px) and (orientation: portrait)").matches && sh > 0 && sw / sh < M.w / M.h) {
      cv.style.width = Math.floor(sw) + "px"; cv.style.height = Math.floor(sh) + "px"; G.Render.setViewport(Math.floor(sw) / Math.floor(sh)); return; }
    G.Render.setViewport(null);
    const k = Math.min((st.clientWidth - pad) / M.w, ((portrait ? innerHeight * 0.6 : st.clientHeight) - pad) / M.h);
    cv.style.width = Math.floor(M.w * k) + "px"; cv.style.height = Math.floor(M.h * k) + "px";
  };
  UI.toast = function (t) { const el = $("toast"); el.textContent = t; el.style.opacity = 1; clearTimeout(UI._tt); UI._tt = setTimeout(() => el.style.opacity = 0, 1600); };

  UI.update = function (app) {
    const sim = app.sim, c = G.Time.at(sim.tick);
    const ck = c.year + c.season + c.day + G.Time.hhmm(c) + Math.round(G.Climate.airC(sim.tick));
    if (UI._ck !== ck) { UI._ck = ck;   // phones drop the year and season name (span.wide) so the clock fits next to the World button
      $("clock").innerHTML = '<span class="wide">Year ' + c.year + ' · ' + c.season + ' ' + c.dayOfSeason + ' · </span>Day ' + c.day + ' · ' + G.Time.hhmm(c) + ' · ' + G.Time.tempF(G.Climate.airC(sim.tick)); }
    $("seedshow").textContent = "seed " + sim.seed; UI.updatePowers(app);
    document.querySelectorAll("#speeds button").forEach(b => { const on = +b.dataset.speed === app.speed; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    updatePanels(app);
    document.querySelectorAll("#tabs button").forEach(b => { const on = b.id === "tab-" + UI.tab; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    const a = sim.agents.find(q => q.id === app.selected), info = $("info");
    const an = !a && (sim.animals || []).find(q => q.id === app.selected);
    let bd = !a && !an && (sim.bodies || []).find(q => q.id === app.selected);
    const it = !a && !an && !bd && (sim.items || []).find(q => q.id === app.selected);
    if (!a && !an && !bd && app.selected != null) { bd = (sim.bodies || []).find(q => q.of === app.selected); if (bd) app.selected = bd.id; }   // the selected person died: follow to their body
    const bb = !a && !an && !bd && !it && G.Family && G.Family.babyById(sim, app.selected);   // step 19: a baby
    const sp = !a && !an && !bd && !it && !bb && G.Faith && G.Faith.byId(sim, app.selected);   // §33 sacred / prayer spot
    info.hidden = !a && !an && !bd && !it && !bb && !sp;
    info.classList.toggle("people-ui", !!a);   // v36 §39: Artist dense People inspect styles
    const need = (label, v, cls, word, tip) => '<div class="row need" title="' + tip + '"><span>' + label + '</span>' + bar(v, 100, cls).replace('</div>', '<em>' + word + '</em></div>') + '<b>' + Math.round(v) + '/100</b></div>';
    if (sp) {   // §33: sacred / prayer spot — decorative inspect only
      const knownG = (sim.groups || []).filter(g => (g.sacred || []).some(q => q.x === sp.x && q.y === sp.y)).length;
      $("info-body").innerHTML = '<h3>' + (sp.marker ? 'Worn ground' : 'Prayer spot') + '</h3>' +
        '<div class="sub">' + sp.n + ' prayer' + (sp.n === 1 ? '' : 's') + ' here' + (sp.marker ? ' · marked' : '') +
        (knownG ? ' · known to ' + knownG + ' group' + (knownG === 1 ? '' : 's') : '') + '</div>' +
        '<div class="sub">A place people return to. Not a building.</div>';
    } else if (it) {   // a thing: its material, form, where it is, and its property numbers (these alone decide what happens when it is struck, rubbed or cut)
      const P = G.Items.props(it), holder = it.heldBy != null && sim.agents.find(q => q.id === it.heldBy);
      const prop = (k, tip) => '<div class="row" title="' + tip + '"><span>' + k + '</span>' + bar(P[k], 100, "trait") + '<b>' + Math.round(P[k]) + '/100</b></div>';
      $("info-body").innerHTML = '<h3>' + esc(G.Items.matLabel(it).replace(/^./, ch => ch.toUpperCase())) + '</h3><div class="sub">' + (it.form === "shard" ? "a broken piece" : "whole") + ' · ' + (holder ? 'carried by ' + esc(holder.name) : 'on the ground') + (P.burns ? ' · burns' : '') + '</div>' +
        '<div class="sec">Properties (0-100)</div>' + prop("hardness", "harder things break softer ones; hard on hard can spark") + prop("sharpness", "a keen edge can cut") +
        prop("dryness", "dry things catch a spark") + prop("durability", "how much wear and striking it takes") + prop("flex", "how much it bends (sticks and reeds high, rocks near 0)") +
        (it.material === "meat" ? '<div class="sec">Food</div><div class="sub">' + G.Cook.of(it) + ' · ' + (sim.tick < it.spoilAt ? 'fresh for ' + Math.max(1, Math.round((it.spoilAt - sim.tick) * G.data.config.time.tickGameMinutes / 60)) + ' h more · +' + G.Cook.fullness(it) + ' fullness' : 'spoiled') + '</div><div class="sub">heat: ' + Math.round(it.heat || 0) + ' min by a fire (cooked at ' + G.data.config.cook.cookedAt + ', charred after ' + G.data.config.cook.charredAt + ')</div>' : '');
    } else if (an) {
      const S = G.data.config.animals[an.species], f = an.needs.fullness, low = an.species === "grazer" ? S.fullness.grazeBelow : S.fullness.feedBelow, np = G.Animal.nearestPerson(sim, an.pos.x, an.pos.y);
      const sub = an.species === "grazer" ? "grazes on meadow" : an.species === "wolves" ? "pack hunter · den territory" : "scavenges bodies · hunts deer when hungry";
      const beh = an.species === "wolves" ? "Threatens people only inside pack territory (" + S.territory + " tiles of den)" : ("Flees any person within " + S.fleeWithin + " tiles" + (an.species === "scavenger" ? "; prefers a body within " + (S.corpsePreferTiles || S.noticeTiles) + " tiles; hunts deer when fullness under " + ((S.huntDeer && S.huntDeer.fullnessBelow) || 40) : ""));
      $("info-body").innerHTML = '<h3>' + esc(G.Animal.name(an)) + '</h3><div class="sub">' + sub + ' · ' + G.Animal.doing(an) + '</div>' +
        '<div class="sec">Needs (0-100, full = good)</div>' +
        need("Fullness", f, f < low ? "hot" : "", f <= 0 ? "starving" : f < low ? "hungry" : "fed", (an.species === "grazer" ? "grazes" : "feeds") + " below " + low) +
        '<div class="sec">Behaviour</div><div class="sub">' + beh + '</div>' +
        '<div class="sub">nearest person ' + (np.p ? np.d.toFixed(1) + ' tiles' : 'none') + ' · fled ' + an.stats.flees + ' time' + (an.stats.flees === 1 ? "" : "s") + ' · ' + an.stats.meals + ' meal' + (an.stats.meals === 1 ? "" : "s") + '</div>';
    } else if (bd) {
      const BC = G.data.config.body, ago = sim.tick - bd.diedAt, days = Math.floor(ago / 1440), hrs = Math.floor(ago % 1440 / 60);
      const MC = G.data.config.meat;
      const burialLine = bd.burial ? '<div class="sub">burial: ' + esc(bd.burial.stage.replace(/_/g, " ")) + '</div>' : '';
      const pyreLine = bd.pyre ? '<div class="sub">pyre: ' + esc(bd.pyre.stage) + (bd.burned ? ' · ash bones' : '') + '</div>' : (bd.burned ? '<div class="sub">ash bones</div>' : '');
      $("info-body").innerHTML = '<h3>' + (bd.burial ? 'Burial of ' : bd.stage === "bones" ? 'Bones of ' : bd.species ? 'Carcass of ' : 'Body of ') + esc(bd.name) + '</h3><div class="sub">' + bd.stage + (bd.species ? ' · ' + (bd.killedBy ? 'killed by ' + esc(bd.killedBy) : bd.cause) : ' · ' + ((G.data.config.body.causeVerb || {})[bd.cause] ? '' : 'died of ') + bd.cause + ' at ' + bd.age + ' years') + '</div>' + burialLine + pyreLine +
        (bd.species && bd.stage !== "bones" ? '<div class="sub">meat left: ' + (bd.meat || 0) + ' of ' + (MC.pieces[bd.species] || 0) + ' pieces' + (bd.stage === "fresh" ? ' (can be taken while fresh)' : ' (spoiled)') + '</div>' : '') +
        '<div class="sub">' + G.Time.stamp(bd.diedAt) + ' · ' + (days ? days + ' d ' : '') + hrs + ' h ago</div>' +
        (bd.stage === "bones"
          ? '<div class="sec">Object</div><div class="sub">material: ' + esc(bd.material) + '</div>' + need("Condition", bd.condition, "trait", "weathering", "100 = new bones; weathers to 0 over " + BC.bonesWeatherYears + " years")
          : '<div class="sec">Decay</div>' + need("Flesh", bd.flesh, bd.stage === "rotting" ? "hot" : "", bd.stage, "fresh for " + BC.freshMinutes / 60 + " h, then rots away over " + BC.rotMinutes / 1440 + " days (sooner when wild dogs feed)") +
            '<div class="sub">' + (bd.scavenged ? 'wild dogs have fed here' : 'untouched by scavengers') + '</div>');
    }
    if (bb) {
      const c = bb.orphanAt == null && sim.agents.find(q => q.id === bb.carrier), days = Math.floor((sim.tick - bb.bornAt) * G.data.config.time.tickGameMinutes / 1440), n = bb.needs;
      $("info-body").innerHTML = '<h3>' + esc(bb.name) + '</h3><div class="sub">baby · ' + (bb.sex === "m" ? "male" : "female") + ' · ' + (days < 28 ? days + ' day' + (days === 1 ? '' : 's') : Math.floor(bb.age) + ' year' + (Math.floor(bb.age) === 1 ? '' : 's') + ' ' + (days % 28) + ' d') + ' old · ' +
          (c ? 'carried by ' : 'lying alone' + (bb.orphanAt != null ? ' for ' + ((sim.tick - bb.orphanAt) * G.data.config.time.tickGameMinutes / 60).toFixed(1) + ' h' : '')) + '</div>' +
        (c ? '<div class="lnks">' + who(sim, c.id) + '</div>' : '') +
        '<div class="sec">Needs (met when the carrier eats, drinks, sleeps)</div>' +
        need("Fullness", n.fullness, n.fullness < G.Agent.fullnessThreshold(bb) ? "hot" : "", G.Agent.fullnessWord(n.fullness), "follows the carrier's") +
        need("Water", n.water, n.water < G.Agent.waterThreshold(bb) ? "hot" : "water", G.Agent.waterWord(n.water), "follows the carrier's") +
        need("Warmth", n.warmth, n.warmth < 30 ? "hot" : "warm", G.Agent.warmthWord(n.warmth), "follows the carrier's") +
        '<div class="sec">Traits (0-100; ▲▼ vs parents\' average, * = mutation)</div>' + traitRows(bb) +
        '<div class="sec">Family</div><div class="row fam"><span>Parents</span><div class="lnks">' + bb.parents.map((id, i) => who(sim, id, bb.parentNames[i])).join("") + '</div></div>' +
        '<div class="sub">born ' + G.Time.stamp(bb.bornAt) + '</div>';
    }
    if (a) {
      const A = G.Agent, PC = G.data.config.person, known = Object.keys(a.knowledge.bushes).length, n = a.needs;
      const tabs = (UC().personTabs || [
        { key: "needs", label: "Needs" }, { key: "mind", label: "Mind" }, { key: "kin", label: "Kin" }, { key: "knows", label: "Knows" }, { key: "log", label: "Log" }
      ]);
      if (!tabs.some(x => x.key === UI.personTab)) UI.personTab = "needs";
      // v36 §39: Artist mock pp-* tabs (brown), meters (cyan), mind skill rows — no portrait strip
      const tabBar = '<div class="pp-tabs" role="tablist" aria-label="person sections">' +
        tabs.map(x => '<button type="button" role="tab" class="pp-tab' + (UI.personTab === x.key ? " on" : "") +
          '" data-ptab="' + x.key + '" aria-selected="' + (UI.personTab === x.key) + '" id="pcard-tab-' + x.key + '">' + esc(x.label) + '</button>').join("") + '</div>';
      const cap = w => w ? String(w).replace(/^./, c => c.toUpperCase()) : "";
      const pct = v => Math.max(0, Math.min(100, +v || 0)).toFixed(1);
      const ppMeter = (label, v, word, warn) => '<div class="pp-meter' + (warn ? " warn" : "") + '"><span>' + label + '</span><i><s style="width:' + pct(v) + '%"></s></i><em>' + esc(cap(word)) + '</em></div>';
      const ppSkill = (label, v) => '<div class="pp-skill"><span>' + esc(label) + '</span><i><s style="width:' + pct(v) + '%"></s></i><em>' + Math.round(v) + '</em></div>';
      const mm = a.moods || { happiness: 40, sadness: 40, anger: 40 }, md = G.Moods ? G.Moods.dominant(a) : null;
      const moodBit = (key, short, v) => md === key ? ("<b>" + short + " " + Math.round(v) + "</b>") : (short + " " + Math.round(v));
      const moodLine = '<div class="pp-mood">Mood: ' + moodBit("happiness", "Hap", mm.happiness) + " · " + moodBit("sadness", "Sad", mm.sadness) + " · " + moodBit("anger", "Ang", mm.anger) + "</div>";
      const sickLine = (G.Disease && G.Disease.isSick(a)) ? '<div class="pp-sub">Sick</div><div class="sub">drains faster · recovering</div>' : "";
      // §40 / v37 item 5: Health bar + the Artist's body figure (data/art/body_parts.svg, parts coloured by injury) + the injury list (source of truth)
      const HCF = G.data.config.health, BF = G.data.config.bodyFigure, BP = G.data.config.bodyParts, IT = G.data.config.injuryTypes, inj = a.injuries || [], hv = a.health == null ? HCF.max : a.health;
      const partSev = p => { const l = inj.filter(i => i.part === p); return !l.length ? "ok" : l.some(i => (IT[i.type] || {}).sev === "bad") ? "bad" : "hurt"; };
      const fig = UI.bodySvg ? UI.bodySvg.replace(/<svg /, '<svg class="pp-figure" width="' + BF.w + '" height="' + BF.h + '" role="img" aria-label="body: ' + Object.keys(BP).map(p => BP[p].label + " " + partSev(p)).join(", ") + '" ')
          .replace(/ width="48" height="96"/, "").replace(/<([a-z]+) id="([A-Za-z]+)"/g, (m, t, id) => '<' + t + ' id="pp-part-' + id + '" fill="' + BF.fill[BP[id] ? partSev(id) : "ok"] + '"')
        : '<img class="pp-figure" src="' + BF.src + '" width="' + BF.w + '" height="' + BF.h + '" alt="">';
      const injList = '<ul class="pp-injuries">' + Object.keys(BP).map(p => { const l = inj.filter(i => i.part === p), sv = partSev(p);
        return '<li class="' + sv + '" data-part="' + p + '">' + esc(BP[p].label) + (l.length ? ": " + l.map(i => esc((IT[i.type] || {}).label || i.type) + (G.Injury && G.Injury.effectWords(i).length ? " (" + G.Injury.effectWords(i).join(", ") + ")" : "")).join("; ") : ' <span class="pp-ok">ok</span>') + '</li>'; }).join("") + '</ul>';
      const healthBox = '<div class="pp-health">' + ppMeter("Health", hv / HCF.max * 100, Math.round(hv / HCF.max * 100) + "%", hv < HCF.max * 0.5) + '<div class="pp-body">' + fig + injList + '</div></div>';
      const needsPane =
        healthBox + moodLine +
        ppMeter("Fullness", n.fullness, A.fullnessWord(n.fullness), n.fullness < A.fullnessThreshold(a)) +
        ppMeter("Water", n.water, A.waterWord(n.water), n.water < A.waterThreshold(a)) +
        ppMeter("Energy", n.energy, A.energyWord(n.energy), n.energy < 25) +
        ppMeter("Warmth", n.warmth, A.warmthWord(n.warmth), n.warmth < 30) +
        (a.zero && (a.zero.water > 0 || a.zero.fullness > 0 || a.zero.warmth > 0 || a.zero.energy > 0) ? '<div class="sub hot">' + [a.zero.water > 0 ? "no water for " + (a.zero.water / 60).toFixed(1) + " h" : "", a.zero.fullness > 0 ? "no food for " + (a.zero.fullness / 60).toFixed(1) + " h" : "", a.zero.energy > 0 ? "no sleep for " + (a.zero.energy / 60).toFixed(1) + " h" : "", a.zero.warmth > 0 ? "hypothermia for " + (a.zero.warmth / 60).toFixed(1) + " h" + (a.hypo ? " (stage " + a.hypo + ")" : "") : ""].filter(Boolean).join(" · ") + "</div>" : "") +
        (a.act.type === "sleep" ? '<div class="sub">asleep since ' + G.Time.hhmm(G.Time.at(a.act.since)) + "</div>" : "") +
        (a.felt ? '<div class="sub">feels like ' + G.Time.tempF(a.felt.c) + (a.felt.sheltered ? ", under trees" : "") + (a.felt.huddle ? ", huddled with " + a.felt.huddle : "") + (a.felt.bond ? ", close to " + esc(a.felt.bond) : "") + (a.felt.heat ? ", fire nearby" : "") + "</div>" : "") +
        '<div class="sub">' + a.stats.meals + " meal" + (a.stats.meals === 1 ? "" : "s") + " · " + (a.stats.drinks || 0) + " drink" + (a.stats.drinks === 1 ? "" : "s") + " · " + (a.stats.sleeps || 0) + " sleep" + (a.stats.sleeps === 1 ? "" : "s") + "</div>" + sickLine;
      const mindPane =
        sickLine +
        '<div class="pp-sub">Moods</div>' +
        ppSkill("Happy", mm.happiness) + ppSkill("Sad", mm.sadness) + ppSkill("Angry", mm.anger) +
        '<div class="pp-sub">Fears</div>' + ppSkill("Fear of wolves", (a.wolfFear || 0) / G.data.config.wolfFear.max * 100) +   // §40 / v37 item 2 (shown 0-100)
        '<div class="pp-sub">Experience</div>' +
        Object.keys(G.data.config.learn.actions).map(k => {
          const e = a.exp && a.exp[k], v = e ? e.score : G.data.config.learn.start;
          return ppSkill(EXP[k] || k, v);
        }).join("") + learnedRow(sim, a) +
        '<div class="pp-sub">Traits</div>' +
        Object.entries(a.traits).map(([k, v]) => ppSkill(traitName(k), v)).join("") +
        speechRows(sim, a) + prayRows(a);
      const kinPane = familyRows(sim, a) + relRows(sim, a);
      const knowsPane =
        '<div class="pp-sub">Knows</div><div class="chips">' + chip(known + " berry bush" + (known === 1 ? "" : "es")) + chip(waterKnown(a)) + chip("Known shelters: " + (a.shelters || []).length) + chip("Caches: " + (a.caches || []).length) + chip("Sacred places: " + (a.sacred || []).length) +
          chip("carrying " + (G.Items.held(sim, a) ? esc(G.Items.label(G.Items.held(sim, a))) : "nothing")) +
          (sim.discoveries || []).filter(d => d.who === a.name).map(d => chip(esc(d.action + " " + d.materials.slice(0, 2).join(" / ") + " → " + d.result), "disc")).join("") + "</div>";
      const logPane = '<div class="pp-sub">' + esc(a.name) + "'s log</div>" + plogHtml(sim, a.id);
      const pane = UI.personTab === "mind" ? mindPane : UI.personTab === "kin" ? kinPane : UI.personTab === "knows" ? knowsPane : UI.personTab === "log" ? logPane : needsPane;
      const Sg = G.Social, grp = Sg && Sg.group(sim, a);
      const gname = grp ? Sg.groupName(sim, grp) : "Loner";
      const head = '<div class="pp-cardhead">' +
        '<button type="button" class="pp-nav" data-pcycle="-1" aria-label="Prev person">←</button>' +
        '<div class="pp-name"><b>' + esc(a.name) + "</b><span>" + esc(gname) + " · " + Math.floor(a.age) + " · " + esc(A.doing(a)) + "</span></div>" +
        '<button type="button" class="pp-nav" data-pcycle="1" aria-label="Next person">→</button>' +
        '<button type="button" class="pp-find" data-find="' + a.id + '" aria-label="Find ' + esc(a.name) + ' on the map">Find</button></div>';
      // no portrait strip; header ← → Find; tabs; pane
      $("info-body").innerHTML = '<div class="pp-card">' + head + tabBar +
        '<div class="pp-pane" role="tabpanel" aria-labelledby="pcard-tab-' + UI.personTab + '">' + pane + "</div></div>";
    }
    hidePlogStrip();
    const last = sim.log[sim.log.length - 1], key = UI.tab + "|" + sim.log.length + "|" + (last && last.t) + "|" + (last && last.text);
    if (UI._logKey !== key) {
      UI._logKey = key;
      const rows = sim.log.filter(e => inTab(e.text)).slice(-40).reverse();
      $("log").innerHTML = rows.length ? rows.map(e => '<div class="ev ' + kindOf(e.text) + '"><time>' + G.Time.stamp(e.t) + '</time>' + logNames(sim, e) + '</div>').join("") : '<div class="empty">Nothing here yet.</div>';
      $("sheet-peek").textContent = last ? G.Time.stamp(last.t) + "  " + last.text : "Log";
    }
    if (UI.zoomUI) UI.zoomUI();
    UI.layout();
  };
  // ---- step 25: Speech card line — none, or N shared words for her group (token syllables from words.js)
  function speechRows(sim, a) {
    if (!G.Speech) return '';
    const g = G.Social && G.Social.group(sim, a), words = g ? G.Speech.groupWords(sim, g) : [];
    const own = a.words ? Object.keys(a.words).filter(t => a.words[t].meaning).length : 0;
    if (!words.length && !own) return '<div class="sec">' + esc(G.Speech.cardLabel(sim, a)) + '</div>';
    const chips = words.map(w => chip(esc(w.word + " (" + w.meaning + ")"), "speech")).join("");
    return '<div class="sec">' + esc(G.Speech.cardLabel(sim, a)) + '</div>' +
      (chips ? '<div class="chips">' + chips + '</div>' : '') +
      (own ? '<div class="sub">knows ' + own + ' token' + (own === 1 ? "" : "s") + ' herself</div>' : '');
  }
  // ---- step 21: the prayer forms she has used, with counts (* = liked: a need rose after it) and where a copied one came from ----
  function prayRows(a) {
    const P = a.prayForms || {}, ks = Object.keys(P).filter(f => P[f].n > 0 || P[f].from).sort((p, q) => P[q].n - P[p].n || (p < q ? -1 : 1));
    if (!ks.length) return '';
    return '<div class="sec">Prayer forms (Faith ' + Math.round(a.traits.faith || 0) + '; * = liked)</div><div class="chips">' +
      ks.map(f => chip(esc(G.Faith.formWords(f) + " ×" + P[f].n + (P[f].like > 0 ? " *" : "") + (P[f].from ? " (from " + P[f].from + ")" : "")), "pray")).join("") + '</div>';
  }
  // ---- Prayers tab (step 21): action lines only, newest first, filter by group; the last feedMax lines are kept and saved ----
  UI.prayFilter = "all";
  UI.panelRender.prayers = function (app, el) {
    const sim = app.sim, L = sim.prayers || [], last = L[L.length - 1], gs = (sim.groups || []).map(g => g.id);
    if (UI.prayFilter !== "all" && UI.prayFilter !== "none" && gs.indexOf(UI.prayFilter) < 0 && !L.some(e => e.g === UI.prayFilter)) UI.prayFilter = "all";
    const nb = L.filter(e => e.blessed != null).length, alive = sim.agents.length;
    const key = L.length + "|" + (last && last.t) + "|" + sim.seed + "|" + UI.prayFilter + "|" + gs.join(",") + "|" + nb + "|" + alive;
    if (el._key === key) return; el._key = key;
    const ids = []; for (const g of gs) ids.push(g); for (const e of L) if (e.g != null && ids.indexOf(e.g) < 0) ids.push(e.g);
    const btn = (v, t) => '<button data-pf="' + v + '"' + (UI.prayFilter === v ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"') + '>' + esc(t) + '</button>';
    const rows = L.filter(e => UI.prayFilter === "all" || (UI.prayFilter === "none" ? e.g == null : e.g === UI.prayFilter)).slice().reverse();
    el.innerHTML = '<div class="sec">Prayers</div><div class="pfilt" role="group" aria-label="group filter">' + btn("all", "All") +
      ids.map(g => btn(g, "Group " + g)).join("") + btn("none", "No group") + '</div>' +
      (rows.length ? rows.map(e => { const live = e.ids && sim.agents.some(q => q.id === e.ids[0]);   // §40 / v37: Bless = a partial answer (config.bless)
        const bl = e.blessed != null ? '<span class="pr-blessed">Blessed</span>' : live ? '<button type="button" class="pr-bless" data-bless="' + L.indexOf(e) + '" aria-label="Bless this prayer">' + UI.icon("bless") + 'Bless</button>' : '';
        return '<div class="prl pr-row"><span class="pr-text"><time>' + G.Time.stamp(e.t) + '</time>' + esc(e.text) + '</span>' + bl + '</div>'; }).join("") : '<div class="empty">No one has prayed yet.</div>');
    el.querySelectorAll("button[data-bless]").forEach(b => b.onclick = () => { const r = G.Faith.bless(sim, +b.getAttribute("data-bless")); UI.toast(r ? "Blessed" : "Nothing to bless"); el._key = null; UI.panelRender.prayers(app, el); });
    el.querySelectorAll("button[data-pf]").forEach(b => b.onclick = () => { const v = b.getAttribute("data-pf"); UI.prayFilter = v === "all" || v === "none" ? v : +v; el._key = null; UI.panelRender.prayers(app, el); });
  };
  // ---- Discoveries tab (step 10): every first combination of action, materials and result, in order ----
  UI.panelRender.discoveries = function (app, el) {
    const D = app.sim.discoveries || [], key = D.length + "|" + app.sim.seed;
    if (el._key === key) return; el._key = key;
    el.innerHTML = '<div class="sec">Discoveries</div>' + (D.length ? '<table class="disc"><thead><tr><th>#</th><th>When</th><th>Who</th><th>What</th><th>Result</th><th>Group</th></tr></thead><tbody>' +
      D.slice().reverse().map(d => '<tr><td>' + d.n + '</td><td>' + G.Time.stamp(d.tick) + '</td><td>' + esc(d.who || "-") + '</td><td>' + esc((d.title ? d.title + ": " : "") + d.action + " " + d.materials[0] + (d.materials[1] ? " on " + d.materials[1] : "") + (d.materials[2] ? ", over " + d.materials[2] : "")) + '</td><td>' + esc(d.result) + '</td><td>' + (esc(d.group) || '<span class="blank">-</span>') + '</td></tr>').join("") +
      '</tbody></table>' : '<div class="empty">Nothing discovered yet.</div>');
  };
  // ---- People tab (v36 §39): Artist pp-* list + group tabs; oldest → youngest; dead collapsed; no portrait strip ----
  UI.peopleFilter = "all";   // "all" or a group id
  UI.panelRender.people = function (app, el, force) {
    const sim = app.sim, now = Date.now();
    if (!force && el._t && now - el._t < 1000 && el._seed === sim.seed && el._pf === UI.peopleFilter) return;   // live, at most once per real second
    el._t = now; el._seed = sim.seed; el._pf = UI.peopleFilter;
    el.classList.add("people-ui");
    const S = G.Social, groups = (sim.groups || []).slice().sort((p, q) => p.id - q.id);
    if (UI.peopleFilter !== "all" && !groups.some(g => g.id === UI.peopleFilter)) UI.peopleFilter = "all";
    let rows = UI.peopleCycleList(sim);
    const dead = (sim.bodies || []).filter(b => !b.species).slice().sort((p, q) => q.diedAt - p.diedAt);
    const sx = a => a.sex === "f" ? "F" : a.sex === "m" ? "M" : "-";
    const SD = UC().sexDot || {}, dot = a => a.sex === "f" || a.sex === "m" ? '<i class="pp-sex ' + a.sex + '" style="background:' + SD[a.sex] + '" role="img" aria-label="' + (a.sex === "f" ? "female" : "male") + '"></i>' : "";   // §40 item 3
    const tab = (key, label) => '<button type="button" role="tab" class="pp-tab' + (UI.peopleFilter === key ? " on" : "") + '" data-pf="' + key + '" aria-selected="' + (UI.peopleFilter === key) + '">' + esc(label) + "</button>";
    const tabs = '<div class="pp-groups" role="tablist" aria-label="people groups">' + tab("all", "All") +
      groups.map(g => tab(g.id, (S && S.groupName ? S.groupName(sim, g) : ("Group " + g.id)))).join("") + "</div>";
    const mini = a => {
      const n = a.needs, lo = Math.min(n.fullness, n.water, n.energy, n.warmth);
      const warn = lo < 50;
      return '<i class="pp-mini' + (warn ? " warn" : "") + '"><s style="width:' + Math.max(0, Math.min(100, lo)).toFixed(1) + '%"></s></i>';
    };
    const gLabel = a => { const g = S && S.group(sim, a); return g ? S.groupName(sim, g) : "Loner"; };
    const list = rows.length ? rows.map(a => {
      const on = app.selected === a.id ? " on" : "";
      return '<button type="button" class="pp-row' + on + '" data-pid="' + a.id + '"><b>' + dot(a) + esc(a.name) + "</b><span>" + esc(gLabel(a)) + " · " + Math.floor(a.age) + "</span>" + mini(a) + "</button>";
    }).join("") : '<div class="empty">No one here.</div>';
    el.innerHTML = '<div class="pp-list"><div class="pp-head">People <span class="pp-dim">(' + rows.length + (UI.peopleFilter === "all" ? "" : " in group") + ")</span></div>" + tabs +
      '<div class="pp-rows">' + list + "</div>" +
      '<details class="pdead"' + (UI.peopleDeadOpen ? " open" : "") + "><summary>Dead (" + dead.length + ")</summary>" +
        (dead.length ? dead.map(b => '<div class="drow"><span class="pn">' + esc(b.name) + "</span><span>" + (b.age != null ? b.age + " y" : "") + "</span><span>" + esc(b.cause || "") + "</span></div>").join("") : '<div class="empty">No one has died.</div>') + "</details></div>";
    el.querySelectorAll("button[data-pf]").forEach(b => b.onclick = () => { const v = b.getAttribute("data-pf"); UI.peopleFilter = v === "all" ? "all" : +v; UI.panelRender.people(app, el, true); });
    el.querySelectorAll("button[data-pid]").forEach(b => b.onclick = () => { const id = +b.getAttribute("data-pid"), a = sim.agents.find(q => q.id === id); if (!a) return;
      G.Render.centerOn(Math.round(a.pos.x), Math.round(a.pos.y), UC().peopleZoom || 2); app.select(id); });
    const d = el.querySelector("details.pdead"); if (d) d.ontoggle = () => { UI.peopleDeadOpen = d.open; };
  };
  G.UI = UI;
})(this.GS = this.GS || {});
