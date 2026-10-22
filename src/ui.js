// DOM UI: top bar (clock, speeds, save/load/new, seed), info panel, event log, canvas fit.
(function (G) {
  const $ = id => document.getElementById(id), UI = {};
  const bar = (v, max, cls) => '<div class="bar ' + (cls || "") + '"><i style="width:' + Math.max(0, Math.min(100, v / max * 100)).toFixed(1) + '%"></i></div>';
  const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

  UI.init = function (app) {
    const sp = $("speeds");
    G.data.config.time.speeds.forEach(s => { const b = document.createElement("button"); b.textContent = s ? s + "x" : "Pause"; b.dataset.speed = s; b.id = "speed-" + s; b.title = (s ? s + "x speed" : "Pause") + " (key " + G.data.config.time.speeds.indexOf(s) + (s ? ")" : ", Space toggles)"); b.onclick = () => app.setSpeed(s); sp.appendChild(b); });
    $("btn-save").onclick = () => app.save(true);
    $("btn-load").onclick = () => app.load();
    $("btn-new").onclick = () => app.newWorld($("seed").value);
    $("seed").addEventListener("keydown", e => { if (e.key === "Enter") app.newWorld($("seed").value); e.stopPropagation(); });
    $("info-close").onclick = () => app.select(null);
    $("cv").addEventListener("pointerdown", e => { const t = G.Render.toTile(e.clientX, e.clientY); app.clickTile(t.x, t.y); });
    window.addEventListener("keydown", e => { if (e.code === "Space") { app.setSpeed(app.speed ? 0 : (app.lastSpeed || 1)); e.preventDefault(); }
      const sp = G.data.config.time.speeds, n = /^[0-9]$/.test(e.key) ? +e.key : -1; if (n >= 0 && n < sp.length) app.setSpeed(sp[n]); }); // 0 pause, 1 = 1x, 2 = 10x, 3 = 60x
    window.addEventListener("resize", UI.fit); UI.fit();
  };
  UI.fit = function () { // largest 3:2 canvas that fits the stage
    const st = $("stage"), cv = $("cv"), portrait = innerHeight > innerWidth, r = st.getBoundingClientRect(), pad = 8;
    const k = Math.min((st.clientWidth - pad) / cv.width, ((portrait ? innerHeight * 0.6 : r.height) - pad) / cv.height);
    cv.style.width = Math.floor(cv.width * k) + "px"; cv.style.height = Math.floor(cv.height * k) + "px";
  };
  UI.toast = function (t) { const el = $("toast"); el.textContent = t; el.style.opacity = 1; clearTimeout(UI._tt); UI._tt = setTimeout(() => el.style.opacity = 0, 1600); };

  UI.update = function (app) {
    const sim = app.sim, c = G.Time.at(sim.tick);
    $("clock").textContent = "Year " + c.year + " · " + c.season + " " + c.dayOfSeason + " · Day " + c.day + " · " + G.Time.hhmm(c);
    $("seedshow").textContent = "seed " + sim.seed;
    document.querySelectorAll("#speeds button").forEach(b => b.classList.toggle("on", +b.dataset.speed === app.speed));
    const a = sim.agents.find(q => q.id === app.selected), info = $("info");
    info.hidden = !a;
    if (a) {
      const thr = G.Agent.hungerThreshold(a), known = Object.keys(a.knowledge.bushes).length;
      $("info-body").innerHTML = '<h3>' + esc(a.name) + '</h3><div class="sub">' + Math.floor(a.age) + ' years · ' + G.Agent.doing(a) + '</div>' +
        '<div class="sec">Needs</div><div class="row"><span>hunger</span>' + bar(a.needs.hunger, 100, a.needs.hunger >= thr ? "hot" : "") + '<b>' + Math.round(a.needs.hunger) + '/100</b></div>' +
        '<div class="sec">Traits (0-100, 50 = avg)</div>' + Object.entries(a.traits).map(([k, v]) => '<div class="row" title="' + esc(G.data.config.person.traits[k] || "") + '"><span>' + k + '</span>' + bar(v, 100, "trait") + '<b>' + Math.round(v) + '/100</b></div>').join("") +
        '<div class="sec">Knows</div><div class="sub">' + known + ' berry bush' + (known === 1 ? "" : "es") + ' · ' + a.stats.meals + ' meal' + (a.stats.meals === 1 ? "" : "s") + ' eaten</div>';
    }
    if (UI._logN !== sim.log.length || UI._logT !== (sim.log.length && sim.log[sim.log.length - 1].t)) {
      UI._logN = sim.log.length; UI._logT = sim.log.length && sim.log[sim.log.length - 1].t;
      $("log").innerHTML = sim.log.slice(-40).reverse().map(e => '<div><time>' + G.Time.stamp(e.t) + '</time> ' + esc(e.text) + '</div>').join("");
    }
  };
  G.UI = UI;
})(this.GS = this.GS || {});
