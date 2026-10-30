// v38 (b) Berry sprouting. Eaten berries sometimes leave a seed by the bush; on soft ground near water it can sprout -> sapling -> a new
// bush; most don't. The eater who later finds that bush gains a "plant" urge (Learn), others who saw the seed fall copy it when they see
// the bush. Past the start score the urge makes her press berries into soft ground on purpose (first one -> Discoveries). No farm UI.
// Plants live in sim.plants [{id, x, y, stage: seed|sprout|sapling, t (stage start), grow (stage progress, days), by, deliberate, seen[]}].
// Own rng stream (sim.plrng; frng = Family, prng = Faith) so other streams are unchanged.
(function (G) {
  "use strict";
  const CF = () => G.data.config, FC = () => CF().farm || {}, TM = () => CF().time.tickGameMinutes;
  const Farm = {};
  Farm.newStats = () => ({ seeds: 0, pressed: 0, sprouted: 0, failed: 0, saplings: 0, bushes: 0, killed: 0, finds: 0, copies: 0 });
  Farm.init = sim => { sim.plants = sim.plants || []; sim.farmStats = sim.farmStats || Farm.newStats(); };
  const st = sim => sim.farmStats || (sim.farmStats = Farm.newStats());
  const frng = sim => sim.plrng || (sim.plrng = new G.RNG(((sim.seed >>> 0) ^ (FC().salt || 0xBE5EED)) >>> 0));
  Farm.rng = frng;
  const T = () => G.data.T;

  // soil factor of a tile: 0 = never takes (sand, rock, water, not near water)
  Farm.soil = function (sim, x, y) {
    const w = sim.world; if (!G.World.inb(w, x, y) || !G.World.walkable(w, x, y) || G.World.isWater(w, x, y)) return 0;
    if (w.hills && w.hills[y * w.w + x] === "1") return 0;   // rock
    const t = G.World.tile(w, x, y), S = FC().soil || {}, f = t === T().MEADOW ? S.meadow || 0 : t === T().WOODS ? S.woods || 0 : 0; if (!f) return 0;
    const R = FC().nearWaterTiles != null ? FC().nearWaterTiles : 5;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= R * R && G.World.isWater(w, x + dx, y + dy)) return f;
    return 0;
  };
  // room for a plant: nothing growing on or next to it, not under a shelter
  Farm.free = function (sim, x, y) {
    const sp = FC().spacingTiles != null ? FC().spacingTiles : 1, near = o => Math.max(Math.abs(o.x - x), Math.abs(o.y - y)) <= sp;
    return !sim.bushes.some(near) && !(sim.plants || []).some(near) && !(G.Shelter && G.Shelter.at(sim, x, y));
  };
  const room = sim => (sim.plants || []).length < (FC().maxPlants != null ? FC().maxPlants : 40);
  function place(sim, a, x, y, deliberate) {
    Farm.init(sim);
    const ap = { id: (sim.plantNext = (sim.plantNext || 0) + 1), x, y, stage: "seed", t: sim.tick, grow: 0, by: a ? a.id : null, byName: a ? a.name : null, deliberate: !!deliberate, seen: [] };
    if (a) { const R = FC().copyTiles != null ? FC().copyTiles : 5;
      ap.seen = sim.agents.filter(b => b !== a && b.act && b.act.type !== "sleep" && Math.hypot(b.pos.x - x, b.pos.y - y) <= R + 1).map(b => b.id); }
    sim.plants.push(ap); st(sim)[deliberate ? "pressed" : "seeds"]++;
    return ap;
  }
  Farm.place = place;
  // called when she finishes a berry meal at bush b
  Farm.afterMeal = function (sim, a, b) {
    if (!b || !room(sim)) return null; const C = FC(), r = frng(sim), L = G.Learn, start = CF().learn.start;
    // deliberate: the learned urge
    const sc = L ? L.score(a, "plant") : start, urge = Math.max(0, sc - start) / 50 * (C.urgeChance != null ? C.urgeChance : 0.6);
    if (urge > 0 && r.chance(Math.min(1, urge))) {
      const R = C.plantTiles != null ? C.plantTiles : 3; let best = null;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const x = b.x + dx, y = b.y + dy, f = Farm.soil(sim, x, y);
        if (!f || !Farm.free(sim, x, y)) continue; const v = f * (G.Powers && G.Powers.wetAt(sim, x, y) ? C.wetX || 1 : 1) - Math.hypot(dx, dy) * 0.01;
        if (!best || v > best.v) best = { x, y, v }; }
      if (best) { const wet = G.Powers && G.Powers.wetAt(sim, best.x, best.y), p = place(sim, a, best.x, best.y, true);
        G.Sim.log(sim, a.name + " " + ((C.lines || {})[wet ? "press" : "pressDry"] || "presses berries into the ground"), a);
        const d = G.Discoveries.note(sim, a, "pressed", ["berries"], "into soft ground"); if (d) d.title = "First planting";
        return p; }
    }
    if (!r.chance(C.seedChance != null ? C.seedChance : 0.25)) return null;
    const D = C.dropTiles != null ? C.dropTiles : 2, x = b.x + r.int(-D, D), y = b.y + r.int(-D, D);
    if (!G.World.inb(sim.world, x, y) || !Farm.free(sim, x, y)) return null;
    return place(sim, a, x, y, false);   // an unnoticed seed; it may land on poor ground and come to nothing
  };
  function kill(sim, i, why) { sim.plants.splice(i, 1); st(sim)[why === "fire" ? "killed" : "failed"]++; }
  // a plant becomes a normal bush (bare; ripens on the usual bush clock)
  function toBush(sim, p) {
    const n = (sim.bushNext = (sim.bushNext || sim.bushes.length) + 1);
    const b = { id: "p" + n, x: p.x, y: p.y, ripe: false, regrow: 0, planted: { by: p.by, name: p.byName, deliberate: p.deliberate, seen: p.seen.slice(), t: sim.tick, credited: [] } };
    sim.bushes.push(b); st(sim).bushes++;
    G.Sim.log(sim, (FC().lines || {}).bush || "A new berry bush has grown from dropped berries");
    return b;
  }
  // every minute: grow at the season's pace, fire kills
  Farm.step = function (sim) {
    const P = sim.plants; if (!P || !P.length) return;
    const C = FC(), si = G.Climate.seasonIndex(sim.tick), gx = (C.seasonGrowX || [1, 1, 1, 1])[si], day = 1440 / TM(), r = frng(sim);
    const capB = Math.round(CF().bushes.count * (C.maxBushesX != null ? C.maxBushesX : 1.6));
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i];
      const f = sim.fire && sim.fire[p.x + "," + p.y]; if (f && (f.s === "fire" || f.s === "ember")) { kill(sim, i, "fire"); continue; }
      p.grow = Math.round((p.grow + gx / day) * 1e6) / 1e6;
      if (p.stage === "seed" && p.grow >= C.seedDays) {
        const wet = G.Powers && G.Powers.wetAt(sim, p.x, p.y), ch = (C.sproutChance || 0) * Farm.soil(sim, p.x, p.y) * (wet ? C.wetX || 1 : 1) * (p.deliberate ? C.pressX || 1 : 1);
        if (r.chance(Math.min(1, ch))) { p.stage = "sprout"; p.grow = 0; p.t = sim.tick; st(sim).sprouted++; } else kill(sim, i, "fail");
      } else if (p.stage === "sprout" && p.grow >= C.sproutDays) { p.stage = "sapling"; p.grow = 0; p.t = sim.tick; st(sim).saplings++; }
      else if (p.stage === "sapling" && p.grow >= C.saplingDays) { if (sim.bushes.length >= capB) continue; P.splice(i, 1); toBush(sim, p); }
    }
  };
  // she sees a bush for the first time (Agent sense): the planter gains the urge; someone who saw the seed fall may copy her
  Farm.onFind = function (sim, a, b) {
    const pl = b && b.planted; if (!pl || pl.credited.indexOf(a.id) >= 0) return 0; const L = G.Learn, C = FC();
    if (pl.by === a.id) { pl.credited.push(a.id); L.add(a, "plant", C.findGain != null ? C.findGain : 15); L.bump(sim, "successes", "plant"); st(sim).finds++; return 1; }
    if (pl.seen.indexOf(a.id) < 0) return 0;
    const pa = sim.agents.find(q => q.id === pl.by); if (!pa) return 0;
    const sa = L.score(pa, "plant"), own = L.score(a, "plant"); if (sa < own + CF().learn.copyMargin) return 0;   // nothing better to copy (yet): may retry later
    pl.credited.push(a.id);
    if (!frng(sim).chance(Math.min(1, L.copyChance(a, "plant")))) return 0;
    const e = L.rec(a, "plant"); e.score = Math.round((own + (sa - own) * CF().learn.copyShare) * 100) / 100; e.copied = { from: pa.id, name: pa.name, t: sim.tick };
    L.bump(sim, "copies", "plant"); st(sim).copies++;
    G.Sim.log(sim, a.name + " watched " + pa.name + " and copied: " + L.label("plant"), [a, pa]);
    return 2;
  };
  // v38 pre-freeze fixture (test / Tester; ?fixture=sprout, GS.debug.sproutFixture): person 1 presses berries into soft ground
  // near her, one plant per stage in farm.fixture.stages (seed, sprout, sapling), so every stage is on screen. Sand / rock / water never get one.
  Farm.fixture = function (sim) {
    Farm.init(sim); const a = sim.agents[0]; if (!a) return null; const F = FC().fixture || {}, R = F.tiles || 8, stages = F.stages || ["seed", "sprout", "sapling"];
    const ax = Math.round(a.pos.x), ay = Math.round(a.pos.y), out = [], C = F.clear == null ? 2 : F.clear;
    const clear = (x, y) => sim.agents.every(b => b.dead || Math.max(Math.abs(Math.round(b.pos.x) - x), Math.abs(Math.round(b.pos.y) - y)) >= C);   // no one standing on / next to it
    for (let r = 1; r <= R && out.length < stages.length; r++) for (let dy = -r; dy <= r && out.length < stages.length; dy++) for (let dx = -r; dx <= r && out.length < stages.length; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const x = ax + dx, y = ay + dy;
      if (Farm.soil(sim, x, y) > 0 && Farm.free(sim, x, y) && clear(x, y)) { const p = place(sim, a, x, y, true); p.stage = stages[out.length]; p.seen = []; out.push(p); } }
    if (out.length) G.Sim.log(sim, a.name + " " + ((FC().lines || {}).pressDry || "presses berries into the soft ground"), a);
    return { a, plants: out };
  };
  Farm.migrate = function (s) { s.plants = s.plants || []; s.farmStats = s.farmStats || Farm.newStats(); return s; };

  G.Farm = Farm;
})(this.GS = this.GS || {});
