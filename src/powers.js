// Step 22 / 24 god powers: Rain (Light/Medium/Heavy), Warm, Cool, Lightning (Single/Barrage), Spawn.
// State (saved): sim.powers = { effects: [...], cd: {} (unused since v19), rs: stream state, stats, next }.
// Own seeded stream (rs), drawn only while an effect is active, so a run where no power is used matches one without this module.
// Nothing here is scripted: rain changes the ground, the bushes, warmth loss and water; people react through their own rules and traits.
// v19: no cooldowns; Rain and Lightning pick a strength / mode first (opt); each rain effect stores its own scales.
(function (G) {
  const Powers = {};
  const PC = () => G.data.config.powers, TM = () => G.data.config.time.tickGameMinutes, mins = m => Math.max(1, Math.round(m / TM()));
  const fToC = f => f * 5 / 9;
  Powers.KINDS = ["rain", "warm", "cool", "lightning", "spawn"];
  // step 23 stats: strikes (fires lit, killed, scared), spawned animals by species, prayers answered by a strike / spawn
  Powers.newStats = () => ({ casts: { rain: 0, warm: 0, cool: 0, lightning: 0, spawn: 0 }, putOut: 0, sticksOut: 0, covers: 0, faces: 0, puddleDrinks: 0,
    strikes: { fires: 0, scorched: 0, killed: 0, scared: 0, babies: 0 }, spawns: { grazer: 0, scavenger: 0, watched: 0, backedAway: 0 }, answered: 0 });
  Powers.newState = () => ({ effects: [], cd: {}, rs: 0, next: 1, stats: Powers.newStats() });
  Powers.init = function (sim) { sim.powers = Powers.newState(); sim.powers.rs = (sim.seed ^ 0x5A1D0F22) >>> 0; };
  const st = sim => sim.powers || (sim.powers = Object.assign(Powers.newState(), { rs: (sim.seed ^ 0x5A1D0F22) >>> 0 }));
  // one draw from the power stream (state kept as a number in the save)
  Powers.roll = function (sim) { const S = st(sim), r = new G.RNG(S.rs), v = r.float(); S.rs = r.s; return v; };
  const inC = (e, x, y) => (x - e.x) * (x - e.x) + (y - e.y) * (y - e.y) <= e.r * e.r + 1e-9;
  Powers.any = sim => !!(sim.powers && sim.powers.effects.length);
  // v19: no cooldowns; kept returning 0 so old UI / saves that still look at cd stay quiet
  Powers.cooldownLeft = (sim, k) => 0;
  Powers.cdTicks = k => 0;

  // a short place word for the log: near the lake / river / hills / woods / meadow (from the tiles in the circle)
  Powers.place = function (sim, x, y, r) {
    const w = sim.world, T = G.data.T, n = { lake: 0, river: 0, hill: 0, woods: 0, all: 0 };
    for (let yy = Math.ceil(y - r); yy <= y + r; yy++) for (let xx = Math.ceil(x - r); xx <= x + r; xx++) { if (!G.World.inb(w, xx, yy) || (xx - x) * (xx - x) + (yy - y) * (yy - y) > r * r) continue;
      const t = G.World.tile(w, xx, yy); n.all++; if (t === T.LAKE) n.lake++; else if (t === T.RIVER) n.river++; else if (t === T.WOODS) n.woods++;
      if (w.hills && w.hills[yy * w.w + xx] === "1") n.hill++; }
    return n.lake ? "the lake" : n.river ? "the river" : n.hill >= n.all * 0.3 ? "the hills" : n.woods >= n.all * 0.4 ? "the woods" : "the meadow";
  };

  // Cast a power at tile (x, y). Returns { ok, reason?, effect? }. opt: rain strength / lightning mode / spawn kind.
  Powers.cast = function (sim, k, x, y, opt) {
    const C = PC(), S = st(sim); if (Powers.KINDS.indexOf(k) < 0) return { ok: false, reason: "unknown" };
    x = Math.round(x); y = Math.round(y); if (!G.World.inb(sim.world, x, y)) return { ok: false, reason: "off the map" };
    if (k === "lightning") return Powers.strike(sim, x, y, opt || "single");
    if (k === "spawn") return Powers.spawn(sim, x, y, opt || "grazer");
    const r = C.radiusTiles, place = Powers.place(sim, x, y, r), e = { id: S.next++, k, x, y, r, t: sim.tick, place };
    S.stats.casts[k] = (S.stats.casts[k] || 0) + 1;
    if (k === "rain") { const str = (opt && C.rain.strengths[opt]) ? opt : "medium", R = C.rain.strengths[str];
      e.str = str; e.end = sim.tick + mins(R.minutes); e.wetEnd = sim.tick + mins(R.wetMinutes); e.bushEnd = sim.tick + mins(R.bushMinutes);
      e.bushX = R.bushX; e.lossX = R.lossX; e.chillC = R.chillC; e.douse = R.douse; e.holdOutMinutes = R.holdOutMinutes;
      e.pudEnd = sim.tick + mins(R.puddles.minutes); e.puddles = puddleTiles(sim, e, R.puddles.count); e.on = true;
      G.Sim.log(sim, "Rain falls near " + place); douse(sim, e); }
    else { const W = C[k]; e.end = sim.tick + mins(W.minutes); e.fade = mins(W.fadeMinutes); e.dC = fToC(W.deltaF);
      G.Sim.log(sim, "The air grows " + (k === "warm" ? "warm" : "cool") + " near " + place); }
    S.effects.push(e); return { ok: true, effect: e };
  };

  // the lowest dry walkable tiles in the circle hold puddles (data only; no tile art)
  let hCache = null;
  function heightOf(sim) { const w = sim.world; if (w.height) return w.height;
    if (hCache && hCache.seed === sim.seed) return hCache.h; const g = G.World.generate(sim.seed); hCache = { seed: sim.seed, h: g && g.height }; return hCache.h; }
  function puddleTiles(sim, e, n) {
    const h = heightOf(sim), w = sim.world, c = [];
    for (let y = e.y - e.r; y <= e.y + e.r; y++) for (let x = e.x - e.r; x <= e.x + e.r; x++) if (G.World.inb(w, x, y) && inC(e, x, y) && G.World.walkable(w, x, y) && !(sim.fire[x + "," + y]))
      c.push({ x, y, h: h ? h[y * w.w + x] : 0 });
    // a hollow beside a lake or river adds nothing, so tiles within 2 of open water are skipped (kept only if nothing else is in the circle)
    const nearW = q => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = q.x + dx, y = q.y + dy; if (G.World.inb(w, x, y) && G.data.tiles[G.World.tile(w, x, y)].water) return true; } return false; };
    const away = c.filter(q => !nearW(q)), use = away.length >= n ? away : c;
    use.sort((p, q) => p.h - q.h || p.y - q.y || p.x - q.x); return use.slice(0, n).map(q => [q.x, q.y]);
  }

  // rain arriving: douse mode from the strength (small / fires / all). Lit sticks always go out in the rain.
  function douse(sim, e) {
    const S = st(sim), F = sim.fireStats, mode = e.douse || "fires", holdM = e.holdOutMinutes;
    let fires = 0;
    for (const key in sim.fire) { const f = sim.fire[key], i = key.indexOf(","), x = +key.slice(0, i), y = +key.slice(i + 1); if (!inC(e, x, y)) continue;
      if (f.s === "fire") { if (mode === "small") continue;   // Light: leave burning tiles
        f.s = "ash"; f.t = sim.tick; f.end = sim.tick + mins(G.data.config.fire.ashMinutes); fires++; S.stats.putOut++; }
      else if (f.s === "ember") {
        if (mode === "small") { if (f.hold) continue; delete sim.fire[key]; S.stats.putOut++; const ev = F && F.events.find(v => v.id === f.ev); if (ev && !ev.fired) { ev.end = sim.tick; ev.regrown = sim.tick; } }
        else if (mode === "all" || holdM === 0) { delete sim.fire[key]; S.stats.putOut++; if (f.hold) fires++; const ev = F && F.events.find(v => v.id === f.ev); if (ev && !ev.fired) { ev.end = sim.tick; ev.regrown = sim.tick; } }
        else if (f.hold) f.end = Math.min(f.end, sim.tick + mins(holdM == null ? 60 : holdM));
        else { delete sim.fire[key]; S.stats.putOut++; const ev = F && F.events.find(v => v.id === f.ev); if (ev && !ev.fired) { ev.end = sim.tick; ev.regrown = sim.tick; } } } }
    if (fires) G.Sim.log(sim, "The rain puts out the fire near " + e.place);
    sticksOut(sim);
  }
  function sticksOut(sim) {
    for (const it of sim.items) { if (!it.lit || it.lit <= sim.tick) continue;
      const h = it.heldBy != null ? sim.agents.find(a => a.id === it.heldBy) : null, x = h ? Math.round(h.pos.x) : it.x, y = h ? Math.round(h.pos.y) : it.y;
      if (!Powers.raining(sim, x, y)) continue;
      it.lit = sim.tick; st(sim).stats.sticksOut++;   // Fire.brands removes it this tick ("...'s burning stick burns out")
    }
  }

  // queries used by the other systems (all cheap when nothing is active)
  Powers.raining = function (sim, x, y) { if (!Powers.any(sim)) return false; for (const e of sim.powers.effects) if (e.k === "rain" && e.on && sim.tick < e.end && inC(e, x, y)) return true; return false; };
  Powers.rainAt = function (sim, x, y) { if (!Powers.any(sim)) return null; for (const e of sim.powers.effects) if (e.k === "rain" && e.on && sim.tick < e.end && inC(e, x, y)) return e; return null; };
  Powers.wetAt = function (sim, x, y) { if (!Powers.any(sim)) return false; for (const e of sim.powers.effects) if (e.k === "rain" && sim.tick < e.wetEnd && inC(e, x, y)) return true; return false; };
  Powers.bushX = function (sim, b) { if (!Powers.any(sim)) return 1; let x = 1; for (const e of sim.powers.effects) if (e.k === "rain" && sim.tick < e.bushEnd && inC(e, b.x, b.y)) x = Math.max(x, e.bushX != null ? e.bushX : 1); return x; };
  // warmth loss multiplier under rain at a tile (max of active rains there)
  Powers.lossXAt = function (sim, x, y) { if (!Powers.any(sim)) return 1; let v = 1; for (const e of sim.powers.effects) if (e.k === "rain" && e.on && sim.tick < e.end && inC(e, x, y)) v = Math.max(v, e.lossX != null ? e.lossX : 1); return v; };
  // v22: open-air chill °C from active rain (max of overlapping strengths); Climate.felt multiplies by exposure
  Powers.chillCAt = function (sim, x, y) { if (!Powers.any(sim)) return 0; let v = 0; for (const e of sim.powers.effects) if (e.k === "rain" && e.on && sim.tick < e.end && inC(e, x, y)) v = Math.max(v, e.chillC != null ? e.chillC : 0); return v; };
  // air temperature shift (°C) at a tile: sum of active Warm / Cool effects there, each fading out over its last fade minutes, capped
  Powers.shiftC = function (sim, x, y) { if (!Powers.any(sim)) return 0; let s = 0;
    for (const e of sim.powers.effects) if (e.dC && sim.tick < e.end && inC(e, x, y)) { const left = e.end - sim.tick; s += e.dC * Math.min(1, left / e.fade); }
    const m = fToC(PC().maxShiftF); return Math.max(-m, Math.min(m, s)); };
  // how much rain reaches her: 0 dry / not raining, 1 in the open; woods block it, a shelter tile blocks by its type's rain value
  Powers.exposure = function (sim, a) { if (!Powers.any(sim)) return 0;
    const x = Math.round(a.pos.x), y = Math.round(a.pos.y); if (!Powers.raining(sim, x, y)) return 0;
    const sh = (G.Shelter && G.Shelter.inside(sim, a)) || (G.Shelter && G.Shelter.at(sim, x, y)), SC = G.data.config.shelter;
    if (sh) { const b = SC && SC[sh.type] && SC[sh.type].rain; if (b != null) return Math.max(0, 1 - b); }   // a thicket keeps half off, even in the woods
    return G.World.tile(sim.world, x, y) === G.data.T.WOODS ? 0 : 1; };
  // active puddles within d tiles of (x, y): [{k, x, y, d, kind: "puddle"}]
  Powers.puddlesNear = function (sim, x, y, d) { const out = []; if (!Powers.any(sim)) return out;
    for (const e of sim.powers.effects) if (e.puddles && sim.tick < e.pudEnd) for (const [px, py] of e.puddles) { const dd = Math.hypot(px - x, py - y); if (dd <= d) out.push({ k: px + "," + py, x: px, y: py, d: dd, kind: "puddle" }); }
    return out; };
  Powers.puddleAt = (sim, x, y) => Powers.puddlesNear(sim, x, y, 0).length > 0;

  // nearest rain cover (woods tile, or a cave / overhang tile) within coverTiles by path
  function coverFor(sim, a) {
    const R = PC().rain, w = sim.world, t = G.Agent.tilePos(a), SC = G.data.config.shelter, c = [];
    for (let y = t.y - R.coverTiles; y <= t.y + R.coverTiles; y++) for (let x = t.x - R.coverTiles; x <= t.x + R.coverTiles; x++) {
      if (!G.World.inb(w, x, y) || !G.World.walkable(w, x, y)) continue; const d = Math.hypot(x - t.x, y - t.y); if (d > R.coverTiles || d === 0) continue;
      const sh = G.Shelter && G.Shelter.at(sim, x, y), full = sh ? SC[sh.type] && SC[sh.type].rain >= 1 : G.World.tile(w, x, y) === G.data.T.WOODS;
      if (full && !G.Agent.claimed(sim, a, x, y)) c.push({ x, y, d, sh }); }
    c.sort((p, q) => p.d - q.d || p.y - q.y || p.x - q.x);
    for (const q of c.slice(0, 6)) { const p = G.World.findPath(w, t.x, t.y, q.x, q.y); if (p) return { p, sh: q.sh }; }
    return null;
  }
  // called from Agent.step (after needs): an awake person out in the rain, idle or wandering, may head for cover. True = she is on her way.
  Powers.seekCover = function (sim, a, act) {
    if (!Powers.any(sim) || (act.type !== "idle" && !(act.type === "walk" && act.goal === "wander"))) return false;
    const R = PC().rain; if ((sim.tick * TM()) % R.checkMinutes !== 0 || Powers.exposure(sim, a) <= 0) return false;
    if (Powers.roll(sim) >= R.coverChance * (0.5 + (a.traits.coldFear || 0) / 100)) return false;
    const c = coverFor(sim, a); if (!c) return false;
    a.act = { type: "walk", goal: "cover", path: c.p, i: 0 }; st(sim).stats.covers++;
    G.Sim.log(sim, a.name + " hurries out of the rain " + (c.sh ? "toward the " + G.Shelter.word(c.sh) : "toward the trees"), a);
    return true;
  };
  // arrived at cover: waits there while it still rains nearby (up to waitMinutes)
  Powers.arriveCover = function (sim, a) {
    const t = G.Agent.tilePos(a), R = PC().rain; let end = sim.tick + mins(20);
    for (const e of sim.powers.effects) if (e.k === "rain" && e.on && sim.tick < e.end && Math.hypot(e.x - t.x, e.y - t.y) <= e.r + R.coverTiles) end = Math.max(end, Math.min(e.end, sim.tick + mins(R.waitMinutes)));
    a.act = { type: "idle", until: end };
  };

  // each tick: rain ends, sticks carried into the rain go out, people react to the first drops, expired effects go
  Powers.step = function (sim) {
    for (const a of sim.agents) { if (a.fright && sim.tick >= a.fright.until) a.fright = null; if (a.runUntil && sim.tick >= a.runUntil) a.runUntil = null; }   // step 23
    Powers.curioStep(sim);   // step 24
    if (!Powers.any(sim)) return;
    const S = sim.powers, R = PC().rain;
    for (const e of S.effects) if (e.k === "rain" && e.on && sim.tick >= e.end) { e.on = false; G.Sim.log(sim, "The rain stops near " + e.place); }
    if (S.effects.some(e => e.k === "rain" && e.on)) {
      if (sim.items.some(it => it.lit)) sticksOut(sim);
      for (const a of sim.agents) { const e = Powers.rainAt(sim, a.pos.x, a.pos.y); if (!e || a.rainSeen === e.id) continue; a.rainSeen = e.id;
        if (a.act.type === "sleep" || Powers.exposure(sim, a) <= 0) continue;
        if (Powers.roll(sim) < R.faceChance * (a.traits.curiosity || 50) / 50) { S.stats.faces++; G.Sim.log(sim, a.name + " turns " + G.Family.poss(a) + " face up into the rain", a); } }
    }
    for (const e of S.effects) if (e.k !== "rain" && !e.done && sim.tick >= e.end) { e.done = true; G.Sim.log(sim, "The air near " + e.place + " settles"); }
    S.effects = S.effects.filter(e => e.k === "rain" ? (e.on || sim.tick < Math.max(e.wetEnd, e.bushEnd, e.pudEnd)) : sim.tick < e.end || !e.done);
  };
  // ---- step 23: Lightning ----
  const T = () => G.data.T, Wd = () => G.World;
  Powers.fright = (sim, a) => (a.fright && sim.tick < a.fright.until ? a.fright.v : 0);   // extra fear on top of fireFear, for a while after a strike
  function frighten(sim, a, v, m) { const f = a.fright && sim.tick < a.fright.until ? a.fright.v : 0; a.fright = { v: Math.max(f, v), until: Math.max(a.fright && sim.tick < a.fright.until ? a.fright.until : 0, sim.tick + mins(m)) }; }
  // the ground a strike lands on: "grass" (meadow), "forest" (woods), "bare" (sand), "rock" (hills), "water"
  Powers.ground = function (sim, x, y) { const w = sim.world, t = Wd().tile(w, x, y), Tt = T();
    if (G.data.tiles[t].water) return "water"; if (w.hills && w.hills[y * w.w + x] === "1") return "rock"; return t === Tt.WOODS ? "forest" : t === Tt.MEADOW ? "grass" : "bare"; };
  // fire chance for a strike at (x, y): dry grass / forest only; the lowest of rain (raining or wet from Rain) and Deep Cold
  Powers.strikeChance = function (sim, x, y) { const L = PC().lightning.fire, g = Powers.ground(sim, x, y); if (g !== "grass" && g !== "forest") return 0;
    let p = L.dry; if (Powers.raining(sim, x, y) || Powers.wetAt(sim, x, y)) p = Math.min(p, L.rain); if (G.Climate.seasonIndex(sim.tick) === L.deepColdSeason) p = Math.min(p, L.deepCold); return p; };
  // one bolt at (x, y); used by Single and by each Barrage hit. Does not bump casts (the parent cast does).
  Powers.strikeOne = function (sim, x, y, parent) {
    const L = PC().lightning, S = st(sim), key = x + "," + y, g = Powers.ground(sim, x, y), place = Powers.place(sim, x, y, 2), F = sim.fireStats;
    const e = { id: S.next++, k: "lightning", x, y, r: 0, t: sim.tick, place, ground: g, mode: parent && parent.mode }; sim.fx.push({ k: "bolt", x, y, t: sim.tick, id: e.id });
    const p = Powers.strikeChance(sim, x, y), cur = sim.fire[key], fire = !(cur && (cur.s === "fire" || cur.s === "ember")) && p > 0 && Powers.roll(sim) < p;
    const what = g === "water" ? "the water near " + place : g === "forest" ? "a tree near " + place : g === "grass" ? "the grass near " + place : g === "rock" ? "the rocks near " + place : "the bare ground near " + place;
    if (fire) {
      const ev = { id: F.events.length + 1, start: sim.tick, x, y, by: null, byName: null, combo: null, fuel: g === "forest" ? "struck tree" : Fire().fuelName(sim, x, y), tiles: 0, fired: true, end: null, regrown: null, lightning: true, god: true };
      F.events.push(ev); F.fires++; F.lightning = (F.lightning || 0) + 1; delete sim.fire[key]; Fire().ignite(sim, x, y, ev.id); Fire().catchNear(sim, x, y, sim.fire[key]);
      S.stats.strikes.fires++; e.fire = ev.id; G.Sim.log(sim, "Lightning strikes " + what + " and it bursts into flame");
    } else {
      if (g !== "water" && !cur) { const ev = { id: F.events.length + 1, start: sim.tick, x, y, by: null, byName: null, combo: null, fuel: "scorch", tiles: 0, fired: false, end: sim.tick, regrown: null, lightning: true, god: true, scorch: true };
        F.events.push(ev); sim.fire[key] = { s: "scorched", t: sim.tick, end: sim.tick + mins(G.data.config.fire.regrowMinutes), ev: ev.id }; S.stats.strikes.scorched++; }
      G.Sim.log(sim, "Lightning strikes " + what);
    }
    const babyHere = b => b.orphanAt == null ? sim.agents.some(a => a.id === b.carrier && Math.round(a.pos.x) === x && Math.round(a.pos.y) === y) : Math.round(b.pos.x) === x && Math.round(b.pos.y) === y;
    const doomed = (sim.babies || []).filter(babyHere);
    for (const a of sim.agents.slice()) if (Math.round(a.pos.x) === x && Math.round(a.pos.y) === y) { G.Sim.die(sim, a, L.cause); S.stats.strikes.killed++; }
    for (const b of doomed) if (G.Family.babyDie(sim, b, L.cause)) { S.stats.strikes.killed++; S.stats.strikes.babies = (S.stats.strikes.babies || 0) + 1; }
    for (const a of sim.agents) { const d = Math.hypot(a.pos.x - x, a.pos.y - y); if (d > L.scareTiles) continue;
      const slept = a.act.type === "sleep"; frighten(sim, a, L.fearAdd, L.fearMinutes); S.stats.strikes.scared++;
      if (slept) a.wokeEarly = true;
      const ran = Powers.run(sim, a, x, y, L.runTiles, L.runMinutes);
      G.Sim.log(sim, a.name + (slept ? " wakes with a start" + (ran ? " and runs from the flash" : "") : d <= 3 ? " drops flat as the sky cracks" : ran ? " runs from the flash" : " flinches at the crack"), a); }
    Powers.answer(sim, x, y);
    return { ok: true, effect: e, fire };
  };
  // mode: "single" (default) or "barrage" — Barrage: one bolt on the tap + (count-1) on random land within scatterTiles (v22: primary always on tap)
  Powers.strike = function (sim, x, y, mode) {
    const C = PC(), L = C.lightning, S = st(sim), M = (L.modes && L.modes[mode]) || (L.modes && L.modes.single) || { count: [1, 1], scatterTiles: 0 };
    S.stats.casts.lightning = (S.stats.casts.lightning || 0) + 1;
    const lo = M.count[0], hi = M.count[1], nWant = lo === hi ? lo : lo + Math.floor(Powers.roll(sim) * (hi - lo + 1));
    if (!M.scatterTiles || nWant <= 1) return Powers.strikeOne(sim, x, y, { mode: mode || "single" });
    // v22: Barrage always lands one bolt on the tapped tile; the other bolts scatter on land within scatterTiles (not the tap, not water)
    const tiles = [], R = M.scatterTiles;
    for (let yy = y - R; yy <= y + R; yy++) for (let xx = x - R; xx <= x + R; xx++) {
      if (xx === x && yy === y) continue;
      if (!G.World.inb(sim.world, xx, yy) || (xx - x) * (xx - x) + (yy - y) * (yy - y) > R * R + 1e-9) continue;
      if (Powers.ground(sim, xx, yy) === "water") continue; tiles.push([xx, yy]); }
    // Fisher–Yates with the power stream so the barrage is seeded and unique tiles
    for (let i = tiles.length - 1; i > 0; i--) { const j = Math.floor(Powers.roll(sim) * (i + 1)), tmp = tiles[i]; tiles[i] = tiles[j]; tiles[j] = tmp; }
    const pick = [[x, y]];
    for (const t of tiles) { if (pick.length >= nWant) break; pick.push(t); }
    const bolts = []; let anyFire = false;
    for (const [bx, by] of pick) { const r = Powers.strikeOne(sim, bx, by, { mode: "barrage" }); bolts.push(r.effect); if (r.fire) anyFire = true; }
    const place = Powers.place(sim, x, y, R), e = { id: S.next++, k: "lightning", x, y, r: R, t: sim.tick, place, mode: "barrage", bolts: bolts.map(b => [b.x, b.y]) };
    return { ok: true, effect: e, fire: anyFire, bolts };
  };
  const Fire = () => G.Fire;
  // run from (fx, fy) to a tile tiles[0..1] away from it, roughly straight away; she stays put (idle) there until minutes are up. True = on her way.
  Powers.run = function (sim, a, fx, fy, tiles, minutes) {
    const w = sim.world, t = G.Agent.tilePos(a), base = (a.pos.x === fx && a.pos.y === fy) ? (a.id % 8) * Math.PI / 4 : Math.atan2(a.pos.y - fy, a.pos.x - fx);
    a.runUntil = sim.tick + mins(minutes);
    for (const off of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.4, -2.4, Math.PI]) for (const d of [tiles[1], tiles[0]]) {
      const tx = Math.round(fx + Math.cos(base + off) * d), ty = Math.round(fy + Math.sin(base + off) * d);
      if (!Wd().inb(w, tx, ty) || !Wd().walkable(w, tx, ty) || G.Agent.claimed(sim, a, tx, ty) || sim.fire[tx + "," + ty] && sim.fire[tx + "," + ty].s === "fire" || (tx === t.x && ty === t.y)) continue;
      if (G.Agent.walkTo(sim, a, tx, ty, "scared")) return true; }
    return false;
  };
  // arrived after running: stays there until runUntil (needs still win: the agent rules wake her from idle as usual)
  Powers.arriveRun = function (sim, a) { if (a.runUntil && sim.tick < a.runUntil) { a.act = { type: "idle", until: a.runUntil }; return true; } return false; };

  // ---- step 23: Spawn ----
  Powers.spawnTile = function (sim, x, y) { const R = PC().spawn.freeTiles, w = sim.world; let best = null;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const tx = x + dx, ty = y + dy, d = Math.hypot(dx, dy);
      if (d > R + 1e-9 || !Wd().inb(w, tx, ty) || !Wd().walkable(w, tx, ty) || G.Animal.occupied(sim, null, tx, ty) || G.Agent.claimed(sim, null, tx, ty) || sim.fire[tx + "," + ty] && sim.fire[tx + "," + ty].s === "fire") continue;
      if (!best || d < best.d) best = { x: tx, y: ty, d }; }
    return best; };
  Powers.spawnRoom = function (sim, species) { const A = G.data.config.animals; if (sim.animals.length >= G.data.config.pop.maxAnimals) return false;
    if (species === "grazer" && A.grazer.births && sim.animals.filter(o => o.species === "grazer").length >= A.grazer.births.cap) return false; return true; };
  Powers.spawn = function (sim, x, y, kind) {
    const C = PC(), SP = C.spawn, S = st(sim), species = SP.kinds[kind]; if (!species) return { ok: false, reason: "unknown animal" };
    if (!G.World.walkable(sim.world, x, y)) return { ok: false, reason: "needs land" };
    if (!Powers.spawnRoom(sim, species)) return { ok: false, reason: "no room for more " + species + "s" };
    const q = Powers.spawnTile(sim, x, y); if (!q) return { ok: false, reason: "no free spot there" };
    S.stats.casts.spawn = (S.stats.casts.spawn || 0) + 1;
    let herd = null; if (species === "grazer") { let bd = Infinity; for (const h of sim.herds || []) { const d = Math.hypot(h.x - q.x, h.y - q.y); if (d < bd) { bd = d; herd = h.id; } }
      if (herd == null) { sim.herds = sim.herds || []; herd = sim.herds.length; sim.herds.push({ id: herd, x: q.x, y: q.y, next: sim.tick + mins(60) }); } }
    const r = new G.RNG(S.rs), c = G.Animal.create(sim, species, q.x, q.y, herd, r); S.rs = r.s; c.spawned = sim.tick;
    sim.animals.push(c); sim.prev[c.id] = { x: c.pos.x, y: c.pos.y }; S.stats.spawns[species] = (S.stats.spawns[species] || 0) + 1;
    const place = Powers.place(sim, q.x, q.y, 2), e = { id: S.next++, k: "spawn", x: q.x, y: q.y, r: 0, t: sim.tick, place, species, animal: c.id };
    sim.fx.push({ k: "shimmer", x: q.x, y: q.y, t: sim.tick, id: e.id });
    G.Sim.log(sim, "A " + species + " appears near " + place, c);
    for (const a of sim.agents) { if (a.act.type === "sleep" || Math.hypot(a.pos.x - q.x, a.pos.y - q.y) > SP.watchTiles) continue;
      const add = Math.max(0, Math.min(100, (a.traits.curiosity || 0) + SP.curiosityAdd) - (a.traits.curiosity || 0)); a.traits.curiosity += add; S.stats.spawns.watched++;
      Powers.curioBoost(sim, a, add);
      const P = SP.predator, scared = kind === "predator" && P && Powers.roll(sim) < Math.max(0, Math.min(1, P.fearChance * (1.5 - a.traits.curiosity / 100)));
      if (scared) { frighten(sim, a, P.fearAdd, P.fearMinutes); Powers.run(sim, a, q.x, q.y, P.runTiles, P.runMinutes); S.stats.spawns.backedAway++; G.Sim.log(sim, a.name + " stares at the new " + species + " and backs away", [a, c]); }
      else G.Sim.log(sim, a.name + " stares at the new " + species, [a, c]); }
    Powers.answer(sim, q.x, q.y);
    return { ok: true, effect: e, animal: c };
  };
  // ---- step 24 (v19, Director): the spawn watcher's curiosity bump fades back, 1 point at a time, evenly over fadeMinutes after the latest watch.
  // a.curioFade = { left: points still to take off, step: ticks between points, next: tick of the next one } (saved with the person; no random draws)
  Powers.curioBoost = function (sim, a, add) { if (!(add > 0)) return; const f = a.curioFade || { left: 0 }, left = f.left + add, T = mins(PC().spawn.curiosityFadeMinutes);
    const step = Math.max(1, Math.floor(T / left)); a.curioFade = { left, step, next: sim.tick + step }; };
  Powers.curioStep = function (sim) { for (const a of sim.agents) { const f = a.curioFade; if (!f || sim.tick < f.next) continue;
    a.traits.curiosity = Math.max(0, a.traits.curiosity - 1); f.left--; f.next = sim.tick + f.step; if (f.left <= 0) a.curioFade = null; } };
  // ---- step 23: a strike or a new animal soon after a prayer (within faithMinutes, by someone within faithTiles) reinforces that prayer
  Powers.answer = function (sim, x, y) { if (!G.Faith || !G.Faith.answer) return 0; const C = PC(); let n = 0;
    for (const a of sim.agents) if (Math.hypot(a.pos.x - x, a.pos.y - y) <= C.faithTiles && G.Faith.answer(sim, a, mins(C.faithMinutes))) n++;
    st(sim).stats.answered += n; return n; };
  Powers.active = sim => (sim.powers ? sim.powers.effects : []);
  G.Powers = Powers;
})(this.GS = this.GS || {});
