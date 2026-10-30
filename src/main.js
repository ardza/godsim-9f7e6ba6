// Boot + main loop. Fixed sim tick (1 game minute) driven by an accumulator, rendering via requestAnimationFrame.
(function (G) {
  const T = () => G.data.config.time;
  const app = G.app = { sim: null, speed: 1, lastSpeed: 1, selected: null, acc: 0, ticksLastFrame: 0 };

  app.setSpeed = s => { if (s) app.lastSpeed = s; app.speed = s; G.UI.update(app); };
  app.select = id => { if (G.Render.follow != null && id !== G.Render.follow) G.Render.follow = null;   // v19: picking someone else ends Find's follow
    app.selected = id; if (id != null) G.UI.openSheet(true); G.UI.update(app); };
  app.save = manual => { const ok = G.Save.save(app.sim); if (manual) G.UI.toast(ok ? "Saved" : "Save failed"); return ok; };
  app.load = () => { const s = G.Save.load(); if (s) { app.sim = s; app.acc = 0; app.selected = null; G.UI.toast("Loaded"); } else G.UI.toast("No save"); G.UI.update(app); return !!s; };
  app.newWorld = seedText => {
    const seed = String(seedText || "").trim() ? G.RNG.seedFrom(seedText) : (Math.random() * 4294967296) >>> 0;
    app.sim = G.Sim.create(seed); app.acc = 0; app.selected = null; app.save(false); G.UI.toast("New world " + seed); G.UI.update(app);
  };
  // step 22: an armed power lands on tile (tx, ty); the bar goes back to normal either way
  app.castPower = (k, tx, ty, opt) => { const P = G.data.config.powers;
    const kind = opt || (k === "spawn" ? G.UI.spawnKind || "grazer" : k === "rain" ? G.UI.rainStr || "medium" : k === "lightning" ? G.UI.boltMode || "single" : undefined);
    const r = G.Powers.cast(app.sim, k, tx, ty, kind), L = P.labels[k];
    G.UI.power = null; G.Render.aim = null;
    const what = k === "spawn" && P.spawn ? P.spawn.kindLabels[kind] || L
      : k === "rain" && P.rain.strengths && P.rain.strengths[kind] ? P.rain.strengths[kind].label + " rain"
      : k === "lightning" && P.lightning.modes && P.lightning.modes[kind] ? P.lightning.modes[kind].label : L;
    G.UI.toast(r.ok ? what + " near " + r.effect.place : what + ": " + r.reason); G.UI.update(app); return r; };
  app.clickTile = (tx, ty) => { // nearest person, animal, body or thing on the ground within ~1 tile of the tap (people first, then animals, bodies, then things when equally near); §33 sacred markers last
    let best = null; const S = G.Render.screen || {};
    const consider = (o, pos, pen) => { const p = S[o.id] || pos, d = Math.hypot(p.x + 0.5 - tx, p.y + 0.5 - ty) + pen; if (d < 1.3 + pen && (!best || d < best.d)) best = { id: o.id, d }; };
    for (const a of app.sim.agents) consider(a, a.pos, 0);
    for (const a of app.sim.animals || []) consider(a, a.pos, 0.15);
    for (const b of app.sim.bodies || []) consider(b, { x: b.x, y: b.y }, 0.3);
    for (const it of app.sim.items || []) if (it.heldBy == null) consider(it, { x: it.x, y: it.y }, 0.4);
    for (const b of app.sim.babies || []) if (b.orphanAt != null) consider(b, b.pos, 0.2);   // step 19: a baby left lying alone (a carried one: tap the carrier)
    for (const h of (G.Hut ? G.Hut.huts(app.sim) : [])) consider({ id: G.Hut.selId(h) }, { x: h.tiles[0][0], y: h.tiles[0][1] }, 0.5);   // v38 (a): tap a hut
    for (const q of (app.sim.faith && app.sim.faith.spots) || []) if (q.marker) consider({ id: G.Faith.spotId(q.x, q.y) }, { x: q.x, y: q.y }, 0.55);
    app.select(best ? best.id : null);
  };
  // Test-only console hooks (not in the UI): hold a person's water / fullness at 0 so a need-death and the decay can be watched (README).
  G.debug = {
    drainWater: id => hold(id, "water"), drainFullness: id => hold(id, "fullness"),
    release: id => { const a = person(id); if (a) delete a.hold; return !!a; },
    seedInfo: () => G.World.seedInfo(app.sim),   // step 15b: { seed, lakes, rivers, waterPct, forestDensity, moistureBias, ... }
    historyFixture: () => { const r = G.Social.historyFixture(app.sim); if (r) { app.select(r.a); G.UI.personTab = "log"; G.UI.pair = { a: r.a, b: r.b, tab: "log" }; G.UI._personCardKey = null; G.UI.update(app); } return r; },   // v38 (e): A & B card open on the Log tab
    hutTiersFixture: () => { const hs = G.Hut.tiersFixture(app.sim); if (hs && hs.length) { app.select(G.Hut.selId(hs[hs.length - 1])); G.UI.update(app); } return hs; },   // v38 (a): crude, reed, sturdy side by side, sturdy card open
    hutFixture: (opts) => { const h = G.Hut.fixture(app.sim, opts); if (h) { app.select(G.Hut.selId(h)); G.UI.update(app); } return h; },   // v38 (a): worn sturdy hut by person 1, card open
    lightningFixture: (opts) => { const r = G.Hunt.boltFixture(app.sim, opts); if (r && r.body) { app.select(r.body.id); G.UI.update(app); } return r; },   // v38 (d): a bolt kills an animal by person 1, carcass card open
    wolvesFixture: (opts) => { const r = G.WolfFight.fixture(app.sim, opts); if (r && r.wolf) { app.select(r.wolf.id); G.UI.update(app); } else G.UI.update(app); return r; },   // v38 (f): a wolf scene (kind dog / flee / corpse / fight / lone / spawn), the wolf selected
    fireFixture: (opts) => { const r = G.Fire.fixture(app.sim, opts); G.UI.update(app); return r; },   // v38 (g): one fire of a case (meadow / wet / rain / nearwater / sand / cold / woods)
    sproutFixture: () => { const r = G.Farm.fixture(app.sim); if (r) { app.select(r.a.id); G.UI.update(app); } return r; },   // v38 (b): one plant per stage (seed / sprout / sapling) by person 1
    cacheFixture: () => { const r = G.Food.fixture(app.sim); if (r) { app.select(r.fresh.id); G.UI.update(app); } return r; },   // v38 (c): person 1's cache with fresh, dried and rotten meat, the fresh piece's card open
    ageTo: (id, years) => { const a = person(id); if (a) a.age = years; return a ? a.lifespan : null; }   // e.g. ageTo(id, lifespan - 0.001) to see an old-age death
  };
  function person(id) { return app.sim.agents.find(a => a.id === (id == null ? app.selected : id)); }
  function hold(id, need) { const a = person(id); if (!a) return false; a.hold = need; a.needs[need] = 0; G.UI.update(app); return a.id; }

  function boot() {
    G.Render.init(document.getElementById("cv"));
    const q = new URLSearchParams(location.search);
    app.sim = (!q.has("seed") && G.Save.load()) || G.Sim.create(q.has("seed") ? G.RNG.seedFrom(q.get("seed")) : (Math.random() * 4294967296) >>> 0);
    G.UI.init(app); G.UI.update(app);
    if (q.get("fixture") === "lightning") G.debug.lightningFixture({ species: q.get("species") || undefined });   // v38 (d): ?fixture=lightning[&species=scavenger|wolves]
    if (q.get("fixture") === "history") G.debug.historyFixture();   // v38 (e): ?fixture=history opens "A & B" (a quarrel, a cache take, a pairing + unrelated lines)
    if (q.get("fixture") === "wolves") G.debug.wolvesFixture({ kind: q.get("kind") || undefined });   // v38 (f): ?fixture=wolves[&kind=dog|flee|corpse|fight|lone|spawn] (default fight)
    if (q.get("fixture") === "fire") G.debug.fireFixture({ kind: q.get("kind") || undefined });   // v38 (g): ?fixture=fire[&kind=meadow|wet|rain|nearwater|sand|cold|woods]
    if (q.get("fixture") === "hut") { if (q.get("kind") === "tiers") G.debug.hutTiersFixture(); else G.debug.hutFixture(); }   // ?fixture=hut[&kind=tiers]
    if (q.get("fixture") === "sprout") G.debug.sproutFixture();   // v38 (b): ?fixture=sprout
    if (q.get("fixture") === "cache") G.debug.cacheFixture();   // v38 (c): ?fixture=cache   // v38 (a): ?fixture=hut opens a worn sturdy hut's card
    // the world pauses while closed: save on hide/close, continue from the saved tick on load (no catch-up)
    document.addEventListener("visibilitychange", () => { if (document.hidden) app.save(false); });
    window.addEventListener("pagehide", () => app.save(false));
    setInterval(() => app.save(false), T().autosaveRealSeconds * 1000);
    let last = performance.now(), uiT = 0;
    function frame(now) {
      const dt = Math.min(0.25, (now - last) / 1000); last = now;
      const perTick = G.Time.realSecondsPerTick(), max = T().maxTicksPerFrame;
      app.acc += dt * app.speed / perTick;
      let n = 0; while (app.acc >= 1 && n < max) { G.Sim.step(app.sim); app.acc -= 1; n++; }
      if (app.acc > 1) app.acc = 1; // can't keep up: drop time rather than spiral
      app.ticksLastFrame = n;
      G.Render.draw(app.sim, Math.min(1, app.acc), now / 1000, app.selected); // acc is kept while paused, so pausing never makes her jump
      if (now - uiT > 200) { uiT = now; G.UI.update(app); }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})(this.GS = this.GS || {});
