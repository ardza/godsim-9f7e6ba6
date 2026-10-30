// v38 (c) Food storage, spoilage, preservation. Meat (raw / cooked / charred) lasts food.spoilDays from the kill, carried or stored; then it
// turns into "rotten food" (the same item: source tag it.src, heat, dried kept). Dried meat (left lying by a burning fire) and meat lying in a
// shelter spoil slower. Preservation is learned from need (losing food to rot) and spread by copying (Learn keys dryFood, keepFood).
// Caches hold a small pile (cache.pileMax). Own rng stream (sim.fdrng) so other streams are unchanged. Logs are actions only.
(function (G) {
  "use strict";
  const CF = () => G.data.config, FC = () => CF().food || {}, TM = () => CF().time.tickGameMinutes, DAY = 1440;
  const Food = {};
  Food.newStats = () => ({ rotted: 0, rottenGone: 0, rottenEaten: 0, dried: 0, laid: 0, kept: 0, needGains: { dryFood: 0, keepFood: 0 }, copies: 0, takenOthers: 0 });
  Food.init = sim => { sim.foodStats = sim.foodStats || Food.newStats(); };
  const st = sim => sim.foodStats || (sim.foodStats = Food.newStats());
  const rng = sim => sim.fdrng || (sim.fdrng = new G.RNG(((sim.seed >>> 0) ^ 0xF00D38) >>> 0));
  Food.rng = rng;
  Food.spoilMinutes = () => (FC().spoilDays != null ? FC().spoilDays : 7) * DAY;
  Food.isMeat = it => !!it && it.material === "meat";
  Food.isRotten = it => !!it && it.material === "rotten";
  const byId = (sim, id) => id == null ? null : sim.agents.find(q => q.id === id) || null;
  const byName = (sim, n) => n == null ? null : sim.agents.find(q => q.name === n) || null;
  // lying (not held) inside a hut / cave / overhang / thicket
  Food.sheltered = (sim, it) => !!it && it.heldBy == null && !!(G.Shelter && G.Shelter.at(sim, it.x, it.y));
  Food.keepX = (sim, it) => (it.dried ? FC().driedX || 1 : 1) * (Food.sheltered(sim, it) ? FC().shelteredX || 1 : 1);

  // the meat has passed its time: it turns into rotten food (called by Hunt.step). The one who carried / stashed / left it lost food (need).
  Food.rot = function (sim, it) {
    const L = FC().lines || {}, h = it.heldBy != null ? byId(sim, it.heldBy) : null;
    it.material = "rotten"; it.rottenAt = sim.tick; it.props = Object.assign({}, G.data.materials.rotten ? (({ label, burns, ...p }) => p)(G.data.materials.rotten) : it.props);
    st(sim).rotted++;
    const losers = new Set(); if (h) losers.add(h); const s = byName(sim, it.stashedBy); if (s) losers.add(s); const l = byId(sim, it.leftBy); if (l) losers.add(l);
    for (const a of losers) { a.foodLost = (a.foodLost || 0) + 1; a.foodLostAt = sim.tick; }
    G.Sim.log(sim, h ? (L.rotHeld || "The meat {name} carries turns rotten").replace("{name}", h.name) : L.rot || "A piece of meat turns rotten", h || null);
  };

  // learned from need: she lost food to rot before, and now takes up / eats a piece that kept (dried, or sat sheltered long enough)
  Food.onTake = function (sim, a, it) {
    if (!Food.isMeat(it) || !a) return 0; let n = 0; const C = FC();
    if (it.dried && !st(sim).dryDisc) { st(sim).dryDisc = 1; const d = G.Discoveries.note(sim, a, "dried", ["meat"], "keeps longer"); if (d) d.title = "First dried food"; }
    if (!(a.foodLost > 0)) return 0;
    const cr = it.credited || (it.credited = []);
    if (it.dried && cr.indexOf(a.id + ":dry") < 0) { cr.push(a.id + ":dry"); G.Learn.add(a, "dryFood", C.gain); G.Learn.bump(sim, "successes", "dryFood"); st(sim).needGains.dryFood++; n++; }
    if ((it.shelterMin || 0) >= C.keepNoticeMinutes && cr.indexOf(a.id + ":keep") < 0) { cr.push(a.id + ":keep"); G.Learn.add(a, "keepFood", C.gain); G.Learn.bump(sim, "successes", "keepFood"); st(sim).needGains.keepFood++; n++; }
    return n;
  };

  // others awake within copyTiles who see her use a method may copy it (Learn copy rules)
  Food.watch = function (sim, a, key) {
    const R = FC().copyTiles != null ? FC().copyTiles : 5, L = G.Learn, LC = CF().learn; let n = 0;
    for (const b of sim.agents) { if (b === a || !b.act || b.act.type === "sleep" || Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y) > R) continue;
      if (G.Family && G.Family.isChild && G.Family.isChild(b)) continue;
      const sa = L.score(a, key), own = L.score(b, key); if (sa < own + LC.copyMargin) continue;
      if (!rng(sim).chance(Math.min(1, L.copyChance(b, key)))) continue;
      const e = L.rec(b, key); e.score = Math.round((own + (sa - own) * LC.copyShare) * 100) / 100; e.copied = { from: a.id, name: a.name, t: sim.tick };
      L.bump(sim, "copies", key); st(sim).copies++; n++;
      G.Sim.log(sim, b.name + " watched " + a.name + " and copied: " + L.label(key), [b, a]); }
    return n;
  };
  Food.urge = (a, key) => Math.max(0, G.Learn.score(a, key) - CF().learn.start) / 50 * (FC().urgeChance != null ? FC().urgeChance : 0.6);

  // about to put meat down (Cache.tryStash): a learned urge may lay it by a fire to dry, or stash it only inside a shelter. true = set off / done.
  Food.tryKeep = function (sim, a, it) {
    if (!Food.isMeat(it)) return false; const C = FC();
    if (a.act && a.act.type === "walk" && a.act.goal === "dryFood") return true;
    const ud = Food.urge(a, "dryFood");
    if (ud > 0 && !it.dried && sim.fire && rng(sim).chance(Math.min(1, ud))) {
      const f = G.Learn.nearestFire(sim, a.pos.x, a.pos.y, ["fire"]);
      if (f && f.d <= C.dryWalkTiles) { const lo = CF().cook.fireTiles + 0.5, hi = C.dryTiles, R = Math.ceil(hi), c = [];
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const x = f.x + dx, y = f.y + dy, d = Math.hypot(dx, dy);
          if (d < lo || d > hi || sim.fire[x + "," + y] || !G.World.walkable(sim.world, x, y) || G.World.isWater(sim.world, x, y) || G.Agent.claimed(sim, a, x, y)) continue;
          c.push({ x, y, k: Math.hypot(x - a.pos.x, y - a.pos.y) }); }
        c.sort((p, q) => p.k - q.k || p.x - q.x || p.y - q.y);
        const t = G.Agent.tilePos(a); if (c.length && c[0].x === t.x && c[0].y === t.y) { Food.lay(sim, a); return true; }
        for (const q of c.slice(0, 4)) if (G.Agent.walkTo(sim, a, q.x, q.y, "dryFood", { item: it.id })) return true; }
    }
    const uk = Food.urge(a, "keepFood");
    if (uk > 0 && G.Cache && rng(sim).chance(Math.min(1, uk))) {
      const n = G.Cache.nearest(sim, a, c => !!(G.Shelter && G.Shelter.at(sim, c.x, c.y)) && !G.Cache.full(sim, c), Math.round((CF().cache.walkTiles || 18) * (C.keepWalkX || 1)));
      if (n) { a.keepIntent = true;
        if (!n.path.length) { G.Cache.doStash(sim, a, n.spot); return true; }
        a.act = { type: "walk", goal: "stash", path: n.path, i: 0, cacheKey: n.spot.key, cacheSpot: n.spot };
        G.Sim.log(sim, a.name + " carries meat toward a shelter", a); return true; }
    }
    return false;
  };
  // at the spot by the fire: put the meat down to dry, remember the place like a cache
  Food.lay = function (sim, a) {
    const it = G.Items.held(sim, a); if (!Food.isMeat(it)) return false; const t = G.Agent.tilePos(a);
    G.Items.drop(sim, a, "stash"); it.layBy = a.id;
    G.Sim.log(sim, a.name + " " + ((FC().lines || {}).lay || "lays meat out near the fire to dry"), a);
    if (G.Cache) G.Cache.remember(a, { key: "d:" + t.x + "," + t.y, kind: "dry", id: null, x: t.x, y: t.y }, ["meat"]);
    st(sim).laid++; G.Learn.bump(sim, "approaches", "dryFood"); Food.watch(sim, a, "dryFood");
    return true;
  };
  Food.arriveDry = function (sim, a) { if (!Food.lay(sim, a)) G.Agent.startIdle(sim, a, 0.3); else G.Agent.startIdle(sim, a, 0.4); };
  // Cache.doStash calls this for meat: first sheltered stash -> Discoveries; a deliberate keep -> its own line + watchers
  Food.onStash = function (sim, a, it, spot) {
    const sh = G.Shelter && G.Shelter.at(sim, spot.x, spot.y), was = !!a.keepIntent; a.keepIntent = false;
    if (!sh) return false;
    const d = G.Discoveries.note(sim, a, "stash", ["meat", "shelter"], "keeps longer"); if (d) d.title = "First sheltered stash";
    if (!was) return false;
    st(sim).kept++; G.Learn.bump(sim, "approaches", "keepFood");
    G.Sim.log(sim, a.name + " " + ((FC().lines || {}).keep || "stashes meat inside the {shelter}").replace("{shelter}", G.Shelter.word(sh)), a);
    Food.watch(sim, a, "keepFood"); return true;
  };

  // each minute: dried / sheltered meat spoils slower (spoilAt slides out), meat lying by a burning fire dries, rotten food falls apart
  Food.step = function (sim) {
    const items = sim.items; if (!items || !items.length) return; const C = FC(), m = TM(), fires = sim.fire && Object.keys(sim.fire).length;
    let gone = false;
    for (const it of items) {
      if (it.material === "meat") {
        const sh = Food.sheltered(sim, it); if (sh) it.shelterMin = (it.shelterMin || 0) + m;
        const x = (it.dried ? C.driedX || 1 : 1) * (sh ? C.shelteredX || 1 : 1);
        if (x > 1 && it.spoilAt != null) it.spoilAt = Math.round((it.spoilAt + m * (1 - 1 / x)) * 1e6) / 1e6;
        if (fires && !it.dried && it.heldBy == null) { const f = G.Learn.nearestFire(sim, it.x, it.y, ["fire"]);
          if (f && f.d <= C.dryTiles + 1e-9) { it.dryMin = (it.dryMin || 0) + m;
            if (it.dryMin >= C.dryMinutes) { it.dried = true; st(sim).dried++; G.Sim.log(sim, (C.lines || {}).dried || "A piece of meat by the fire dries hard");
              const who = byId(sim, it.layBy) || byId(sim, it.leftBy) || byName(sim, it.stashedBy);
              if (who && !st(sim).dryDisc) { st(sim).dryDisc = 1; const d = G.Discoveries.note(sim, who, "dried", ["meat"], "keeps longer"); if (d) d.title = "First dried food"; } } } }
      } else if (it.material === "rotten" && sim.tick - (it.rottenAt || 0) >= (C.rottenGoneDays || 3) * DAY) { it.gone = true; gone = true; }
    }
    if (gone) sim.items = items.filter(it => { if (!it.gone) return true; const h = byId(sim, it.heldBy); if (h && h.carry === it.id) { h.carry = null; h.carryUntil = null; } st(sim).rottenGone++; return false; });
  };

  // inspect card line (plain words)
  Food.card = function (sim, it) {
    const C = FC();
    if (Food.isRotten(it)) return "rotten · +" + C.rottenFullness + " fullness, only eaten when starving · sick chance ×" + C.rottenSickX + " raw meat";
    if (!Food.isMeat(it)) return "";
    const x = Food.keepX(sim, it);
    return (it.dried ? "dried (spoils " + C.driedX + "× slower)" : "not dried" + (it.dryMin ? " (" + Math.round(it.dryMin) + " of " + C.dryMinutes + " min by a fire)" : "")) +
      (Food.sheltered(sim, it) ? " · sheltered (spoils " + C.shelteredX + "× slower)" : "") + (x > 1 ? " · keeps " + Math.round(x * 10) / 10 + "× longer" : "");
  };
  // 37 -> 38: existing meat moves onto the spoilDays clock (as if taken under the new rule, never past one full span from now)
  // v38 pre-freeze fixture (test / Tester; ?fixture=cache, GS.debug.cacheFixture): person 1 keeps a cache next to her holding a fresh,
  // a dried and a rotten piece of meat (stashed by her, remembered as her cache), so the cache marker, the food cards and rot are on screen.
  Food.fixture = function (sim) {
    const a = sim.agents[0]; if (!a) return null; const FX = FC().fixture || {}, R = FX.tiles || 4, C = FX.clear == null ? 2 : FX.clear, ax = Math.round(a.pos.x), ay = Math.round(a.pos.y); let t = null;
    const clear = (x, y) => sim.agents.every(b => b.dead || Math.max(Math.abs(Math.round(b.pos.x) - x), Math.abs(Math.round(b.pos.y) - y)) >= C);   // pile not under anyone's feet
    for (let r = 1; r <= R && !t; r++) for (let dy = -r; dy <= r && !t; dy++) for (let dx = -r; dx <= r && !t; dx++) { const x = ax + dx, y = ay + dy;
      if (G.World.inb(sim.world, x, y) && G.World.walkable(sim.world, x, y) && !G.World.isWater(sim.world, x, y) && !G.Cache.itemsAt(sim, x, y).length && clear(x, y)) t = { x, y }; }
    if (!t) return null;
    const mk = () => { const it = G.Items.create(sim, "meat", t.x, t.y); it.spoilAt = sim.tick + Food.spoilMinutes(); it.from = "a deer"; it.heat = 0; it.stashedBy = a.name; sim.items.push(it); return it; };
    const fresh = mk(), dried = mk(), rotten = mk(); dried.dried = true;
    G.Cache.remember(a, { key: "t:" + t.x + "," + t.y, kind: "spot", id: null, x: t.x, y: t.y }, ["meat"]);
    G.Sim.log(sim, a.name + " stashes meat at a known place", a);
    Food.rot(sim, rotten);
    return { a, x: t.x, y: t.y, fresh, dried, rotten };
  };
  Food.migrate = function (s) {
    s.foodStats = s.foodStats || Food.newStats(); const add = Food.spoilMinutes() - CF().body.freshMinutes;
    for (const it of s.items || []) if (it.material === "meat") { const base = it.spoilAt != null ? it.spoilAt : s.tick; it.spoilAt = Math.min(s.tick + Food.spoilMinutes(), base + Math.max(0, add)); }
    return s;
  };

  G.Food = Food;
})(this.GS = this.GS || {});
