// §32 / v29 Carrying & caching. Hands stay one item. Prefer stashing food/tools at a known
// shelter or prayer spot; personal a.caches memory; copy by watching; first stash → Discoveries.
// Action-only logs. No bags / multi-slot / trade.
(function (G) {
  "use strict";
  const CF = () => G.data.config, CC = () => CF().cache || {}, TM = () => CF().time.tickGameMinutes;
  const Cache = {};

  Cache.newStats = () => ({ stashes: 0, retrieves: 0, copies: 0, firsts: 0 });
  Cache.init = function (sim) { sim.cacheStats = Cache.newStats(); };
  const st = sim => sim.cacheStats || (sim.cacheStats = Cache.newStats());

  // Food (meat) + tools (flake/axe/spear/long stick) + optional hide
  Cache.cacheable = function (it) {
    if (!it || it.lit) return false;
    if (it.material === "meat") return true;
    if (it.material === "hide" && (CC().includeHide !== false)) return true;
    if (G.Tools) {
      if (G.Tools.is(it, "flake") || G.Tools.is(it, "axe") || G.Tools.is(it, "spear")) return true;
      if (it.tool === "long" || (it.material === "stick" && it.long)) return true;
    }
    // untyped long stick / flake-ish materials still useful as tools
    if (it.material === "stick" || it.material === "flint" || it.material === "rock" || it.material === "bone" || it.material === "ore") return true;
    return false;
  };
  Cache.isFood = it => !!it && it.material === "meat";
  Cache.isTool = it => Cache.cacheable(it) && !Cache.isFood(it);

  Cache.kindOf = it => {
    if (!it) return null;
    if (it.material === "meat") return "meat";
    if (it.material === "hide") return "hide";
    if (G.Tools) {
      if (G.Tools.is(it, "flake")) return "flake";
      if (G.Tools.is(it, "axe")) return "axe";
      if (G.Tools.is(it, "spear")) return "spear";
    }
    if (it.tool === "long" || (it.material === "stick" && it.long)) return "long stick";
    return it.material;
  };

  Cache.keyShelter = id => "s:" + id;
  Cache.keyPrayer = (x, y) => "p:" + x + "," + y;

  Cache.list = a => a.caches || (a.caches = []);

  Cache.findMem = (a, key) => Cache.list(a).find(c => c.key === key) || null;

  Cache.remember = function (a, spot, kinds) {
    const L = Cache.list(a);
    let m = L.find(c => c.key === spot.key);
    if (!m) { m = { key: spot.key, kind: spot.kind, id: spot.id != null ? spot.id : null, x: spot.x, y: spot.y, lastKinds: [] }; L.push(m); }
    m.x = spot.x; m.y = spot.y;
    if (kinds && kinds.length) {
      for (const k of kinds) if (m.lastKinds.indexOf(k) < 0) m.lastKinds.push(k);
      while (m.lastKinds.length > 6) m.lastKinds.shift();
    }
    return m;
  };

  // Candidate stash spots: remembered caches, else known shelters / faith prayer spots
  Cache.candidates = function (sim, a) {
    const out = [], seen = new Set();
    for (const m of Cache.list(a)) {
      if (seen.has(m.key)) continue; seen.add(m.key);
      out.push({ key: m.key, kind: m.kind, id: m.id, x: m.x, y: m.y, known: true });
    }
    for (const sid of (a.shelters || [])) {
      const s = G.Shelter && G.Shelter.byId(sim, sid); if (!s || !s.tiles || !s.tiles.length) continue;
      const key = Cache.keyShelter(s.id); if (seen.has(key)) continue; seen.add(key);
      const [x, y] = s.tiles[0];
      out.push({ key, kind: "shelter", id: s.id, x, y, known: false });
    }
    for (const q of (sim.faith && sim.faith.spots) || []) {
      const key = Cache.keyPrayer(q.x, q.y); if (seen.has(key)) continue; seen.add(key);
      out.push({ key, kind: "prayer", id: null, x: q.x, y: q.y, known: false });
    }
    return out;
  };

  Cache.nearest = function (sim, a, filter, maxTiles) {
    const R = maxTiles != null ? maxTiles : (CC().walkTiles != null ? CC().walkTiles : 18);
    const t = G.Agent.tilePos(a);
    let best = null, bd = 1e9;
    for (const c of Cache.candidates(sim, a)) {
      if (filter && !filter(c)) continue;
      const d = Math.hypot(c.x - t.x, c.y - t.y);
      if (d > R || d >= bd) continue;
      if (!G.World.walkable(sim.world, c.x, c.y)) continue;
      const p = G.World.findPath(sim.world, t.x, t.y, c.x, c.y);
      if (!p || p.length > R + 2) continue;
      bd = d; best = { spot: c, path: p, d };
    }
    return best;
  };

  Cache.itemsAt = (sim, x, y) => (sim.items || []).filter(i => !i.heldBy && !i.wornBy && i.x === x && i.y === y);

  // Watchers within sight copy the spot into their own cache memory
  Cache.notifyWatchers = function (sim, actor, spot, kinds, verb) {
    const R = CF().person.sightTiles != null ? CF().person.sightTiles : 12;
    const chance = CC().copyChance != null ? CC().copyChance : 0.55;
    for (const b of sim.agents) {
      if (b === actor) continue;
      if (G.Family && G.Family.isChild && G.Family.isChild(b)) continue;
      const d = Math.hypot(b.pos.x - actor.pos.x, b.pos.y - actor.pos.y);
      if (d > R) continue;
      if (!(sim.lrng || sim.rng).chance(chance)) continue;
      if (Cache.findMem(b, spot.key)) { Cache.remember(b, spot, kinds); continue; }
      Cache.remember(b, spot, kinds);
      st(sim).copies++;
      G.Sim.log(sim, b.name + " watched " + actor.name + " and now knows a cache spot", [b, actor]);
    }
  };

  Cache.doStash = function (sim, a, spot) {
    const it = G.Items.held(sim, a);
    if (!it || !Cache.cacheable(it)) return false;
    const kind = Cache.kindOf(it);
    G.Items.drop(sim, a, "stash");
    // drop already logged "puts down"; add stash line
    G.Sim.log(sim, a.name + " stashes " + (kind === "meat" ? "meat" : "a " + kind) + " at a known place", a);
    Cache.remember(a, spot, [kind]);
    st(sim).stashes++;
    a.stats = a.stats || {}; a.stats.stashes = (a.stats.stashes || 0) + 1;
    const d = G.Discoveries.note(sim, a, "stash", [kind], "left for later");
    if (d) { d.title = "First cache"; st(sim).firsts++; }
    Cache.notifyWatchers(sim, a, spot, [kind], "stash");
    return true;
  };

  Cache.doRetrieve = function (sim, a, spot, wantFood) {
    if (a.carry != null) return false;
    const items = Cache.itemsAt(sim, spot.x, spot.y).filter(Cache.cacheable);
    let it = null;
    if (wantFood) it = items.find(Cache.isFood) || null;
    if (!it && !wantFood) it = items.find(Cache.isTool) || items[0] || null;
    if (!it && wantFood) it = items[0] || null;
    if (!it) {
      // memory stale — still remember spot but clear food kinds if looking for food
      const m = Cache.findMem(a, spot.key);
      if (m && wantFood) m.lastKinds = (m.lastKinds || []).filter(k => k !== "meat");
      return false;
    }
    const kind = Cache.kindOf(it);
    if (!G.Items.pickUp(sim, a, it.id)) return false;
    G.Sim.log(sim, a.name + " takes " + (kind === "meat" ? "meat" : "a " + kind) + " from a cache", a);
    Cache.remember(a, spot, [kind]);
    st(sim).retrieves++;
    a.stats = a.stats || {}; a.stats.retrieves = (a.stats.retrieves || 0) + 1;
    Cache.notifyWatchers(sim, a, spot, [kind], "retrieve");
    return true;
  };

  // When about to free hands: walk to a known/nearby cache spot instead of dropping here
  Cache.tryStash = function (sim, a) {
    if (!a || a.carry == null) return false;
    if (G.Family && G.Family.isChild && G.Family.isChild(a)) return false;
    const it = G.Items.held(sim, a);
    if (!Cache.cacheable(it)) return false;
    // already walking to stash
    if (a.act && a.act.type === "walk" && a.act.goal === "stash") return true;
    const t = G.Agent.tilePos(a);
    // already on a candidate spot → stash now
    const here = Cache.candidates(sim, a).find(c => c.x === t.x && c.y === t.y);
    if (here) { Cache.doStash(sim, a, here); return true; }
    const n = Cache.nearest(sim, a, null, CC().walkTiles != null ? CC().walkTiles : 18);
    if (!n) return false;
    // same tile path empty → stash
    if (!n.path.length) { Cache.doStash(sim, a, n.spot); return true; }
    a.act = { type: "walk", goal: "stash", path: n.path, i: 0, cacheKey: n.spot.key, cacheSpot: n.spot };
    G.Sim.log(sim, a.name + " heads to a known place to leave what they carry", a);
    return true;
  };

  // Hungry / needing a tool: walk to a remembered cache that last held the right kind
  Cache.seekRetrieve = function (sim, a, want) {
    if (!a || a.carry != null) return false;
    if (G.Family && G.Family.isChild && G.Family.isChild(a)) return false;
    if (a.act && a.act.type === "walk" && a.act.goal === "cache") return true;
    const wantFood = want === "food" || want == null;
    const filter = c => {
      const m = Cache.findMem(a, c.key);
      if (!m) return false;
      if (wantFood) return !m.lastKinds.length || m.lastKinds.indexOf("meat") >= 0
        || Cache.itemsAt(sim, c.x, c.y).some(Cache.isFood);
      return m.lastKinds.some(k => k !== "meat") || Cache.itemsAt(sim, c.x, c.y).some(Cache.isTool);
    };
    // Prefer spots that still have matching ground items
    const withItem = Cache.nearest(sim, a, c => {
      if (!Cache.findMem(a, c.key)) return false;
      const items = Cache.itemsAt(sim, c.x, c.y);
      return wantFood ? items.some(Cache.isFood) : items.some(Cache.isTool) || items.some(Cache.cacheable);
    });
    const n = withItem || Cache.nearest(sim, a, filter);
    if (!n) return false;
    const t = G.Agent.tilePos(a);
    if (n.spot.x === t.x && n.spot.y === t.y) {
      if (Cache.doRetrieve(sim, a, n.spot, wantFood)) {
        if (wantFood && G.Hunt && G.Hunt.edible(sim, G.Items.held(sim, a))) G.Hunt.seekFood(sim, a);
        return true;
      }
      return false;
    }
    a.act = { type: "walk", goal: "cache", path: n.path, i: 0, cacheKey: n.spot.key, cacheSpot: n.spot, wantFood: !!wantFood };
    G.Sim.log(sim, a.name + " goes back to a cache", a);
    return true;
  };

  Cache.arriveStash = function (sim, a) {
    const spot = a.act.cacheSpot || Cache.candidates(sim, a).find(c => c.key === a.act.cacheKey);
    if (!spot) { G.Agent.startIdle(sim, a, 0.3); return false; }
    if (a.carry == null || !Cache.cacheable(G.Items.held(sim, a))) { G.Agent.startIdle(sim, a, 0.3); return false; }
    Cache.doStash(sim, a, spot);
    G.Agent.startIdle(sim, a, 0.4);
    return true;
  };

  Cache.arriveRetrieve = function (sim, a) {
    const spot = a.act.cacheSpot || Cache.candidates(sim, a).find(c => c.key === a.act.cacheKey);
    if (!spot) { G.Agent.startIdle(sim, a, 0.3); return false; }
    const wantFood = a.act.wantFood !== false;
    const ok = Cache.doRetrieve(sim, a, spot, wantFood);
    if (ok && wantFood && G.Hunt && G.Hunt.edible(sim, G.Items.held(sim, a))) { G.Hunt.seekFood(sim, a); return true; }
    G.Agent.startIdle(sim, a, 0.4);
    return ok;
  };

  // All tiles any living person remembers (for optional map tint)
  Cache.markedTiles = function (sim) {
    const m = new Map();
    for (const a of sim.agents || []) for (const c of (a.caches || [])) m.set(c.x + "," + c.y, c);
    return m;
  };

  G.Cache = Cache;
})(this.GS = this.GS || {});
