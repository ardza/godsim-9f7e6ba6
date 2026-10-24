// Step 21b: natural shelters. Each seed's terrain gives 3-8 caves / overhangs / thickets (hill clusters and the densest woods; never built,
// never a hollow), drawn from their own hash-seeded stream so the map and every other random sequence stay as they were.
// A cave / overhang / thicket adds warmX x one fire's heat to a person resting or asleep inside (capped with fire + huddle + sleeping
// together at capX x a fire). Nobody is told about them: a cold person close by may step in, a warming inside raises her "den" score (the
// step-14 learning), others who see it may copy the score and learn where it is, and known shelters pull her back when cold or at night.
(function (G) {
  "use strict";
  const Shelter = {}, SC = () => G.data.config.shelter, CF = () => G.data.config;
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const r2 = v => Math.round(v * 100) / 100;

  // ---------- generation (from the tiles, hills and the 15b moisture field) ----------
  Shelter.generate = function (w, seed) {
    const C = SC(), W = w.w, H = w.h, N = W * H, T = G.data.T, rng = new G.RNG(((seed >>> 0) ^ C.salt) >>> 0);
    const walk = i => G.World.walkable(w, i % W, (i / W) | 0), hill = i => w.hills && w.hills[i] === "1";
    const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
    const nonHillNb = i => { const x = i % W, y = (i / W) | 0; let n = 0; for (const [a, b] of N4) { const j = (y + b) * W + x + a; if (inb(x + a, y + b) && walk(j) && !hill(j)) n++; } return n; };
    // hill clusters (4-connected walkable hill tiles)
    const cl = new Int32Array(N).fill(-1), clusters = [];
    for (let s = 0; s < N; s++) { if (cl[s] >= 0 || !hill(s) || !walk(s)) continue; const st = [s], tiles = []; cl[s] = clusters.length;
      while (st.length) { const i = st.pop(); tiles.push(i); const x = i % W, y = (i / W) | 0;
        for (const [a, b] of N4) { const nx = x + a, ny = y + b, j = ny * W + nx; if (inb(nx, ny) && cl[j] < 0 && hill(j) && walk(j)) { cl[j] = clusters.length; st.push(j); } } }
      clusters.push(tiles); }
    const cand = { cave: [], overhang: [], thicket: [] };
    for (const tiles of clusters) { if (tiles.length < C.overhang.minCluster) continue;
      for (const e of tiles) { const open = nonHillNb(e); if (!open) continue;   // an edge tile: the side of the hill
        cand.overhang.push({ type: "overhang", tiles: [e], sc: tiles.length + rng.float() * 4 });
        if (tiles.length < C.cave.minCluster || open > 2) continue;
        // a cave: the mouth on the edge, then up to 2 tiles further into the hill (each deeper = fewer open sides)
        const want = rng.int(C.cave.tiles[0], C.cave.tiles[1]), path = [e]; let cur = e;
        while (path.length < want) { const x = cur % W, y = (cur / W) | 0; let nx = -1, best = 9;
          for (const [a, b] of N4) { const j = (y + b) * W + x + a; if (!inb(x + a, y + b) || !hill(j) || !walk(j) || path.indexOf(j) >= 0) continue; const o = nonHillNb(j); if (o < best) { best = o; nx = j; } }
          if (nx < 0 || best > 0) break; path.push(nx); cur = nx; }
        cand.cave.push({ type: "cave", tiles: path, sc: tiles.length + 3 * path.length + rng.float() * 4 }); } }
    // thickets: woods whose 5x5 neighbourhood is (nearly) all woods, the wettest first; 2-4 tiles grown into the densest neighbours
    const dens = new Float32Array(N), M = w.moist;
    for (let i = 0; i < N; i++) { if (w.tiles[i] !== T.WOODS) continue; const x = i % W, y = (i / W) | 0; let n = 0;
      for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) if ((a || b) && inb(x + a, y + b) && w.tiles[(y + b) * W + x + a] === T.WOODS) n++;
      dens[i] = n + (M ? M[i] * C.thicket.moistW : 0); }
    for (let i = 0; i < N; i++) { if (w.tiles[i] !== T.WOODS || dens[i] < C.thicket.minDense) continue;
      const want = rng.int(C.thicket.tiles[0], C.thicket.tiles[1]), tiles = [i];
      while (tiles.length < want) { let nx = -1, bd = -1;
        for (const t of tiles) { const x = t % W, y = (t / W) | 0; for (const [a, b] of N4) { const j = (y + b) * W + x + a; if (!inb(x + a, y + b) || w.tiles[j] !== T.WOODS || tiles.indexOf(j) >= 0) continue; if (dens[j] > bd) { bd = dens[j]; nx = j; } } }
        if (nx < 0 || bd < C.thicket.minDense - C.thicket.growSlack) break; tiles.push(nx); }
      if (tiles.length >= C.thicket.tiles[0]) cand.thicket.push({ type: "thicket", tiles, sc: tiles.reduce((s, t) => s + dens[t], 0) / tiles.length + rng.float() }); }
    for (const k of Object.keys(cand)) cand[k].sort((p, q) => q.sc - p.sc || p.tiles[0] - q.tiles[0]);
    // how many: the terrain's room for them (hill edge + dense woods), 3-8, fewer (even none) on dry open ground
    const room = Math.min(1, (cand.cave.length * C.roomCave + cand.overhang.length * C.roomOverhang + cand.thicket.length * C.roomThicket));
    const n = Math.round(rng.int(C.count[0], C.count[1]) * room);
    const out = [], used = new Set(), far = c => out.every(s => s.tiles.every(([tx, ty]) => c.tiles.every(u => Math.hypot(tx - u % W, ty - ((u / W) | 0)) >= C.spacing)));
    const wt = { cave: cand.cave.length ? C.mix.cave * Math.sqrt(cand.cave.length) : 0, overhang: cand.overhang.length ? C.mix.overhang * Math.sqrt(cand.overhang.length) : 0, thicket: cand.thicket.length ? C.mix.thicket * Math.sqrt(cand.thicket.length) : 0 };
    for (let k = 0; k < n * 4 && out.length < n; k++) {
      const tot = wt.cave + wt.overhang + wt.thicket; if (tot <= 0) break; let r = rng.float() * tot, ty = "cave";
      for (const t of ["cave", "overhang", "thicket"]) { if (r < wt[t]) { ty = t; break; } r -= wt[t]; }
      const c = cand[ty].find(q => !q.tiles.some(t => used.has(t)) && far(q)); if (!c) { wt[ty] = 0; continue; }
      c.tiles.forEach(t => used.add(t)); const D = C[ty];
      out.push({ id: out.length + 1, type: ty, tiles: c.tiles.map(t => [t % W, (t / W) | 0]), cap: D.cap * (D.perTile ? c.tiles.length : 1), warmX: D.warmX, rain: D.rain, walkX: D.walkX || 1 }); }
    return out;
  };
  Shelter.init = function (sim) { sim.shelters = Shelter.generate(sim.world, sim.seed); sim.shelterStats = Shelter.newStats(); };
  Shelter.newStats = () => ({ entered: 0, full: 0, warmed: 0, learned: 0, shared: 0, trips: 0, stepIns: 0 });

  // ---------- lookups ----------
  function index(sim) { if (sim._shAt && sim._shAt.n === sim.shelters) return sim._shAt.m; const m = new Map();
    for (const s of sim.shelters || []) for (const [x, y] of s.tiles) m.set(y * sim.world.w + x, s);
    Object.defineProperty(sim, "_shAt", { value: { n: sim.shelters, m }, enumerable: false, configurable: true, writable: true }); return m; }
  Shelter.at = (sim, x, y) => (sim.shelters && sim.shelters.length ? index(sim).get(Math.round(y) * sim.world.w + Math.round(x)) : null) || null;
  Shelter.byId = (sim, id) => (sim.shelters || []).find(s => s.id === id) || null;
  Shelter.walkX = (sim, x, y) => { const s = Shelter.at(sim, x, y); return s ? s.walkX || 1 : 1; };
  Shelter.inside = (sim, a) => a.den != null ? Shelter.byId(sim, a.den) : null;
  Shelter.occupants = (sim, s) => sim.agents.filter(b => b.den === s.id);
  Shelter.known = a => a.shelters || [];
  Shelter.word = s => ({ cave: "cave", overhang: "overhang", thicket: "thicket" })[s.type];
  function know(sim, a, s) { const K = a.shelters || (a.shelters = []); if (K.indexOf(s.id) >= 0) return false; K.push(s.id); if (G.Social && G.Social.refreshNames) G.Social.refreshNames(sim); return true; }
  Shelter.know = know;

  // the shelter's share of what she feels (C), for Climate.felt: resting / asleep inside the one she got into; fire + huddle + sleeping
  // together + shelter together stay at or under capX x one fire (only the shelter part is trimmed)
  Shelter.warmC = function (sim, a, others) {
    const s = Shelter.inside(sim, a); if (!s || (a.act.type !== "sleep" && a.act.type !== "idle")) return 0;
    const at = Shelter.at(sim, a.pos.x, a.pos.y); if (at !== s) return 0;
    const F = CF().fire.heatC, cap = SC().capX * F; return r2(Math.max(0, Math.min(s.warmX * F, cap - Math.max(0, others))));
  };

  // ---------- every minute, after people move ----------
  Shelter.step = function (sim) {
    if (!sim.shelters || !sim.shelters.length) return;
    const C = SC(), St = sim.shelterStats || (sim.shelterStats = Shelter.newStats());
    if (sim.tick % 60 === 0) St.learned = Shelter.learnedCount(sim);   // v17: people who know a shelter and have learned den use (refreshed hourly; read-only, no rng)
    for (const a of sim.agents) {
      const s = Shelter.at(sim, a.pos.x, a.pos.y), rest = a.act.type === "sleep" || a.act.type === "idle";
      if (a.den != null && (!s || s.id !== a.den)) { a.den = null; a.denW0 = null; a.denSlept = false; }   // she left it
      if (a.denFull != null && (!s || s.id !== a.denFull)) a.denFull = null;
      if (s && a.den == null && rest && a.denFull !== s.id) {
        const occ = Shelter.occupants(sim, s);
        if (occ.length >= s.cap) {   // full: she doesn't fit; she likes the one nearest her a little less (no fight)
          a.denFull = s.id; St.full++; let o = null, od = 1e9; for (const b of occ) { const d = Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y); if (d < od) { od = d; o = b; } }
          if (o && G.Social) G.Social.addLike(a, o, C.crowdLike);
          G.Sim.log(sim, a.name + " finds the " + Shelter.word(s) + " full and lies down outside", [a, o]);
        } else {
          a.den = s.id; a.denW0 = a.needs.warmth; a.denSlept = a.act.type === "sleep"; St.entered++; know(sim, a, s);
          G.Sim.log(sim, a.name + " " + C.enterLines[s.type] + (a.act.type === "sleep" ? " and curls up" : ""), a);
        }
      }
      if (a.den != null) {
        if (a.act.type === "sleep") a.denSlept = true;
        else if (a.denSlept) {   // woke inside: warm now? (the first one per seed goes into Discoveries)
          a.denSlept = false;
          if (a.needs.warmth >= C.wokeWarm) { St.warmed++; const sh = Shelter.byId(sim, a.den);
            if (!sim.shelterFirst && sh) { sim.shelterFirst = { who: a.name, id: a.id, type: sh.type, tick: sim.tick };
              const d = G.Discoveries.note(sim, a, "slept in", [C.articles[sh.type]], "woke warm"); if (d) d.title = "First shelter use"; } }
        }
      }
      // a cold person near a shelter she has never been in may step in (curiosity raises the odds, fear lowers them)
      if (!s && a.act.type === "idle" && a.needs.warmth < C.stepIn.below && (a.denTry == null || sim.tick - a.denTry >= C.stepIn.everyMinutes / CF().time.tickGameMinutes)) {
        a.denTry = sim.tick; const t = nearest(sim, a, C.stepIn.tiles, q => true);
        if (t) { const f = a.traits[C.fearTrait] == null ? 50 : a.traits[C.fearTrait], p = Math.max(0, Math.min(1, C.stepIn.chance * a.traits.curiosity / 50 * (1.5 - f / 100)));
          if (srng(sim).chance(p) && go(sim, a, t)) { St.stepIns++; G.Sim.log(sim, a.name + " " + C.peerLines[t.s.type], a); } }
      }
    }
  };
  function srng(sim) { return sim.srng || (sim.srng = new G.RNG(((sim.seed >>> 0) ^ SC().salt ^ 0x77) >>> 0)); }
  Shelter.rng = srng;
  // the nearest free tile of a shelter (filter on shelters) within R tiles: { s, x, y, d }
  function nearest(sim, a, R, ok) {
    let best = null; for (const s of sim.shelters || []) { if (!ok(s)) continue;
      for (const [x, y] of s.tiles) { const d = Math.hypot(x - a.pos.x, y - a.pos.y); if (d > R || (best && d >= best.d)) continue;
        if (!G.World.walkable(sim.world, x, y) || G.Agent.claimed(sim, a, x, y)) continue; best = { s, x, y, d }; } }
    return best;
  }
  function go(sim, a, t) { if (t.d < 0.5) return false; if (!G.Agent.walkTo(sim, a, t.x, t.y, "den")) return false; a.act.den = t.s.id; return true; }
  // cold or bedtime: head for the nearest shelter she knows, odds from her "den" score (50 = none yet -> goChance x 0.5)
  Shelter.seek = function (sim, a) {
    const C = SC(); if (!a.shelters || !a.shelters.length || a.den != null) return false;
    const t = nearest(sim, a, C.seekTiles, s => a.shelters.indexOf(s.id) >= 0); if (!t) return false;
    const p = Math.max(0, Math.min(1, C.goChance * (G.Learn.score(a, "den") - C.scoreFloor) / (100 - C.scoreFloor)));
    if (!srng(sim).chance(p) || !go(sim, a, t)) return false;
    const St = sim.shelterStats; if (St) St.trips++;
    G.Sim.log(sim, a.name + " " + C.tripLines[t.s.type], a); return true;
  };
  // copying (Learn.watch): a person who copied someone's warming in a shelter learns where that shelter is
  Shelter.copied = function (sim, b, a, key) { if (key !== "den" || a.den == null) return; const s = Shelter.byId(sim, a.den); if (s && know(sim, b, s)) { const St = sim.shelterStats; if (St) St.shared++; } };
  Shelter.learnedCount = sim => sim.agents.filter(a => (a.shelters || []).length && G.Learn.score(a, "den") > G.data.config.learn.start).length;

  G.Shelter = Shelter;
})(this.GS = this.GS || {});
