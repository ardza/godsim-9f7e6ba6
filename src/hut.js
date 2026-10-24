// §35 / v32 Built shelters. Cold people pile sticks / reeds / hides into a crude hut
// on known ground (known shelter area, known cache, or sacred-adjacent walkable tile).
// Better warmth than bare cave/thicket; one footprint; no villages; scavengers don't steal
// the structure (it is a shelter entry, not an item). First crude hut → Discoveries.
(function (G) {
  "use strict";
  const CF = () => G.data.config, HC = () => CF().hut || {}, SC = () => CF().shelter || {};
  const TM = () => CF().time.tickGameMinutes;
  const Hut = {};

  Hut.newStats = () => ({ built: 0, tries: 0, walks: 0, firsts: 0 });
  Hut.init = function (sim) { sim.hutStats = Hut.newStats(); };
  const st = sim => sim.hutStats || (sim.hutStats = Hut.newStats());

  Hut.isHut = s => !!(s && s.type === "hut");
  Hut.huts = sim => (sim.shelters || []).filter(Hut.isHut);
  Hut.at = (sim, x, y) => {
    const s = G.Shelter && G.Shelter.at(sim, x, y);
    return Hut.isHut(s) ? s : null;
  };

  function hrng(sim) {
    return sim.hrng || (sim.hrng = new G.RNG(((sim.seed >>> 0) ^ (HC().salt || 0xB017532) ^ 0x35) >>> 0));
  }
  Hut.rng = hrng;

  // Stick / reed / hide count as pile materials (hide optional, still counts toward need)
  Hut.isPileMat = it => {
    if (!it || it.lit || it.wornBy) return false;
    const m = it.material;
    return m === "stick" || m === "reed" || m === "hide";
  };
  Hut.matWeight = it => {
    if (!it) return 0;
    if (it.material === "hide") return HC().hideWeight != null ? HC().hideWeight : 1;
    if (it.material === "stick" || it.material === "reed") return 1;
    return 0;
  };

  Hut.groundNear = function (sim, x, y, R) {
    const out = [];
    for (const it of sim.items || []) {
      if (it.heldBy || it.wornBy || !Hut.isPileMat(it)) continue;
      if (Math.hypot(it.x - x, it.y - y) <= R) out.push(it);
    }
    return out;
  };

  Hut.materialsAt = function (sim, a, x, y) {
    const R = HC().gatherTiles != null ? HC().gatherTiles : 2;
    const held = G.Items.held(sim, a);
    const list = Hut.groundNear(sim, x, y, R).slice();
    if (held && Hut.isPileMat(held) && !held.wornBy) list.push(held);
    return list;
  };

  Hut.materialWeight = function (sim, a, x, y) {
    let w = 0;
    for (const it of Hut.materialsAt(sim, a, x, y)) w += Hut.matWeight(it);
    return w;
  };

  Hut.enough = (sim, a, x, y) => Hut.materialWeight(sim, a, x, y) >= (HC().needPile != null ? HC().needPile : 3);

  // Known ground: tile of a known natural shelter, a remembered cache spot, or adjacent to a known sacred marker
  Hut.knownAnchors = function (sim, a) {
    const out = [], seen = new Set();
    const add = (x, y, kind, id) => {
      const k = x + "," + y; if (seen.has(k)) return; seen.add(k);
      out.push({ x, y, kind, id: id != null ? id : null });
    };
    for (const sid of (a.shelters || [])) {
      const s = G.Shelter && G.Shelter.byId(sim, sid);
      if (!s || Hut.isHut(s) || !s.tiles) continue;
      for (const [x, y] of s.tiles) add(x, y, "shelter", s.id);
    }
    for (const c of (a.caches || [])) {
      if (c.x == null || c.y == null) continue;
      add(c.x, c.y, "cache", c.id);
    }
    const sacred = [];
    for (const q of (a.sacred || [])) sacred.push(q);
    if (a.group != null && sim.groups) {
      const g = sim.groups.find(q => q.id === a.group);
      if (g && g.sacred) for (const q of g.sacred) sacred.push(q);
    }
    for (const q of sacred) {
      if (q.x == null || q.y == null) continue;
      add(q.x, q.y, "sacred", null);
      // sacred-adjacent walkable
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = q.x + dx, y = q.y + dy;
        if (G.World.walkable(sim.world, x, y)) add(x, y, "sacredAdj", null);
      }
    }
    return out;
  };

  Hut.hutOccupied = (sim, x, y) => !!(sim.shelters || []).some(s => Hut.isHut(s) && s.tiles.some(([tx, ty]) => tx === x && ty === y));

  // Candidate build tiles: walkable land (not water), no existing hut; prefer beside/on known anchors
  Hut.sitesNear = function (sim, a, maxR) {
    const R = maxR != null ? maxR : (HC().siteTiles != null ? HC().siteTiles : 12);
    const t = G.Agent.tilePos(a), anchors = Hut.knownAnchors(sim, a);
    if (!anchors.length) return [];
    const cand = [], seen = new Set();
    const consider = (x, y, kind, id, dAnchor) => {
      const k = x + "," + y; if (seen.has(k)) return; seen.add(k);
      if (!G.World.inb(sim.world, x, y) || !G.World.walkable(sim.world, x, y)) return;
      // not mid-water (walkable already excludes deep water; still skip if tile is water)
      const tile = G.World.tile(sim.world, x, y);
      if (tile === G.data.T.WATER) return;
      if (Hut.hutOccupied(sim, x, y)) return;
      // don't overwrite another natural shelter's only tile? OK to build on shelter tile (improves it via separate hut entry — but Shelter.at conflict). Prefer adjacent.
      const nat = G.Shelter && G.Shelter.at(sim, x, y);
      if (nat && !Hut.isHut(nat)) {
        // allow building on natural shelter tile only if multi-tile; else prefer neighbor handled below
        if (nat.tiles.length <= 1) return;
      }
      const dMe = Math.hypot(x - t.x, y - t.y);
      if (dMe > R) return;
      cand.push({ x, y, kind, id, d: dMe, dAnchor: dAnchor != null ? dAnchor : 0 });
    };
    for (const an of anchors) {
      // prefer adjacent to the anchor (keeps natural shelter art, cache clear)
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const x = an.x + dx, y = an.y + dy;
        consider(x, y, an.kind, an.id, Math.hypot(dx, dy));
      }
    }
    cand.sort((p, q) => (p.dAnchor - q.dAnchor) || (p.d - q.d) || (p.y - q.y) || (p.x - q.x));
    return cand;
  };

  Hut.pickSite = function (sim, a) {
    const sites = Hut.sitesNear(sim, a);
    for (const s of sites) {
      if (!Hut.enough(sim, a, s.x, s.y) && !Hut.enough(sim, a, Math.round(a.pos.x), Math.round(a.pos.y))) {
        // materials follow the person — check with materials at person if she'll walk there carrying/nearby
        const tw = Hut.materialWeight(sim, a, Math.round(a.pos.x), Math.round(a.pos.y));
        if (tw < (HC().needPile != null ? HC().needPile : 3)) continue;
      }
      return s;
    }
    // fallback: any known site if person already has enough materials on them/near them
    if (Hut.enough(sim, a, Math.round(a.pos.x), Math.round(a.pos.y))) return sites[0] || null;
    return null;
  };

  function consumeMats(sim, a, x, y) {
    const need = HC().needPile != null ? HC().needPile : 3;
    const R = HC().gatherTiles != null ? HC().gatherTiles : 2;
    let got = 0;
    const take = (it) => {
      if (!it || got >= need) return;
      const w = Hut.matWeight(it); if (!w) return;
      if (it.heldBy === a.id) { a.carry = null; a.carryUntil = null; it.heldBy = null; }
      const ix = sim.items.indexOf(it); if (ix >= 0) sim.items.splice(ix, 1);
      got += w;
    };
    // prefer ground near build site, then held
    const ground = Hut.groundNear(sim, x, y, R).sort((p, q) => Hut.matWeight(q) - Hut.matWeight(p) || p.id - q.id);
    for (const it of ground) take(it);
    const held = G.Items.held(sim, a);
    if (held) take(held);
    // if still short, grab more ground near the person
    if (got < need) {
      const more = Hut.groundNear(sim, Math.round(a.pos.x), Math.round(a.pos.y), R);
      for (const it of more) take(it);
    }
    return got >= need;
  }

  Hut.invalidate = function (sim) {
    if (sim && sim._shAt) { try { delete sim._shAt; } catch (e) { sim._shAt = null; } }
  };

  Hut.nextId = function (sim) {
    let m = 0;
    for (const s of sim.shelters || []) if (s.id > m) m = s.id;
    return m + 1;
  };

  Hut.create = function (sim, x, y, who) {
    const C = HC(), Sc = SC();
    const hut = {
      id: Hut.nextId(sim),
      type: "hut",
      tiles: [[x, y]],
      cap: C.cap != null ? C.cap : 3,
      warmX: C.warmX != null ? C.warmX : 1.2,
      rain: C.rain != null ? C.rain : 0.85,
      walkX: 1,
      built: true,
      stage: "hut",
      builtAt: sim.tick,
      builtBy: who ? who.id : null
    };
    if (!sim.shelters) sim.shelters = [];
    sim.shelters.push(hut);
    Hut.invalidate(sim);
    return hut;
  };

  Hut.doBuild = function (sim, a, x, y) {
    if (!a || Hut.hutOccupied(sim, x, y)) return null;
    if (!G.World.walkable(sim.world, x, y)) return null;
    if (G.World.tile(sim.world, x, y) === G.data.T.WATER) return null;
    if (!consumeMats(sim, a, x, y)) return null;
    const hut = Hut.create(sim, x, y, a);
    st(sim).built++;
    a.stats = a.stats || {}; a.stats.huts = (a.stats.huts || 0) + 1;
    if (G.Shelter && G.Shelter.know) G.Shelter.know(sim, a, hut);
    // enter immediately if idle/cold
    a.den = hut.id; a.denW0 = a.needs.warmth; a.denSlept = a.act.type === "sleep";
    G.Sim.log(sim, a.name + " piles sticks and reeds into a crude hut", a);
    const d = G.Discoveries.note(sim, a, "build", ["hut"], "crude shelter");
    if (d) { d.title = "First crude hut"; st(sim).firsts++; }
    return hut;
  };

  Hut.cold = function (sim, a) {
    if (!a || !a.needs) return false;
    const below = HC().coldBelow != null ? HC().coldBelow : (G.Agent.warmthSeekBelow ? G.Agent.warmthSeekBelow(a) : 50);
    return a.needs.warmth < below;
  };

  Hut.chance = function (sim, a) {
    const C = HC();
    const den = G.Learn ? G.Learn.score(a, "den") : 50;
    const floor = C.scoreFloor != null ? C.scoreFloor : 40;
    const cur = (a.traits && a.traits.curiosity != null) ? a.traits.curiosity : 50;
    const base = C.tryChance != null ? C.tryChance : 0.35;
    const denF = Math.max(0, Math.min(1.5, 0.5 + (den - floor) / Math.max(1, 100 - floor)));
    return Math.max(0, Math.min(1, base * (cur / 50) * denF));
  };

  // Cold + materials + known ground → walk to site or build. Called from seekWarmth / idle.
  Hut.maybe = function (sim, a) {
    if (!a || !sim) return false;
    if (G.Family && G.Family.isChild && G.Family.isChild(a)) return false;
    if (a.act && a.act.type === "walk" && a.act.goal === "hut") return true;
    if (!Hut.cold(sim, a)) return false;
    if (a.den != null) return false;   // already in a shelter
    const every = (HC().tryEveryMinutes != null ? HC().tryEveryMinutes : 60) / TM();
    if (a.hutTry != null && sim.tick - a.hutTry < every) return false;
    a.hutTry = sim.tick;
    st(sim).tries++;
    if (!hrng(sim).chance(Hut.chance(sim, a))) return false;
    const site = Hut.pickSite(sim, a);
    if (!site) return false;
    // need materials at person (they'll use them at the site)
    const need = HC().needPile != null ? HC().needPile : 3;
    if (Hut.materialWeight(sim, a, Math.round(a.pos.x), Math.round(a.pos.y)) < need
      && Hut.materialWeight(sim, a, site.x, site.y) < need) return false;
    const t = G.Agent.tilePos(a);
    if (t.x === site.x && t.y === site.y) {
      return !!Hut.doBuild(sim, a, site.x, site.y);
    }
    if (!G.Agent.walkTo(sim, a, site.x, site.y, "hut", { hutX: site.x, hutY: site.y })) return false;
    st(sim).walks++;
    G.Sim.log(sim, a.name + " gathers sticks to pile a shelter", a);
    return true;
  };

  Hut.arrive = function (sim, a) {
    const x = a.act && a.act.hutX != null ? a.act.hutX : Math.round(a.pos.x);
    const y = a.act && a.act.hutY != null ? a.act.hutY : Math.round(a.pos.y);
    const need = HC().needPile != null ? HC().needPile : 3;
    if (Hut.materialWeight(sim, a, x, y) < need && Hut.materialWeight(sim, a, Math.round(a.pos.x), Math.round(a.pos.y)) < need) {
      a.act = { type: "idle", until: sim.tick + 30 };
      return false;
    }
    const hut = Hut.doBuild(sim, a, x, y);
    if (!hut) { a.act = { type: "idle", until: sim.tick + 30 }; return false; }
    a.act = { type: "idle", until: sim.tick + 60 };
    return true;
  };

  G.Hut = Hut;
})(this.GS = this.GS || {});
