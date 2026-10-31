// v39.1 headless: rain and colonist warmth (Commissioner: "rain still doesn't affect colonist warmth ... they don't register it, especially asleep").
// One isolated person on an open meadow (no animals, no others), mild year-1 air, rain cast on her tile. Each fixture is compared with a dry twin.
// Fixtures: awake, asleep, in a hut, by a fire, in a hide, under trees, drying out after the rain, save / load, no-rain runs write no new fields.
// Run: node tests/headless_v39_1.js
const { load } = require("./lib_v39.js");
const G = load(), C = G.data.config, W = G.World, T = G.data.T;
let pass = 0, fail = 0; const check = (c, m, x) => { console.log((c ? "PASS " : "FAIL ") + m + (x !== undefined ? "  " + JSON.stringify(x) : "")); if (c) pass++; else fail++; };
const r1 = v => Math.round(v * 10) / 10;
function bare(seed, hour) { const s = G.Sim.create(seed || 39); s.animals = []; s.packs = []; s.agents = []; s.bodies = [];
  if (hour != null) s.tick = ((hour - 6 + 24) % 24) * 60; return s; }
function spot(s, want) { const w = s.world;   // a tile whose 5x5 block is all `want` (open grass: no woods, no water) and no shelter
  for (let y = 6; y < w.h - 6; y++) for (let x = 6; x < w.w - 6; x++) { let g = true;
    for (let dy = -2; dy <= 2 && g; dy++) for (let dx = -2; dx <= 2 && g; dx++) { const t = W.tile(w, x + dx, y + dy);
      if (!W.walkable(w, x + dx, y + dy) || W.isWater(w, x + dx, y + dy) || (want === "woods" ? t !== T.WOODS : t === T.WOODS)) g = false; }
    if (g && !G.Shelter.at(s, x, y)) return { x, y }; } return null; }
function person(s, p, mode, warmth) { const a = G.Agent.createPerson(s, p.x, p.y); s.agents.push(a); a.pos = { x: p.x, y: p.y };
  Object.assign(a.needs, { fullness: 95, water: 95, energy: mode === "sleep" ? 15 : 90, warmth: warmth != null ? warmth : 70 }); a.injuries = [];
  a.act = mode === "sleep" ? { type: "sleep", since: s.tick } : { type: "idle", until: s.tick + 1e6 }; return a; }
// run `min` minutes. pin: put her back on her tile in her act each minute (gear / hut / fire comparisons measure the warmth model, not walking)
function run(s, a, min, pin, each) { const p0 = { x: a.pos.x, y: a.pos.y }, act0 = Object.assign({}, a.act);
  for (let i = 0; i < min; i++) { if (each) each(s, i); G.Sim.step(s); if (pin) { a.pos = { x: p0.x, y: p0.y }; a.act = Object.assign({}, act0); } } }
const logs = (s, a) => (s.log || []).map(l => l.text || l).filter(t => t.indexOf(a.name) === 0);
function twin(opt) {   // { mode, hour, str, min, pin, setup(s, a, p), each, at: "open" | "woods" }
  const out = {};
  for (const rain of [false, true]) { const s = bare(opt.seed || 39, opt.hour), p = spot(s, opt.at), a = person(s, p, opt.mode, opt.warmth);
    if (opt.setup) opt.setup(s, a, p); if (rain) G.Powers.cast(s, "rain", p.x, p.y, opt.str || "medium");
    let minWarm = 100, maxWet = 0; run(s, a, opt.min, opt.pin, (ss, i) => { if (opt.each) opt.each(ss, i, a, p); minWarm = Math.min(minWarm, a.needs.warmth); maxWet = Math.max(maxWet, a.wet || 0); });
    out[rain ? "rain" : "dry"] = { s, a, p, warmth: a.needs.warmth, wet: a.wet || 0, minWarm, maxWet, logs: logs(s, a), tile: W.tile(s.world, Math.round(a.pos.x), Math.round(a.pos.y)) }; }
  return out; }

// 1 config knobs
const Wt = C.person.warmth.wet, R = C.powers.rain;
check(!!Wt && Wt.soakPerHour.medium > 0 && Wt.dryPerHour > 0 && Wt.chillC > 0 && R.woodsKeepOff === 0.5 && R.coverAbove === 0.5, "1 config: person.warmth.wet and powers.rain.woodsKeepOff / coverAbove", { wet: Wt, woodsKeepOff: R.woodsKeepOff, coverAbove: R.coverAbove });
check(C.saveVersion === 39, "1 saveVersion stays 39 (a.wet is optional, absent = dry)", C.saveVersion);

// 2 awake in the open, medium rain, 3 h (she may walk to the trees)
{ const o = twin({ mode: "idle", hour: 14, min: 180 }), L = o.rain.logs;
  check(o.rain.warmth < o.dry.warmth - 5, "2 awake: rain leaves her colder than her dry twin", { dry: r1(o.dry.warmth), rain: r1(o.rain.warmth) });
  check(L.some(t => /feels the rain start|face up into the rain/.test(t)), "2 awake: she notices the first drops (log line)", L.filter(t => /rain/.test(t)).slice(0, 3));
  check(L.some(t => /heads for cover|hurries out of the rain/.test(t)), "2 awake: she heads for cover", L.filter(t => /cover|out of the rain/.test(t)).slice(0, 2));
  check(o.rain.maxWet > 30 && o.dry.wet === 0 && o.dry.a.wet === undefined, "2 awake: she gets wet (dry twin never gets the field)", { maxWet: r1(o.rain.maxWet), dryField: o.dry.a.wet }); }

// 3 awake, pinned in the open (cannot reach cover): soaked through, colder, seeks warmth sooner
{ const o = twin({ mode: "idle", hour: 14, min: 120, pin: true });
  check(o.rain.wet >= Wt.soakedAt && o.rain.logs.some(t => /is soaked through/.test(t)), "3 pinned awake: soaked through after 2 h in medium rain (log)", { wet: r1(o.rain.wet) });
  check(G.Agent.warmthSeekBelow(o.rain.a) > G.Agent.warmthSeekBelow(o.dry.a) + 5, "3 wet: she looks for warmth sooner (warmthSeekBelow + seekAdd x wet)", { dry: G.Agent.warmthSeekBelow(o.dry.a), wet: r1(G.Agent.warmthSeekBelow(o.rain.a)) }); }

// 4 asleep in the open at night, medium rain: colder, wet, wakes once and heads for cover
{ const o = twin({ mode: "sleep", hour: 23, min: 240 }), L = o.rain.logs, wakes = L.filter(t => /wakes up (soaked|cold) in the rain/.test(t));
  const pin = twin({ mode: "sleep", hour: 23, min: 240, pin: true });   // kept lying in the open (she cannot get up)
  check(pin.rain.warmth < pin.dry.warmth - 10 && pin.rain.wet >= Wt.wakeWetAt, "4 asleep: rain makes a sleeper in the open colder than her dry twin, and soaks her", { dry: r1(pin.dry.warmth), rain: r1(pin.rain.warmth), wet: r1(pin.rain.wet) });
  check(wakes.length === 1, "4 asleep: she wakes up soaked / cold in the rain, once", wakes);
  check(L.some(t => /gets up and heads for|finds no cover/.test(t)), "4 asleep: on waking she heads for cover (or curls up if none)", L.filter(t => /heads for|no cover/.test(t)));
  check(!o.dry.logs.some(t => /rain/.test(t)), "4 dry twin: no rain lines"); }

// 5 once per rain: woken, then laid down again in the open in the same rain, she is not woken a second time; a new rain may wake her again
{ const s = bare(39, 23), p = spot(s), a = person(s, p, "sleep"); G.Powers.cast(s, "rain", p.x, p.y, "heavy");
  run(s, a, 90, false); const n1 = logs(s, a).filter(t => /wakes up .* in the rain/.test(t)).length;
  a.pos = { x: p.x, y: p.y }; a.act = { type: "sleep", since: s.tick }; run(s, a, 60, true); const n2 = logs(s, a).filter(t => /wakes up .* in the rain/.test(t)).length;
  check(n1 === 1 && n2 === 1, "5 woken by the rain at most once per rain", { first: n1, after: n2 }); }

// 6 in a hut (sticks, rain 0.85): protected - small wet, warmth close to dry
{ const setup = (s, a, p) => { const h = G.Hut.create(s, p.x, p.y, a); a.den = h.id; };
  const hut = twin({ mode: "sleep", hour: 23, min: 240, pin: true, setup }), open = twin({ mode: "sleep", hour: 23, min: 240, pin: true });
  check(hut.rain.maxWet <= 100 * (1 - 0.85) + 1e-6, "6 hut: wetness stays at or below 100 x (1 - hut rain 0.85)", { maxWet: r1(hut.rain.maxWet) });
  check(hut.dry.warmth - hut.rain.warmth < (open.dry.warmth - open.rain.warmth) * 0.5, "6 hut: loses less than half what an open sleeper loses to the rain", { hutLoss: r1(hut.dry.warmth - hut.rain.warmth), openLoss: r1(open.dry.warmth - open.rain.warmth) });
  check(!hut.rain.logs.some(t => /wakes up .* in the rain/.test(t)), "6 hut: the rain does not wake her"); }

// 7 by a fire (kept lit next to her through the rain): dries / stays drier, keeps warmer than the open
// (the fire is pinned on the next tile and fire spread is switched off for these runs: only its heat matters here)
const FS = G.Fire.step, noSpread = fn => { G.Fire.step = () => {}; try { return fn(); } finally { G.Fire.step = FS; } };
{ const each = (s, i, a, p) => { s.fire[(p.x + 1) + "," + p.y] = { s: "fire", t: 0, end: s.tick + 600 }; };
  const fire = noSpread(() => twin({ mode: "idle", hour: 14, min: 180, pin: true, each })), open = twin({ mode: "idle", hour: 14, min: 180, pin: true });
  check(fire.rain.wet < open.rain.wet * 0.7, "7 fire: by a fire she stays much drier in the rain", { fire: r1(fire.rain.wet), open: r1(open.rain.wet) });
  check(fire.rain.warmth > open.rain.warmth + 10, "7 fire: and much warmer", { fire: r1(fire.rain.warmth), open: r1(open.rain.warmth) }); }

// 8 wearing a hide: helps some (less wet, less chill) but less than a hut
{ let hid = null; const setup = (s, a, p) => { const it = G.Items.create(s, "hide", p.x, p.y); it.wornBy = a.id; it.heldBy = null; a.wearingHide = hid = it.id; };
  const each = (s, i, a) => { a.wearingHide = hid; const it = G.Items.byId(s, hid); if (it) it.wornBy = a.id; };   // she keeps it on (no taking it off in the warm afternoon)
  const hide = twin({ mode: "idle", hour: 14, min: 180, pin: true, setup, each }), open = twin({ mode: "idle", hour: 14, min: 180, pin: true });
  check(hide.rain.wet < open.rain.wet - 20 && hide.rain.wet > 30, "8 hide: worn hide keeps some of the soaking off (not all)", { hide: r1(hide.rain.wet), open: r1(open.rain.wet) });
  check(hide.rain.a.felt.gear === Wt.gear.hide, "8 hide: gear share on her = wet.gear.hide", hide.rain.a.felt.gear);
  check((hide.rain.a.felt.c - hide.dry.a.felt.c) > (open.rain.a.felt.c - open.dry.a.felt.c), "8 hide: the rain chill on her is smaller", { hide: r1(hide.rain.a.felt.c - hide.dry.a.felt.c), open: r1(open.rain.a.felt.c - open.dry.a.felt.c) }); }

// 9 under trees: trees keep half off (was: all). Asleep in the woods she now feels it, gets damp, but it is cover: she does not walk off
{ const o = twin({ mode: "sleep", hour: 23, min: 240, at: "woods" });
  check(o.rain.tile === T.WOODS && o.dry.tile === T.WOODS, "9 (setup) both twins asleep on a woods tile", o.rain.tile);
  const s = bare(39, 23), p = spot(s, "woods"), a = person(s, p, "sleep"); G.Powers.cast(s, "rain", p.x, p.y, "medium");
  check(G.Powers.exposure(s, a) === 0.5 && !G.Powers.outInRain(s, a), "9 woods: exposure 0.5 under trees, counted as under cover", G.Powers.exposure(s, a));
  check(o.rain.warmth < o.dry.warmth - 3, "9 woods: a sleeper under trees now gets colder in the rain (v39: no effect at all)", { dry: r1(o.dry.warmth), rain: r1(o.rain.warmth) });
  check(o.rain.maxWet > 20 && o.rain.maxWet <= 50 + 1e-6, "9 woods: damp, at most half soaked", r1(o.rain.maxWet));
  check(!o.rain.logs.some(t => /in the rain|heads for/.test(t)), "9 woods: not woken, does not leave her trees"); }

// 10 drying out: wet lingers after the rain stops (still chilling her), dries slowly in the open and faster by a fire
{ const dry = fire => { const s = bare(39, 10), p = spot(s), a = person(s, p, "idle"); G.Powers.cast(s, "rain", p.x, p.y, "light"); const e = s.powers.effects.find(q => q.k === "rain");
    run(s, a, 120, true); const w0 = a.wet; e.end = s.tick; run(s, a, 2, true); const wetC = a.felt && a.felt.wetC;
    run(s, a, 120, true, fire ? ss => { ss.fire[(p.x + 1) + "," + p.y] = { s: "fire", t: 0, end: ss.tick + 600 }; } : null); return { w0: r1(w0), w2h: r1(a.wet || 0), wetC, logs: logs(s, a) }; };
  const o = dry(false), f = noSpread(() => dry(true));
  check(o.wetC > 0, "10 after the rain stops, wet skin still feels colder (felt.wetC)", o.wetC);
  check(o.w2h < o.w0 && o.w2h > o.w0 - 20, "10 open: dries slowly (dryPerHour 6)", o);
  check(f.w2h < o.w2h - 20, "10 fire: dries much faster by a fire", { fire: f.w2h, open: o.w2h });
  check(f.logs.some(t => /has dried off/.test(t)) || f.w0 < Wt.soakedAt, "10 'has dried off' line once dry (when she had been soaked)", f.logs.filter(t => /dried|soaked/.test(t))); }

// 11 save / load keeps wetness; a never-wet person has no wet field in the save
{ const s = bare(39, 14), p = spot(s), a = person(s, p, "idle"), b = person(s, { x: p.x + 40 < s.world.w ? p.x + 40 : p.x - 40, y: p.y }, "idle"); G.Powers.cast(s, "rain", p.x, p.y, "medium");
  run(s, a, 60, true); const txt = G.Sim.serialize(s), o = JSON.parse(typeof txt === "string" ? txt : JSON.stringify(txt)), s2 = G.Sim.deserialize(o);
  const a2 = s2.agents.find(q => q.id === a.id), b2 = s2.agents.find(q => q.id === b.id);
  check(a2 && Math.abs((a2.wet || 0) - a.wet) < 1e-9 && a.wet > 0, "11 save -> load keeps her wetness", { saved: r1(a.wet), loaded: a2 && r1(a2.wet || 0) });
  check(b2 && b2.wet === undefined, "11 someone outside the rain never gets a wet field", b2 && b2.wet); }

// 12 no rain anywhere: a whole colony day writes no rain / wet fields (no-rain runs unchanged)
{ const s = G.Sim.create(7); for (let i = 0; i < 1440; i++) G.Sim.step(s);
  check(s.agents.every(a => a.wet === undefined && a.rainWoke === undefined && a.soakLogged === undefined), "12 no rain: no wet / rainWoke / soakLogged fields on anyone"); }

console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
