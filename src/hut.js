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
    let got = 0; const mats = {};
    const take = (it) => {
      if (!it || got >= need) return;
      const w = Hut.matWeight(it); if (!w) return;
      mats[it.material] = (mats[it.material] || 0) + 1;
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
    return got >= need ? mats : null;
  }

  Hut.invalidate = function (sim) {
    if (sim && sim._shAt) { try { delete sim._shAt; } catch (e) { sim._shAt = null; } }
  };

  Hut.nextId = function (sim) {
    let m = 0;
    for (const s of sim.shelters || []) if (s.id > m) m = s.id;
    return m + 1;
  };

  Hut.create = function (sim, x, y, who, mats) {
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
      builtBy: who ? who.id : null,
      mats: Object.assign({}, mats || { stick: C.needPile != null ? C.needPile : 3 }),   // v38: what went in
      dur: (C.dur && C.dur.start != null) ? C.dur.start : 80                              // v38: 0-100
    };
    Hut.refresh(hut);
    if (!sim.shelters) sim.shelters = [];
    sim.shelters.push(hut);
    Hut.invalidate(sim);
    return hut;
  };

  Hut.doBuild = function (sim, a, x, y) {
    if (!a || Hut.hutOccupied(sim, x, y)) return null;
    if (!G.World.walkable(sim.world, x, y)) return null;
    if (G.World.tile(sim.world, x, y) === G.data.T.WATER) return null;
    const mats = consumeMats(sim, a, x, y); if (!mats) return null;
    const hut = Hut.create(sim, x, y, a, mats);
    st(sim).built++;
    a.stats = a.stats || {}; a.stats.huts = (a.stats.huts || 0) + 1;
    if (G.Shelter && G.Shelter.know) G.Shelter.know(sim, a, hut);
    // enter immediately if idle/cold
    a.den = hut.id; a.denW0 = a.needs.warmth; a.denSlept = a.act.type === "sleep";
    G.Sim.log(sim, a.name + " piles " + Hut.matsText(hut.mats) + " into " + (Hut.tier(hut).k === "sticks" ? "a crude hut" : "a " + Hut.tier(hut).label), a);
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

  // ================= v38 (a): tiers from materials, durability, tending, collapse =================
  const DC = () => HC().dur || {};
  const MAT_WORD = { stick: ["stick", "sticks"], reed: ["reed", "reeds"], hide: ["hide", "hides"] };
  Hut.matsText = function (m) {
    const out = [];
    for (const k of ["stick", "reed", "hide"]) { const n = (m && m[k]) || 0; if (n) out.push(n + " " + MAT_WORD[k][n === 1 ? 0 : 1]); }
    return out.length ? out.join(", ") : "nothing";
  };
  Hut.total = h => { let n = 0; for (const k in (h.mats || {})) n += h.mats[k] || 0; return n; };
  // the last tier in config.hut.tiers whose need is met
  Hut.tier = function (h) {
    const T = HC().tiers || []; let best = T[0] || { k: "sticks", label: "crude hut", warmX: HC().warmX || 1.2, rain: HC().rain || 0.85, decayX: 1 };
    const m = (h && h.mats) || {}, tot = h ? Hut.total(h) : 0;
    for (const t of T) { let okT = true; for (const k in (t.need || {})) { const have = k === "total" ? tot : (m[k] || 0); if (have < t.need[k]) { okT = false; break; } } if (okT) best = t; }
    return best;
  };
  Hut.tierIndex = h => Math.max(0, (HC().tiers || []).indexOf(Hut.tier(h)));
  Hut.worn = h => (h.dur != null ? h.dur : 100) < (DC().wornBelow != null ? DC().wornBelow : 50);
  // push tier + wear onto the shelter fields every other system already reads (warmX for Shelter.warmC, rain for Powers.exposure / cover)
  Hut.refresh = function (h) {
    const t = Hut.tier(h), D = DC(), w = Hut.worn(h);
    h.tier = t.k;
    h.warmX = Math.round(t.warmX * (w ? (D.wornWarmX != null ? D.wornWarmX : 1) : 1) * 1000) / 1000;
    h.rain = Math.round(t.rain * (w ? (D.wornRainX != null ? D.wornRainX : 1) : 1) * 1000) / 1000;
    return h;
  };
  Hut.artCol = function (h) {   // Render: hutTier column name for this hut (per-tier worn frame from config)
    const t = Hut.tier(h); return Hut.worn(h) ? (t.artWorn || t.art || t.k) : (t.art || t.k);
  };
  const clampD = v => Math.max(0, Math.min(100, Math.round(v * 1e6) / 1e6));

  // damage from anything (lightning / fire / trample / test); collapses at 0
  Hut.damage = function (sim, h, amt, why) {
    if (!h || !(amt > 0)) return h;
    const was = Hut.worn(h); h.dur = clampD((h.dur != null ? h.dur : 100) - amt);
    const St = st(sim); St.damage = Math.round(((St.damage || 0) + amt) * 1000) / 1000;
    if (h.dur <= 0) { Hut.collapse(sim, h, why); return null; }
    if (Hut.worn(h) !== was) Hut.refresh(h);
    return h;
  };
  // collapse: the shelter entry goes, people inside are out, its mats drop as items on nearby walkable tiles
  Hut.collapse = function (sim, h, why) {
    const ix = (sim.shelters || []).indexOf(h); if (ix < 0) return [];
    sim.shelters.splice(ix, 1); Hut.invalidate(sim);
    for (const a of sim.agents) { if (a.den === h.id) { a.den = null; a.denW0 = null; a.denSlept = false; } if (a.shelters) { const k = a.shelters.indexOf(h.id); if (k >= 0) a.shelters.splice(k, 1); } }
    const [x0, y0] = h.tiles[0], R = DC().collapseScatter != null ? DC().collapseScatter : 2, tiles = [];
    for (let r = 0; r <= R; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const x = x0 + dx, y = y0 + dy;
      if (G.World.inb(sim.world, x, y) && G.World.walkable(sim.world, x, y) && !G.World.isWater(sim.world, x, y)) tiles.push([x, y]); }
    const out = []; let i = 0; const MAT = { stick: "stick", reed: "reed", hide: "hide" };
    for (const k of ["stick", "reed", "hide"]) for (let n = 0; n < ((h.mats && h.mats[k]) || 0); n++) {
      if (!G.data.materials[MAT[k]]) continue; const [x, y] = tiles.length ? tiles[i++ % tiles.length] : [x0, y0];
      const it = G.Items.create(sim, MAT[k], x, y); sim.items.push(it); out.push(it); }
    st(sim).collapsed = (st(sim).collapsed || 0) + 1;
    G.Sim.log(sim, "The " + Hut.tier(h).label + " " + (HC().collapseLine || "falls in, scattering its") + " " + Hut.matsText(h.mats));
    return out;
  };
  // per-minute wear rate (points per minute) at this hut right now: weather x tier
  Hut.decayRate = function (sim, h) {
    const D = DC(), [x, y] = h.tiles[0]; let r = (D.decayPerDay != null ? D.decayPerDay : 3) / 1440;
    const P = G.Powers, rs = P && P.rainStrAt ? P.rainStrAt(sim, x, y) : null;
    if (rs) { r *= (D.rainX && D.rainX[rs] != null) ? D.rainX[rs] : 1;
      const sm = (D.stormMinutes != null ? D.stormMinutes : 60) / TM(), stT = D.stormTiles != null ? D.stormTiles : 12;
      if ((sim._hutBolts || []).some(b => sim.tick - b.t <= sm && Math.hypot(b.x - x, b.y - y) <= stT)) r *= D.stormX != null ? D.stormX : 1; }
    const airF = G.Climate.airAt(sim, x, y) * 9 / 5 + 32; if (airF < (D.coldBelowF != null ? D.coldBelowF : 32)) r *= D.coldX != null ? D.coldX : 1;
    return r * (Hut.tier(h).decayX != null ? Hut.tier(h).decayX : 1) * TM();
  };
  Hut.bolt = function (sim, x, y) {   // a lightning bolt landed at (x, y): remember it for storm wear, hit huts on / next to it
    const B = sim._hutBolts || (Object.defineProperty(sim, "_hutBolts", { value: [], enumerable: false, writable: true, configurable: true }), sim._hutBolts);
    B.push({ x, y, t: sim.tick }); if (B.length > 50) B.splice(0, B.length - 50);
    const D = DC(), nt = D.lightningNearTiles != null ? D.lightningNearTiles : 1;
    for (const h of Hut.huts(sim).slice()) { const [hx, hy] = h.tiles[0], d = Math.max(Math.abs(hx - x), Math.abs(hy - y));
      if (d === 0) Hut.damage(sim, h, D.lightning != null ? D.lightning : 60, "lightning");
      else if (d <= nt) Hut.damage(sim, h, D.lightningNear != null ? D.lightningNear : 20, "lightning"); }
  };
  // every minute (after fire): weather wear, flames, trampling, natural lightning
  Hut.step = function (sim, bolt) {
    if (bolt) Hut.bolt(sim, bolt.x, bolt.y);   // natural strike this minute (Sim.step reads it off Fire.lightning's fx)
    const huts = Hut.huts(sim); if (!huts.length) return;
    const D = DC(), Tr = D.trample || {};
    for (const h of huts) {
      if (h.dur == null) { h.dur = D.migrate != null ? D.migrate : 100; Hut.refresh(h); }
      const [x, y] = h.tiles[0]; let dmg = Hut.decayRate(sim, h);
      const f = sim.fire && sim.fire[x + "," + y]; if (f && f.s === "fire") dmg += (D.firePerMinute != null ? D.firePerMinute : 1.5) * TM();
      for (const an of sim.animals || []) if (!an.dead && Tr[an.species] && Math.round(an.pos.x) === x && Math.round(an.pos.y) === y) dmg += Tr[an.species] * TM();
      Hut.damage(sim, h, dmg, f ? "fire" : "wear");
    }
  };

  // one piece onto an existing hut: grows the pile (to maxMats), restores durability, may raise the tier. Same act as building.
  Hut.addTo = function (sim, a, h, it) {
    if (!h || !it || !Hut.isPileMat(it)) return false;
    const m = it.material, before = Hut.tier(h), wasWorn = (h.dur != null ? h.dur : 100) < (DC().patchBelow != null ? DC().patchBelow : 50);
    if (it.heldBy === a.id) { a.carry = null; a.carryUntil = null; it.heldBy = null; }
    const ix = sim.items.indexOf(it); if (ix >= 0) sim.items.splice(ix, 1);
    h.mats = h.mats || {}; if (Hut.total(h) < (HC().maxMats != null ? HC().maxMats : 10)) h.mats[m] = (h.mats[m] || 0) + 1;
    h.dur = clampD((h.dur != null ? h.dur : 100) + ((HC().patch || {})[m] || 0));
    Hut.refresh(h);
    const S = st(sim); S.adds = (S.adds || 0) + 1; if (wasWorn) S.patches = (S.patches || 0) + 1;
    G.Sim.log(sim, a.name + " " + ((wasWorn ? HC().patchLines : HC().addLines) || {})[m], a);
    const after = Hut.tier(h);
    if (after !== before && after === (HC().tiers || [])[(HC().tiers || []).length - 1]) {
      const d = G.Discoveries.note(sim, a, "build", ["sturdy hut"], "hide-covered shelter"); if (d) { d.title = "First sturdy hut"; S.firsts++; } }
    if (m === "hide") {   // remember who saw the hide go on, for copying when she wakes warm inside
      const Cp = HC().copy || {}, seen = sim.agents.filter(b => b !== a && b.act.type !== "sleep" && Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y) <= (Cp.tiles != null ? Cp.tiles : 5)).map(b => b.id);
      h.hideAdd = { by: a.id, t: sim.tick, seen };
    }
    return true;
  };
  // she woke warm inside (Shelter.step): if she put the hide on, that's her success, and those who saw it may copy
  Hut.wokeWarm = function (sim, a, h) {
    if (!Hut.isHut(h) || !h.hideAdd || h.hideAdd.by !== a.id) return 0;
    const Cp = HC().copy || {}, win = (Cp.windowMinutes != null ? Cp.windowMinutes : 2880) / TM();
    if (sim.tick - h.hideAdd.t > win) { h.hideAdd = null; return 0; }
    const L = G.Learn; L.add(a, "hutHide", Cp.gain != null ? Cp.gain : 10); L.bump(sim, "successes", "hutHide");
    const sa = L.score(a, "hutHide"); let n = 0;
    for (const id of h.hideAdd.seen || []) { const b = sim.agents.find(q => q.id === id); if (!b || b.act.type === "sleep") continue;
      const own = L.score(b, "hutHide"); if (sa <= own) continue;
      if (!hrng(sim).chance(L.copyChance(b, "hutHide"))) continue;
      const e = L.rec(b, "hutHide"); e.score = Math.round((own + (sa - own) * G.data.config.learn.copyShare) * 100) / 100; e.copied = { from: a.id, name: a.name, t: sim.tick };
      L.bump(sim, "copies", "hutHide"); n++; st(sim).hideCopies = (st(sim).hideCopies || 0) + 1;
      G.Sim.log(sim, b.name + " watched " + a.name + " and copied: " + L.label("hutHide"), [b, a]); }
    h.hideAdd = null; return n;
  };
  // which piece she could add to h (held first, then ground near the hut / near her); null if none or she'd rather not
  function tendPiece(sim, a, h, upgradeOnly) {
    const R = HC().gatherTiles != null ? HC().gatherTiles : 2, [x, y] = h.tiles[0], held = G.Items.held(sim, a);
    const cands = []; if (held && Hut.isPileMat(held)) cands.push(held);
    for (const it of Hut.groundNear(sim, x, y, R)) cands.push(it);
    if (!upgradeOnly) return cands[0] || null;
    // upgrade: a piece that would move the tier up (reed on sticks, hide on sticks/reeds)
    const ti = Hut.tierIndex(h);
    for (const it of cands) { const test = { mats: Object.assign({}, h.mats) }; test.mats[it.material] = (test.mats[it.material] || 0) + 1; if (Hut.tierIndex(test) > ti) return it; }
    return null;
  }
  // idle: notice a worn known hut close by and patch it, or add a better piece to it (hide odds rise with the hutHide score)
  Hut.tend = function (sim, a) {
    if (!a || !sim || !Hut.huts(sim).length) return false;
    if (G.Family && G.Family.isChild && G.Family.isChild(a)) return false;
    const T = HC().tend || {}, every = (T.everyMinutes != null ? T.everyMinutes : 30) / TM();
    if (a.hutTend != null && sim.tick - a.hutTend < every) return false;
    a.hutTend = sim.tick;
    const pb = DC().patchBelow != null ? DC().patchBelow : 50, nt = T.noticeTiles != null ? T.noticeTiles : 6, t = G.Agent.tilePos(a);
    let best = null;
    for (const h of Hut.huts(sim)) { if ((a.shelters || []).indexOf(h.id) < 0) continue; const [x, y] = h.tiles[0], d = Math.hypot(x - t.x, y - t.y); if (d > nt) continue;
      const worn = (h.dur != null ? h.dur : 100) < pb; if (!best || (worn && !best.worn) || (worn === best.worn && d < best.d)) best = { h, d, worn, x, y }; }
    if (!best) return false;
    let it = tendPiece(sim, a, best.h, !best.worn);
    if (!it) return false;
    if (!best.worn) {   // upgrading is optional: curiosity, and for a hide the learned hutHide score
      const cur = (a.traits && a.traits.curiosity != null ? a.traits.curiosity : 50) / 50;
      let p = (T.upgradeChance != null ? T.upgradeChance : 0.25) * cur;
      if (it.material === "hide") p = (T.hideChance != null ? T.hideChance : 0.3) * cur * G.Learn.score(a, "hutHide") / 50;
      if (!hrng(sim).chance(Math.max(0, Math.min(1, p)))) return false;
    }
    const R = HC().gatherTiles != null ? HC().gatherTiles : 2;
    const nearHut = Math.hypot(best.x - a.pos.x, best.y - a.pos.y) <= 1.5;
    if (nearHut && (it.heldBy === a.id || Math.hypot(it.x - best.x, it.y - best.y) <= R)) return Hut.addTo(sim, a, best.h, it);
    if (it.heldBy !== a.id) return false;   // she brings what she holds; ground pieces are used once she's there
    if (!G.Agent.walkTo(sim, a, best.x, best.y, "hutTend", { hutId: best.h.id })) return false;
    st(sim).tendWalks = (st(sim).tendWalks || 0) + 1;
    G.Sim.log(sim, a.name + " " + ((HC().tendLines || {}).walk || "carries material to the hut"), a);
    return true;
  };
  Hut.arriveTend = function (sim, a) {
    const h = Hut.huts(sim).find(q => q.id === (a.act && a.act.hutId));
    if (h) { const it = tendPiece(sim, a, h, false); if (it) Hut.addTo(sim, a, h, it); }
    G.Agent.startIdle(sim, a, 0.5);
    return !!h;
  };
  Hut.byId = (sim, id) => Hut.huts(sim).find(q => q.id === id) || null;
  Hut.selId = h => "hut:" + h.id;
  Hut.fromSel = (sim, sel) => typeof sel === "string" && sel.indexOf("hut:") === 0 ? Hut.byId(sim, +sel.slice(4)) : null;
  // what the inspect card shows (UI renders it; headless tests read it)
  Hut.info = function (sim, h) {
    const t = Hut.tier(h), D = DC(), inside = sim.agents.filter(a => a.den === h.id && !a.dead).map(a => a.name);
    const P = G.Powers, rs = P && P.rainStrAt ? P.rainStrAt(sim, h.tiles[0][0], h.tiles[0][1]) : null;
    return { label: t.label, tier: t.k, mats: Hut.matsText(h.mats), dur: Math.round(h.dur != null ? h.dur : 100), worn: Hut.worn(h),
      wornBelow: D.wornBelow != null ? D.wornBelow : 50, warmX: h.warmX, rainPct: Math.round((h.rain != null ? h.rain : 0) * 100),
      cap: h.cap, inside, raining: rs, wearPerDay: Math.round(Hut.decayRate(sim, h) / TM() * 1440 * 10) / 10, art: Hut.artCol(h) };
  };
  // fixture (test / Tester): one sturdy-but-worn hut beside the first person, selected. Used by ?fixture=hut and GS.debug.hutFixture()
  Hut.fixture = function (sim, opts) {
    const o = opts || {}, a = sim.agents[0]; if (!a) return null;
    const t = G.Agent.tilePos(a); let x = t.x, y = t.y;
    for (let r = 1; r < 6 && (x === t.x && y === t.y); r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const xx = t.x + dx, yy = t.y + dy; if (x !== t.x || y !== t.y) break;
      if (G.World.walkable(sim.world, xx, yy) && !G.World.isWater(sim.world, xx, yy) && !G.Shelter.at(sim, xx, yy)) { x = xx; y = yy; } }
    const h = Hut.create(sim, x, y, a, o.mats || { stick: 3, reed: 2, hide: 1 });
    h.dur = o.dur != null ? o.dur : 42; Hut.refresh(h);
    for (const b of sim.agents) if (b.shelters && b.shelters.indexOf(h.id) < 0) b.shelters.push(h.id);
    return h;
  };
  // fixture (test / Tester): ?fixture=hut&kind=tiers, GS.debug.hutTiersFixture(): one fresh hut per tier (crude, reed, sturdy) in a row near
  // person 1 on walkable dry ground no one stands on, so every tier sprite is on screen side by side. Returns the huts, crude first.
  Hut.tiersFixture = function (sim) {
    const a = sim.agents[0]; if (!a) return null; const F = HC().fixture || {}, mats = F.tiers || [], gap = F.gap || 2, C = F.clear == null ? 2 : F.clear, R = F.tiles || 10;
    const t = G.Agent.tilePos(a), W = sim.world, n = mats.length, span = (n - 1) * gap;
    const ok = (x, y) => G.World.inb(W, x, y) && G.World.walkable(W, x, y) && !G.World.isWater(W, x, y) && !G.Shelter.at(sim, x, y) &&
      sim.agents.every(b => b.dead || Math.max(Math.abs(Math.round(b.pos.x) - x), Math.abs(Math.round(b.pos.y) - y)) >= C);
    let row = null;
    for (let r = 0; r <= R && !row; r++) for (let dy = -r; dy <= r && !row; dy++) for (let dx = -r; dx <= r && !row; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const x0 = t.x + dx, y = t.y + dy;
      let good = true; for (let i = 0; i < n && good; i++) good = ok(x0 + i * gap, y); if (good) row = { x0, y }; }
    if (!row) return null;
    const out = mats.map((m, i) => { const h = Hut.create(sim, row.x0 + i * gap, row.y, a, Object.assign({}, m)); Hut.refresh(h); return h; });
    for (const b of sim.agents) for (const h of out) if (b.shelters && b.shelters.indexOf(h.id) < 0) b.shelters.push(h.id);
    return out;
  };
  // 37 -> 38: every existing hut gets mats (old huts were sticks/reeds: needPile sticks) and durability
  Hut.migrate = function (s) {
    for (const h of s.shelters || []) if (h.type === "hut") {
      if (!h.mats) h.mats = { stick: HC().needPile != null ? HC().needPile : 3 };
      if (h.dur == null) h.dur = DC().migrate != null ? DC().migrate : 100;
      Hut.refresh(h); }
    return s;
  };

  G.Hut = Hut;
})(this.GS = this.GS || {});
