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
      const b = document.createElement("button"); b.innerHTML = UI.icon(p.icon) + '<span class="lbl">' + esc(p.label) + '</span>'; b.id = "ptab-" + p.key; b.setAttribute("role", "tab");
      b.onclick = () => { UI.panel = UI.panel === p.key ? null : p.key; savePrefs(Object.assign(prefs(), { panel: UI.panel })); UI._logKey = null;
        if (UI.panel && isSheet()) UI.openSheet(true);   // phone landscape: opening a panel opens the sheet above the bar (closing one with nothing inspected hides the sheet: #side.bare)
        UI.update(app); };
      bar.appendChild(b);
    });
  }
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
    document.querySelectorAll(".ico[data-icon]").forEach(el => { el.outerHTML = UI.icon(el.dataset.icon); });   // static buttons in index.html
    G.data.config.time.speeds.forEach((s, i) => { const b = document.createElement("button"); b.innerHTML = UI.icon(UC().speedIcons[i]) + '<span class="lbl">' + (s ? s + "x" : "Pause") + '</span>'; b.dataset.speed = s; b.setAttribute("aria-label", s ? s + "x speed" : "Pause"); b.id = "speed-" + s; b.title = (s ? s + "x speed" : "Pause") + " (key " + G.data.config.time.speeds.indexOf(s) + (s ? ")" : ", Space toggles)"); b.onclick = () => app.setSpeed(s); sp.appendChild(b); });
    const tabs = $("tabs");
    (LC().tabs || []).forEach(t => { const b = document.createElement("button"); b.textContent = t.label; b.id = "tab-" + t.key; b.setAttribute("role", "tab"); b.onclick = () => { UI.tab = t.key; UI._logKey = null; UI.update(app); }; tabs.appendChild(b); });
    $("btn-save").onclick = () => app.save(true);
    $("btn-load").onclick = () => app.load();
    $("btn-new").onclick = () => app.newWorld($("seed").value);
    $("btn-menu").onclick = () => { const o = $("top").classList.toggle("menu-open"); $("btn-menu").setAttribute("aria-expanded", o); };
    document.addEventListener("pointerdown", e => { if (!$("top").contains(e.target)) { $("top").classList.remove("menu-open"); $("btn-menu").setAttribute("aria-expanded", false); } });
    $("seed").addEventListener("keydown", e => { if (e.key === "Enter") app.newWorld($("seed").value); e.stopPropagation(); });
    $("info-close").onclick = () => app.select(null);
    $("sheet-handle").onclick = () => { const o = !$("side").classList.contains("open");
      if (o && !UI.panel && $("info").hidden) { UI.panel = "log"; savePrefs(Object.assign(prefs(), { panel: "log" })); UI._logKey = null; }   // opening an empty sheet opens the Log
      UI.openSheet(o); UI.update(app); };
    initPanels(app);
    if (isSheet() && prefs().sheet) UI.openSheet(true, true);
    initMap(app);
    window.addEventListener("keydown", e => { if (e.code === "Space") { app.setSpeed(app.speed ? 0 : (app.lastSpeed || 1)); e.preventDefault(); }
      const sp = G.data.config.time.speeds, n = /^[0-9]$/.test(e.key) ? +e.key : -1; if (n >= 0 && n < sp.length) app.setSpeed(sp[n]); }); // 0 pause, 1 = 1x, 2 = 10x, 3 = 60x
    window.addEventListener("resize", UI.layout); UI.layout(); UI.fit();
  };
  // ---- person card helpers: trait names, experience scores (step 13-14), chips, and the personal log (.plog, only this person's events) ----
  const TRAIT = { speed: "Speed", appetite: "Appetite", curiosity: "Curiosity", coldFear: "Cold fear", fireFear: "Fire fear" };
  const EXP = { fire: "Fire", huddle: "Huddling", shelter: "Shelter" };
  const traitName = k => TRAIT[k] || k;
  const chip = (t, cls) => '<span class="chip' + (cls ? " " + cls : "") + '">' + t + '</span>';
  function expRows(sim, a) {
    return Object.keys(G.data.config.learn.actions).map(k => { const e = a.exp && a.exp[k], v = e ? e.score : G.data.config.learn.start;
      const lbl = EXP[k] || k;
      const notes = e ? [e.n ? e.n + ' good time' + (e.n === 1 ? "" : "s") : '', e.burns ? 'burned ' + e.burns + '×' : '', e.copied ? 'copied from ' + esc(e.copied.name) : ''].filter(Boolean) : [];
      return '<div class="row exp" data-exp="' + k + '" title="' + esc(G.Learn.label(k)) + ': rises when it warmed her, drops sharply on a burn; copied from a nearby success"><span>' + lbl + '</span>' + bar(v, 100, v < 30 ? "hot" : "trait") + '<b>' + Math.round(v) + '/100</b></div>' +
        (notes.length ? '<div class="exp-note">' + notes.join(" · ") + '</div>' : ''); }).join("");
  }
  function plogRender(sim, id, name) {
    const sec = $("plog-sec"), el = $("plog"), L = id == null ? [] : G.Sim.plogOf(sim, id), last = L[L.length - 1];
    const key = id == null ? "" : id + "|" + L.length + "|" + (last ? last.t + last.text : "");
    sec.hidden = el.hidden = id == null; if (UI._plogKey === key) return; UI._plogKey = key; if (id == null) { el.innerHTML = ""; return; }
    sec.textContent = name + "'s log (" + L.length + ")";
    el.innerHTML = L.length ? L.slice().reverse().map(e => '<div class="ev' + (e.k ? " " + e.k : "") + '"><time>' + G.Time.stamp(e.t) + '</time>' + esc(e.text) + '</div>').join("") : '<div class="empty">Nothing yet.</div>';
    if (UI._plogId !== id) { el.scrollTop = 0; UI._plogId = id; }
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
    $("seedshow").textContent = "seed " + sim.seed;
    document.querySelectorAll("#speeds button").forEach(b => { const on = +b.dataset.speed === app.speed; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    updatePanels(app);
    document.querySelectorAll("#tabs button").forEach(b => { const on = b.id === "tab-" + UI.tab; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    const a = sim.agents.find(q => q.id === app.selected), info = $("info");
    const an = !a && (sim.animals || []).find(q => q.id === app.selected);
    let bd = !a && !an && (sim.bodies || []).find(q => q.id === app.selected);
    const it = !a && !an && !bd && (sim.items || []).find(q => q.id === app.selected);
    if (!a && !an && !bd && app.selected != null) { bd = (sim.bodies || []).find(q => q.of === app.selected); if (bd) app.selected = bd.id; }   // the selected person died: follow to their body
    info.hidden = !a && !an && !bd && !it;
    const need = (label, v, cls, word, tip) => '<div class="row need" title="' + tip + '"><span>' + label + '</span>' + bar(v, 100, cls).replace('</div>', '<em>' + word + '</em></div>') + '<b>' + Math.round(v) + '/100</b></div>';
    if (it) {   // a thing: its material, form, where it is, and its property numbers (these alone decide what happens when it is struck, rubbed or cut)
      const P = G.Items.props(it), holder = it.heldBy != null && sim.agents.find(q => q.id === it.heldBy);
      const prop = (k, tip) => '<div class="row" title="' + tip + '"><span>' + k + '</span>' + bar(P[k], 100, "trait") + '<b>' + Math.round(P[k]) + '/100</b></div>';
      $("info-body").innerHTML = '<h3>' + esc(G.Items.matLabel(it).replace(/^./, ch => ch.toUpperCase())) + '</h3><div class="sub">' + (it.form === "shard" ? "a broken piece" : "whole") + ' · ' + (holder ? 'carried by ' + esc(holder.name) : 'on the ground') + (P.burns ? ' · burns' : '') + '</div>' +
        '<div class="sec">Properties (0-100)</div>' + prop("hardness", "harder things break softer ones; hard on hard can spark") + prop("sharpness", "a keen edge can cut") +
        prop("dryness", "dry things catch a spark") + prop("durability", "how much wear and striking it takes") +
        (it.material === "meat" ? '<div class="sec">Food</div><div class="sub">' + G.Cook.of(it) + ' · ' + (sim.tick < it.spoilAt ? 'fresh for ' + Math.max(1, Math.round((it.spoilAt - sim.tick) * G.data.config.time.tickGameMinutes / 60)) + ' h more · +' + G.Cook.fullness(it) + ' fullness' : 'spoiled') + '</div><div class="sub">heat: ' + Math.round(it.heat || 0) + ' min by a fire (cooked at ' + G.data.config.cook.cookedAt + ', charred after ' + G.data.config.cook.charredAt + ')</div>' : '');
    } else if (an) {
      const S = G.data.config.animals[an.species], f = an.needs.fullness, low = an.species === "grazer" ? S.fullness.grazeBelow : S.fullness.feedBelow, np = G.Animal.nearestPerson(sim, an.pos.x, an.pos.y);
      $("info-body").innerHTML = '<h3>' + esc(G.Animal.name(an)) + '</h3><div class="sub">' + (an.species === "grazer" ? "grazes on meadow" : "eats the flesh of bodies") + ' · ' + G.Animal.doing(an) + '</div>' +
        '<div class="sec">Needs (0-100, full = good)</div>' +
        need("Fullness", f, f < low ? "hot" : "", f <= 0 ? "starving" : f < low ? "hungry" : "fed", (an.species === "grazer" ? "grazes" : "feeds") + " below " + low) +
        '<div class="sec">Behaviour</div><div class="sub">Flees any person within ' + S.fleeWithin + ' tiles' + (an.species === "scavenger" ? '; notices a body within ' + S.noticeTiles + ' tiles' : '') + '</div>' +
        '<div class="sub">nearest person ' + (np.p ? np.d.toFixed(1) + ' tiles' : 'none') + ' · fled ' + an.stats.flees + ' time' + (an.stats.flees === 1 ? "" : "s") + ' · ' + an.stats.meals + ' meal' + (an.stats.meals === 1 ? "" : "s") + '</div>';
    } else if (bd) {
      const BC = G.data.config.body, ago = sim.tick - bd.diedAt, days = Math.floor(ago / 1440), hrs = Math.floor(ago % 1440 / 60);
      const MC = G.data.config.meat;
      $("info-body").innerHTML = '<h3>' + (bd.stage === "bones" ? 'Bones of ' : bd.species ? 'Carcass of ' : 'Body of ') + esc(bd.name) + '</h3><div class="sub">' + bd.stage + (bd.species ? ' · ' + (bd.killedBy ? 'killed by ' + esc(bd.killedBy) : bd.cause) : ' · died of ' + bd.cause + ' at ' + bd.age + ' years') + '</div>' +
        (bd.species && bd.stage !== "bones" ? '<div class="sub">meat left: ' + (bd.meat || 0) + ' of ' + (MC.pieces[bd.species] || 0) + ' pieces' + (bd.stage === "fresh" ? ' (can be taken while fresh)' : ' (spoiled)') + '</div>' : '') +
        '<div class="sub">' + G.Time.stamp(bd.diedAt) + ' · ' + (days ? days + ' d ' : '') + hrs + ' h ago</div>' +
        (bd.stage === "bones"
          ? '<div class="sec">Object</div><div class="sub">material: ' + esc(bd.material) + '</div>' + need("Condition", bd.condition, "trait", "weathering", "100 = new bones; weathers to 0 over " + BC.bonesWeatherYears + " years")
          : '<div class="sec">Decay</div>' + need("Flesh", bd.flesh, bd.stage === "rotting" ? "hot" : "", bd.stage, "fresh for " + BC.freshMinutes / 60 + " h, then rots away over " + BC.rotMinutes / 1440 + " days (sooner when scavengers feed)") +
            '<div class="sub">' + (bd.scavenged ? 'scavengers have fed here' : 'untouched by scavengers') + '</div>');
    }
    if (a) {
      const A = G.Agent, PC = G.data.config.person, known = Object.keys(a.knowledge.bushes).length, n = a.needs;
      $("info-body").innerHTML = '<h3>' + esc(a.name) + '</h3><div class="sub">' + Math.floor(a.age) + ' years · ' + A.doing(a) + '</div>' +
        '<div class="sec">Needs (0-100, full = good)</div>' +
        need("Fullness", n.fullness, n.fullness < A.fullnessThreshold(a) ? "hot" : "", A.fullnessWord(n.fullness), "100 = stuffed, " + PC.fullness.mealFillTo + " = full after a meal; eats below " + A.fullnessThreshold(a) + "; 0 = starving") +
        need("Water", n.water, n.water < A.waterThreshold(a) ? "hot" : "water", A.waterWord(n.water), "100 = just drank; drinks below " + A.waterThreshold(a) + "; 0 = parched") +
        need("Energy", n.energy, n.energy < 25 ? "hot" : "energy", A.energyWord(n.energy), "100 = rested (" + PC.energy.restedAt + "+ reads rested); sleeps after dusk under " + PC.energy.sleepBelow) +
        need("Warmth", n.warmth, n.warmth < 30 ? "hot" : "warm", A.warmthWord(n.warmth), "100 = warm; seeks shelter or company below " + Math.round(A.warmthSeekBelow(a)) + "; a full day at 0 is fatal" + (a.felt ?  " · feels like " + G.Time.tempF(a.felt.c) + (a.felt.sheltered ? ", under trees" : "") + (a.felt.huddle ? ", huddled with " + a.felt.huddle : "") + (a.felt.heat ? ", fire nearby" : "") : "")) +
        (a.zero && (a.zero.water > 0 || a.zero.fullness > 0 || a.zero.warmth > 0) ? '<div class="sub hot">' + [a.zero.water > 0 ? 'no water for ' + (a.zero.water / 60).toFixed(1) + ' h' : '', a.zero.fullness > 0 ? 'no food for ' + (a.zero.fullness / 60).toFixed(1) + ' h' : '', a.zero.warmth > 0 ? 'freezing for ' + (a.zero.warmth / 60).toFixed(1) + ' h' : ''].filter(Boolean).join(' · ') + '</div>' : '') +
        (a.act.type === "sleep" ? '<div class="sub">asleep since ' + G.Time.hhmm(G.Time.at(a.act.since)) + '</div>' : '') +
        '<div class="sec">Experience (0-100, ' + G.data.config.learn.start + ' = untried)</div>' + expRows(sim, a) +
        '<div class="sec">Traits (0-100, 50 = avg)</div>' + Object.entries(a.traits).map(([k, v]) => '<div class="row" title="' + esc(G.data.config.person.traits[k] || "") + '"><span>' + traitName(k) + '</span>' + bar(v, 100, "trait") + '<b>' + Math.round(v) + '/100</b></div>').join("") +
        '<div class="sec">Knows</div><div class="chips">' + chip(known + ' berry bush' + (known === 1 ? "" : "es")) + chip(waterKnown(a)) +
          chip('carrying ' + (G.Items.held(sim, a) ? esc(G.Items.label(G.Items.held(sim, a))) : 'nothing')) +
          (sim.discoveries || []).filter(d => d.who === a.name).map(d => chip(esc(d.action + " " + d.materials.slice(0, 2).join(" / ") + " → " + d.result), "disc")).join("") + '</div>' +
        '<div class="sub">' + a.stats.meals + ' meal' + (a.stats.meals === 1 ? "" : "s") + ' · ' + (a.stats.drinks || 0) + ' drink' + (a.stats.drinks === 1 ? "" : "s") + ' · ' + (a.stats.sleeps || 0) + ' sleep' + (a.stats.sleeps === 1 ? "" : "s") + '</div>';
    }
    plogRender(sim, a ? a.id : bd ? bd.of : null, a ? a.name : bd ? bd.name : null);
    const last = sim.log[sim.log.length - 1], key = UI.tab + "|" + sim.log.length + "|" + (last && last.t) + "|" + (last && last.text);
    if (UI._logKey !== key) {
      UI._logKey = key;
      const rows = sim.log.filter(e => inTab(e.text)).slice(-40).reverse();
      $("log").innerHTML = rows.length ? rows.map(e => '<div class="ev ' + kindOf(e.text) + '"><time>' + G.Time.stamp(e.t) + '</time>' + esc(e.text) + '</div>').join("") : '<div class="empty">Nothing here yet.</div>';
      $("sheet-peek").textContent = last ? G.Time.stamp(last.t) + "  " + last.text : "Log";
    }
    if (UI.zoomUI) UI.zoomUI();
    UI.layout();
  };
  // ---- Discoveries tab (step 10): every first combination of action, materials and result, in order ----
  UI.panelRender.discoveries = function (app, el) {
    const D = app.sim.discoveries || [], key = D.length + "|" + app.sim.seed;
    if (el._key === key) return; el._key = key;
    el.innerHTML = '<div class="sec">Discoveries</div>' + (D.length ? '<table class="disc"><thead><tr><th>#</th><th>When</th><th>Who</th><th>What</th><th>Result</th><th>Group</th></tr></thead><tbody>' +
      D.slice().reverse().map(d => '<tr><td>' + d.n + '</td><td>' + G.Time.stamp(d.tick) + '</td><td>' + esc(d.who || "-") + '</td><td>' + esc(d.action + " " + d.materials[0] + (d.materials[1] ? " on " + d.materials[1] : "") + (d.materials[2] ? ", over " + d.materials[2] : "")) + '</td><td>' + esc(d.result) + '</td><td>' + (esc(d.group) || '<span class="blank">-</span>') + '</td></tr>').join("") +
      '</tbody></table>' : '<div class="empty">Nothing discovered yet.</div>');
  };
  G.UI = UI;
})(this.GS = this.GS || {});
