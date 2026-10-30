// §40 / v37: one labelled check group per item (1-9). Run: node tests/headless_v37.js
const vm = require("vm"), fs = require("fs"), path = require("path"), root = path.join(__dirname, "..");
function load() {
  const ctx = { console, Math, JSON, performance: { now: () => 0 } };
  // minimal DOM stub so ui.js can load (init not called)
  const fakeEl = () => ({
    style: {}, classList: { toggle() {}, add() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, addEventListener() {},
    appendChild() {}, querySelectorAll() { return []; }, querySelector() { return null; },
    getBoundingClientRect() { return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }; },
    hidden: true, innerHTML: "", textContent: "", onclick: null
  });
  const els = {};
  ctx.document = {
    getElementById(id) { return els[id] || (els[id] = fakeEl()); },
    querySelectorAll() { return []; },
    createElement() { const e = fakeEl(); e.children = []; e.appendChild = c => { e.children.push(c); }; e.parentNode = { appendChild() {} }; return e; },
    body: { classList: { toggle() {}, contains() { return false; } } },
    addEventListener() {}
  };
  ctx.window = ctx;
  ctx.innerWidth = 1024; ctx.innerHeight = 768;
  ctx.localStorage = { getItem() { return null; }, setItem() {} };
  ctx.matchMedia = () => ({ matches: false });
  ctx.getComputedStyle = () => ({ position: "static" });
  vm.createContext(ctx);
  for (const f of ["data/config.js", "data/tiles.js", "data/names.js", "data/words.js", "data/group_names.js", "data/art.js", "data/materials.js",
    "src/rng.js", "src/world.js", "src/climate.js", "src/agent.js", "src/animal.js", "src/objects.js", "src/fire.js",
    "src/learn.js", "src/hunt.js", "src/cook.js", "src/social.js", "src/family.js", "src/faith.js", "src/shelter.js",
    "src/powers.js", "src/injury.js", "src/wolffear.js", "src/speech.js", "src/corpse.js", "src/moods.js", "src/disease.js", "src/tools.js", "src/hides.js",
    "src/cache.js", "src/hut.js", "src/sim.js", "src/icons.js"])
    vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
  // stub Render before ui.js assigns focusFrac
  ctx.GS.Render = ctx.GS.Render || { centerOn() {}, view: { z: 1 }, zoomBy() {}, setViewport() {}, follow: null, pulse: null, frac() { return { fx: 0.5, fy: 0.5 }; }, toTile() { return { x: 0, y: 0 }; } };
  vm.runInContext(fs.readFileSync(path.join(root, "src/ui.js"), "utf8"), ctx, { filename: "src/ui.js" });
  return ctx.GS;
}

const G = load(), C = G.data.config;
let fails = 0;
const ok = (c, msg, extra) => { console.log((c ? "PASS " : "FAIL ") + msg + (extra !== undefined ? "  " + extra : "")); if (!c) fails++; };
const logs = s => (s.log || []).map(l => typeof l === "string" ? l : l.text || "");
const rainAll = (s, str) => { const r = G.Powers.cast(s, "rain", s.world.w >> 1, s.world.h >> 1, str); const e = s.powers.effects.find(q => q.k === "rain" && q.on); if (e) { e.r = 9999; e.end = 1e9; } else console.log("rain cast:", JSON.stringify(r).slice(0, 200)); return !!e; };
ok(C.saveVersion === 37, "saveVersion === 37");
{ const html = fs.readFileSync(path.join(root, "index.html"), "utf8"); const refs = [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+)"/g)].map(m => m[1]).filter(u => !/^(https?:|data:)/.test(u));
  ok(refs.every(u => /[?&]v=37\b/.test(u)) && /injury\.js/.test(html) && /wolffear\.js/.test(html), "index.html ?v=37 everywhere + injury.js / wolffear.js loaded"); }

// ---- ITEM 1: rain vs wolves (one knob), rain warmth, cover ----
{ // same setup each trial: one hungry pack wolf, a deer 4 tiles off, nobody else; count how often she starts a hunt
  const run = str => { const s = G.Sim.create(4040); if (str) rainAll(s, str); s.agents = []; s.bodies = [];
    const w = s.animals.find(q => q.species === "wolves"); s.animals = s.animals.filter(q => q === w || (q.species === "wolves" && false));
    const t0 = { x: Math.round(w.pos.x), y: Math.round(w.pos.y) }; let dx = 4; while (dx > 1 && !G.World.walkable(s.world, t0.x + dx, t0.y)) dx--;
    let n = 0; const N = 400;
    for (let i = 0; i < N; i++) { s.tick++; w.pos = { x: t0.x, y: t0.y }; w.act = { type: "idle", until: 0 }; w.needs.fullness = 5; w.sleepUntil = null;
      s.animals = [w]; const d = G.Animal.create(s, "grazer", t0.x + dx, t0.y); s.animals.push(d);
      G.Animal.step(s, w); if (w.act && (w.act.goal === "hunt" || w.act.prey != null || s.animals.indexOf(d) < 0 || d.dead)) n++; }
    return n / N; };
  const clear = run(null), light = run("light"), heavy = run("heavy");
  ok(clear > 0.9 && heavy < clear * 0.4, "ITEM1 wolf hunt starts much lower in heavy rain vs clear (same setup)", "clear=" + clear.toFixed(2) + " light=" + light.toFixed(2) + " heavy=" + heavy.toFixed(2) + " (knob animals.wolves.rainHuntX " + JSON.stringify(C.animals.wolves.rainHuntX) + ")");
  ok(light > heavy && light < clear, "ITEM1 light rain cuts wolf hunting less than heavy");
  const air0 = G.Climate.airC; G.Climate.airC = () => (75 - 32) * 5 / 9;   // ~75°F
  const warm = str => { const s = G.Sim.create(4041); if (str) rainAll(s, str); s.items = s.items.filter(it => !it.lit); s.fire = {};
    const a = s.agents[0]; let spot = null; const W = s.world;   // hold her on an open tile (not woods, no shelter) so the only difference is the rain
    for (let r = 0; r < 30 && !spot; r++) for (let y = (W.h >> 1) - r; y <= (W.h >> 1) + r && !spot; y++) for (let x = (W.w >> 1) - r; x <= (W.w >> 1) + r && !spot; x++)
      if (G.World.inb(W, x, y) && G.World.walkable(W, x, y) && G.World.tile(W, x, y) !== G.data.T.WOODS && !(G.Shelter && G.Shelter.at(s, x, y))) spot = { x, y };
    let cover = false;
    for (let i = 0; i < 120; i++) { a.pos = { x: spot.x, y: spot.y }; if (i === 0) { a.needs.warmth = 40; } a.needs.energy = 90; a.needs.fullness = 90; a.needs.water = 90;
      G.Sim.step(s); if (s.agents.indexOf(a) < 0) break; if (a.act && a.act.goal === "cover") cover = true; if (a.act && a.act.type === "walk" && a.act.goal === "cover") a.act = { type: "idle", until: 0 }; }
    return { w: a.needs.warmth, cover }; };
  const c0 = warm(null), lt = warm("light"), hv = warm("heavy");
  G.Climate.airC = air0;
  ok(c0.w > 40 && hv.w <= 40, "ITEM1 ~75°F heavy rain, no fire: warmth does not climb (clear does)", "clear=" + c0.w.toFixed(1) + " light=" + lt.w.toFixed(1) + " heavy=" + hv.w.toFixed(1));
  ok(hv.cover, "ITEM1 heavy rain: she heads for cover");
  ok(lt.w > hv.w, "ITEM1 light rain chills less than heavy");
  const dr = C.powers.rain.strengths; ok(dr.light.drainPerHour < dr.heavy.drainPerHour && dr.light.exposeX < dr.heavy.exposeX, "ITEM1 rain tunables scale light→heavy");
}
// ---- ITEM 2: fear of wolves, knowledge only, step by step ----
{ const s = G.Sim.create(4042); s.animals = s.animals.filter(q => q.species !== "wolves"); s.packs = [];
  const [p, o, far] = s.agents; const idle = q => { q.act = { type: "idle", until: s.tick + 9999 }; q.hypoUnconscious = false; };
  [p, o, far].forEach(q => { idle(q); q.wolfFear = 0; }); o.pos = { x: p.pos.x + 2, y: p.pos.y }; far.pos = { x: p.pos.x + 40, y: p.pos.y };
  const steps = []; for (let i = 0; i < 4; i++) { s.tick += 200; G.WolfFear.onAttack(s, p); steps.push(o.wolfFear); }
  ok(steps[0] > 0 && steps[0] < C.wolfFear.max * 0.2 && steps.every((v, i) => !i || v > steps[i - 1]) && steps[3] < C.wolfFear.max, "ITEM2 witnessed attacks raise fear step by step, below max", steps.join(" → "));
  ok(p.wolfFear > 0, "ITEM2 the survivor fears wolves");
  ok(far.wolfFear === 0, "ITEM2 unwitnessed attack (too far): no fear");
  const sl = s.agents[3]; sl.wolfFear = 0; sl.pos = { x: p.pos.x + 1, y: p.pos.y }; sl.act = { type: "sleep", until: s.tick + 999 }; G.WolfFear.onAttack(s, p);
  ok(sl.wolfFear === 0, "ITEM2 asleep nearby (did not see it): no fear");
  const b = { id: 99901, kind: "body", of: 777, name: "Test", x: Math.round(far.pos.x), y: Math.round(far.pos.y), diedAt: s.tick, wounds: ["bite"], stage: "fresh" };
  s.bodies.push(b); G.WolfFear.step(s);
  ok(far.wolfFear === 0, "ITEM2 bitten body with no wolf sign: no fear");
  s.animals.push({ id: 99902, species: "wolves", pos: { x: b.x + 3, y: b.y }, act: { type: "idle" } }); G.WolfFear.step(s); const e1 = far.wolfFear; G.WolfFear.step(s);
  ok(e1 > 0 && e1 < C.wolfFear.max && far.wolfFear === e1, "ITEM2 clear evidence (bitten body + wolf near): small gain once per body", "+" + e1);
  const v = s.agents[4]; idle(v); v.wolfFear = 0; v.pos = { x: p.pos.x + 3, y: p.pos.y }; v.parents = [p.id]; const before = o.wolfFear; s.tick += 200; G.WolfFear.onAttack(s, p);
  ok(v.wolfFear === C.wolfFear.gain.sawAttack + C.wolfFear.kinAdd && o.wolfFear - before === C.wolfFear.gain.sawAttack, "ITEM2 kin who saw it gain a little more (same knowledge rule)");
  const dead = s.agents[5]; const body = G.Sim.die(s, dead, "wolves"); ok(body && (body.wounds || []).indexOf("bite") >= 0 && body.cause === "wolves", "ITEM2 cause + wound on the corpse", JSON.stringify(body && body.wounds));
  const L = logs(s).filter(t => /Wolves|bitten/.test(t)); ok(L.length && L.every(t => !/["“”]/.test(t)), "ITEM2 fear logs are actions only", L[0]);
  const ui = fs.readFileSync(path.join(root, "src/ui.js"), "utf8"); ok(/Fear of wolves/.test(ui), "ITEM2 Mind tab shows Fear of wolves");
}
// ---- ITEM 3: People list sex dot ----
{ const s = G.Sim.create(4043), el = { classList: { add() {} }, querySelectorAll() { return []; }, querySelector() { return null; }, innerHTML: "" };
  G.UI.panelRender.people({ sim: s, selected: null }, el, true);
  const m = (el.innerHTML.match(/class="pp-sex m"[^>]*#5aa9e6/g) || []).length, f = (el.innerHTML.match(/class="pp-sex f"[^>]*#e78ac3/g) || []).length;
  ok(m + f === s.agents.length && m > 0 && f > 0, "ITEM3 every People row has a male/female dot before the name", "m=" + m + " f=" + f);
  const css = fs.readFileSync(path.join(root, "index.html"), "utf8"); ok(/\.pp-sex \{[^}]*width: 10px/.test(css), "ITEM3 dot is CSS, 10px"); }
// ---- ITEM 4: Bless ----
{ const s = G.Sim.create(4044), a = s.agents[0]; a.needs.energy = 20; a.needs.fullness = 5; a.knowledge.bushes = {};
  const rb = s.bushes.find(b => b.ripe) || s.bushes[0]; rb.ripe = true; a.pos = { x: rb.x + 3, y: rb.y };
  G.Faith.feed(s, a, a.name + " kneels and prays", "food"); const r = G.Faith.bless(s, s.prayers.length - 1);
  ok(r && a.needs.energy === Math.min(C.bless.energyCap, 20 + C.bless.energyAdd) && a.needs.energy < 100, "ITEM4 tired: small energy boost, capped", "energy=" + a.needs.energy);
  ok(Object.keys(a.knowledge.bushes).length === 1 && a.needs.fullness === 5, "ITEM4 hungry: learns a nearby bush, fullness unchanged");
  a.needs.energy = 39.9; G.Faith.feed(s, a, "x", null); G.Faith.bless(s, s.prayers.length - 1); ok(a.needs.energy <= C.bless.energyCap && a.needs.energy < 100, "ITEM4 boost never above energyCap (never a full fix)", a.needs.energy);
  ok(G.Faith.bless(s, s.prayers.length - 1) === null, "ITEM4 one Bless per prayer");
  const el = { querySelectorAll() { return []; }, innerHTML: "" }; s.prayers[0].blessed = null; G.UI.panelRender.prayers({ sim: s }, el);
  ok(/class="pr-bless"/.test(el.innerHTML) && /data-icon="bless"/.test(el.innerHTML), "ITEM4 Prayers row has a Bless button with the bless icon");
  ok(/\.pr-bless \{[^}]*min-height: 44px/.test(fs.readFileSync(path.join(root, "index.html"), "utf8")), "ITEM4 Bless button is 44px"); }
// ---- ITEM 5: health + body-part injuries ----
{ const s = G.Sim.create(4045), a = s.agents[0]; G.Injury.ensure(a); const m0 = G.Agent.minutesPerTile(a);
  G.Injury.add(s, a, "legR", "gash"); ok(G.Agent.minutesPerTile(a) > m0 * 1.5, "ITEM5 leg gash slows walking", m0 + " → " + G.Agent.minutesPerTile(a));
  ok(G.Injury.canUseTools(a), "ITEM5 gash alone does not block tools");
  G.Injury.add(s, a, "armR", "broken"); ok(!G.Injury.canUseTools(a) && G.Tools.reachTiles(s, a) === 0, "ITEM5 broken arm blocks tools");
  ok(G.Injury.effectWords(a.injuries[0]).indexOf("slow") >= 0 && G.Injury.effectWords(a.injuries[1]).indexOf("no tools") >= 0, "ITEM5 effect words: gash = slow, broken arm = no tools");
  const h0 = a.health; for (let i = 0; i < 60; i++) G.Injury.step(s); ok(a.health < h0, "ITEM5 health ticks down while bleeding", h0 + " → " + a.health.toFixed(1));
  a.health = 0.01; for (let i = 0; i < 5 && s.agents.indexOf(a) >= 0; i++) G.Sim.step(s);
  const body = s.bodies.find(b => b.of === a.id); ok(s.agents.indexOf(a) < 0 && body && body.cause === "wounds", "ITEM5 health at 0 kills (cause wounds)", body && body.cause);
  const b2 = G.Sim.create(4046), p = b2.agents[0]; G.Injury.add(b2, p, "legL", "broken"); app = { sim: b2, selected: p.id };
  const html = fs.readFileSync(path.join(root, "src/ui.js"), "utf8"); ok(/pp-figure/.test(html) && /"Health"/.test(html) && /pp-injuries/.test(html), "ITEM5 card has Health bar, body figure, injury list");
  ok(C.bodyFigure.w === 64 && C.bodyFigure.h === 128 && C.bodyFigure.fill.hurt === "#e0a84f" && C.bodyFigure.fill.bad === "#e05a6e", "ITEM5 figure 64x128 with Artist fills"); }
// ---- ITEM 6: Resurrect window ----
{ const s = G.Sim.create(4047), a = s.agents[0], nm = a.name, id = a.id, b = G.Sim.die(s, a, "wolves"); s.tick += 10;
  const r = G.Powers.cast(s, "resurrect", b.x, b.y); ok(r.ok && s.agents.some(q => q.id === id && q.name === nm) && !s.bodies.includes(b), "ITEM6 Resurrect raises a recently dead person", JSON.stringify({ ok: r.ok, reason: r.reason }));
  const c = s.agents[1], b2 = G.Sim.die(s, c, "old age"); s.tick += C.powers.resurrect.windowMinutes / C.time.tickGameMinutes + 5; G.Injury.bodyStep(s);
  const r2 = G.Powers.cast(s, "resurrect", b2.x, b2.y); ok(!r2.ok && !s.agents.some(q => q.id === c.id), "ITEM6 too long dead: no resurrection", r2.reason); }
// ---- ITEM 7: Heal ----
{ const s = G.Sim.create(4048), a = s.agents[0]; G.Injury.add(s, a, "legR", "gash"); G.Injury.add(s, a, "armL", "broken"); a.health = 40;
  const r = G.Powers.cast(s, "heal", Math.round(a.pos.x), Math.round(a.pos.y)); ok(r.ok && a.injuries.length === 0 && a.health > 40 && G.Injury.canUseTools(a) && G.Injury.moveX(a) === 1, "ITEM7 Heal mends injured body parts", JSON.stringify({ ok: r.ok, n: a.injuries.length, h: a.health })); }
// ---- ITEM 8: Powers menu categories ----
{ const cats = C.powers.categories, all = [].concat(...cats.map(c => c.powers));
  ok(cats.map(c => c.label).join(",") === "Weather,Healing,Creatures,Harm" && cats[0].powers.join() === "rain,lightning,warm,cool" && cats[1].powers.join() === "heal,cure,resurrect" && cats[2].powers.join() === "spawn" && cats[3].powers.join() === "plague", "ITEM8 four categories as the mock");
  ok(C.powers.order.every(k => all.indexOf(k) >= 0 && C.powers.labels[k] && G.icons[k]), "ITEM8 every power in a category with a label and icon");
  const css = fs.readFileSync(path.join(root, "index.html"), "utf8"); ok(/button\.pw \{[^}]*min-width: 84px; min-height: 64px/.test(css) && /button\.pw\.on \{[^}]*#8a5a2e[^}]*#4fc3d9/.test(css) && /pw-hint \{[^}]*font-size: 16px/.test(css), "ITEM8 84x64 buttons, armed #8a5a2e + cyan outline, 16px hint");
  ok(!("powersMenuV2" in (C.ui || {})), "ITEM8 new menu is the default (no flag)"); }
// ---- ITEM 9: meat source tags in the eat log ----
{ const s = G.Sim.create(4049), a = s.agents[0], who = a.name;
  const eat = src => { const it = G.Items.create(s, "meat", Math.round(a.pos.x), Math.round(a.pos.y)); it.spoilAt = s.tick + 1e6; it.src = src; s.items.push(it); it.heldBy = a.id; a.carry = it.id; a.needs.fullness = 20;
    const n0 = s.log.length; G.Hunt.startEat(s, a, it); for (let i = 0; i < 500 && a.act.type === "eatMeat"; i++) G.Hunt.stepEat(s, a); return logs(s).slice(n0 > 0 ? -5 : 0).filter(t => / eats the /.test(t)).pop() || ""; };
  const deer = { species: "grazer", name: "deer", cause: "killed", killedBy: who }, wolfK = { species: "grazer", name: "deer", cause: "killed", killedBy: "Wolves" }, dog = { species: "scavenger", name: "wild dog", cause: "old age" };
  const lh = eat(G.Hunt.sourceOf(deer, a)), ls = eat(G.Hunt.sourceOf(wolfK, a)), lc = eat(G.Hunt.sourceOf(dog, a)), lp = eat({ k: "stockpile", owner: "Mira" });
  ok(/hunted/.test(lh) && /deer/.test(lh), "ITEM9 hunted (with animal)", lh); ok(/kill site/.test(ls) && /Wolves'/.test(ls), "ITEM9 found at a kill site", ls);
  ok(/scavenged/.test(lc) && /wild dog/.test(lc), "ITEM9 scavenged a carcass", lc); ok(/Mira's cache/.test(lp), "ITEM9 taken from a stockpile (whose)", lp);
  ok([lh, ls, lc, lp].every(t => !/["“”]/.test(t)), "ITEM9 eat lines are actions only");
  const cs = fs.readFileSync(path.join(root, "src/cache.js"), "utf8"); ok(/k: "stockpile"/.test(cs) && /stashedBy/.test(cs), "ITEM9 cache stash/retrieve sets the stockpile tag");
  const s2 = G.Sim.create(4050), ser = JSON.parse(JSON.stringify(G.Sim.serialize(s2))); ser.version = 36; for (const ag of ser.agents) { delete ag.health; delete ag.injuries; delete ag.wolfFear; }
  const it2 = { id: 88001, kind: "item", material: "meat", x: 1, y: 1 }; (ser.items = ser.items || []).push(it2);
  const L2 = G.Sim.deserialize(ser), m2 = L2.items.find(q => q.id === 88001);
  ok(L2 && L2.agents.every(q => q.health != null && Array.isArray(q.injuries) && q.wolfFear != null) && m2 && m2.src && m2.src.k === C.meat.migrateSource, "ITEM9 / migrate 36→37 defaults health, injuries, fear, meat src", m2 && JSON.stringify(m2.src)); }
console.log(fails ? fails + " FAILED" : "ALL PASS"); process.exit(fails ? 1 : 0);
