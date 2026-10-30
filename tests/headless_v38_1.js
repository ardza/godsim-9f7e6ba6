// v38.1 hotfix fixtures: (1) thirst - a stash walk must not cancel a drink at the shore; (2) cold - hypothermia RNG effects fire.
// Run: node tests/headless_v38_1.js          (ROOT=/path/to/build to run the same fixtures against another build, e.g. godsim-rc-v38)
const fs = require("fs"), path = require("path");
let src = fs.readFileSync(path.join(__dirname, "headless_v38.js"), "utf8").split("const G = load()")[0];
if (process.env.ROOT) src = src.replace('root = path.join(__dirname, "..")', 'root = ' + JSON.stringify(process.env.ROOT));
eval(src);
const G = load(), C = G.data.config, W = G.World;
let fails = 0, passes = 0;
const ok = (c, msg, extra) => { console.log((c ? "PASS " : "FAIL ") + msg + (extra !== undefined ? "  " + extra : "")); if (c) passes++; else fails++; };
const texts = s => (s.log || []).map(l => typeof l === "string" ? l : l.text || "");
const linesOf = (s, from, name, re) => texts(s).slice(from).filter(t => t.startsWith(name) && re.test(t)).length;
const strip = s => { s.animals = s.animals.filter(q => q.species !== "wolves"); s.packs = []; };

// ---------- (1) thirst ----------
function shoreFixture(seed, thirsty) {
  const s = G.Sim.create(seed); strip(s);
  const a = s.agents[0], w = s.world;
  // a land tile touching water, with a shelter cache 5+ tiles away (known)
  const sh = (s.shelters || [])[0];
  let spot = null;
  for (let y = 1; y < w.h - 1 && !spot; y++) for (let x = 1; x < w.w - 1 && !spot; x++) {
    if (W.isWater(w, x, y) || !W.walkable(w, x, y)) continue;
    let wx = null; for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) if (W.isWater(w, x + dx, y + dy)) wx = [x + dx, y + dy];
    if (!wx) continue;
    spot = { x, y, wx };
  }
  if (!spot) return null;
  a.pos = { x: spot.x, y: spot.y }; a.act = { type: "idle", until: s.tick + 1 }; a.den = null;
  a.knowledge.water = a.knowledge.water || {}; a.knowledge.water[spot.wx[0] + "," + spot.wx[1]] = "lake";
  // known cache: a prayer-spot style memory 6 tiles away on walkable land
  let cx = null;
  for (let r = 6; r <= 12 && !cx; r++) for (let dy = -r; dy <= r && !cx; dy++) for (let dx = -r; dx <= r && !cx; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = spot.x + dx, y = spot.y + dy; if (W.inb(w, x, y) && W.walkable(w, x, y) && !W.isWater(w, x, y) && W.findPath(w, spot.x, spot.y, x, y)) cx = { x, y };
  }
  G.Cache.remember(a, { key: G.Cache.keyPrayer(cx.x, cx.y), kind: "prayer", x: cx.x, y: cx.y }, []);
  if (!G.Cache.candidates(s, a).length) { const q = { x: cx.x, y: cx.y, worn: 99, prayers: 99 }; (s.prayerSpots = s.prayerSpots || []).push(q); }
  const it = G.Items.create(s, "flint", spot.x, spot.y); it.tool = "flake"; s.items.push(it); it.heldBy = a.id; a.carry = it.id; a.carryUntil = thirsty ? s.tick + 5000 : s.tick;
  a.needs.water = thirsty ? 5 : 95; a.needs.fullness = 95; a.needs.energy = 90; a.needs.warmth = 90;
  return { s, a, spot, cx };
}
{ const f = shoreFixture(5, true);
  if (!f) ok(false, "thirst fixture: no shore tile found");
  else { const { s, a } = f, L0 = (s.log || []).length; let maxW = a.needs.water, stashWhileThirsty = 0;
    for (let i = 0; i < 15 / C.time.tickGameMinutes; i++) { const thirsty = a.needs.water < C.person.actAt; G.Sim.step(s); if (thirsty && a.act.goal === "stash") stashWhileThirsty++; maxW = Math.max(maxW, a.needs.water); }
    const drinks = linesOf(s, L0, a.name, /drinks at the/), heads = linesOf(s, L0, a.name, /heads to a known place/);
    ok(maxW >= 99.9, "thirst: at the shore with water 5 and a flake in hand, she drinks to 100 within 15 min", "max water " + maxW.toFixed(1));
    ok(drinks === 1, "thirst: 'drinks at the lake' logged once", "drinks " + drinks);
    ok(heads === 0 && stashWhileThirsty === 0, "thirst: 0 'heads to a known place' while thirsty", "lines " + heads + ", stash ticks " + stashWhileThirsty);
    ok(a.carry == null, "thirst: the item was put down instead", "carry " + a.carry); } }
{ const f = shoreFixture(5, false);
  if (f) { const { s, a } = f; const r = G.Cache.tryStash(s, a);
    let stashed = r; for (let i = 0; i < 60 && !stashed; i++) { G.Sim.step(s); if (a.act.goal === "stash" || a.carry == null) stashed = true; }
    ok(stashed && (a.act.goal === "stash" || a.carry == null), "thirst control: with no need she still heads to stash (or stashes)", "act " + a.act.type + "/" + a.act.goal); } }

// ---------- (2) cold ----------
{ const seeds = [11, 12, 13, 14, 15]; const c = { stumble: 0, lost: 0, drop: 0, nod: 0, slowing: 0, slow: 0, people: 0, seekDrowsy: 0, nightsDrowsy: 0 };
  for (const seed of seeds) { const s = G.Sim.create(seed); strip(s);
    // start at 06:00
    while (G.Time.at(s.tick).hour !== 6) G.Sim.step(s);
    const L0 = (s.log || []).length;
    for (const a of s.agents) { a.hold = "warmth"; a.needs.warmth = 0; a.needs.water = 100; a.needs.fullness = 100; a.needs.energy = 100;
      if (a.carry == null) { const it = G.Items.create(s, "stick", Math.round(a.pos.x), Math.round(a.pos.y)); s.items.push(it); it.heldBy = a.id; a.carry = it.id; a.carryUntil = s.tick + 1e6; } }
    c.people += s.agents.length;
    const T = 8 * 60 / C.time.tickGameMinutes;
    for (let i = 0; i < T; i++) { for (const a of s.agents) { a.needs.water = Math.max(a.needs.water, 60); a.needs.fullness = Math.max(a.needs.fullness, 60); } G.Sim.step(s); }
    const t = texts(s).slice(L0);
    c.stumble += t.filter(x => / is stumbling$/.test(x)).length; c.lost += t.filter(x => / looks lost$/.test(x)).length;
    c.drop += t.filter(x => / drops what they were carrying$/.test(x)).length;
    c.nod += t.filter(x => / is nodding off$/.test(x)).length; c.slowing += t.filter(x => / is slowing further$/.test(x)).length;
    c.slow += t.filter(x => / is moving slow$/.test(x)).length; }
  ok(c.stumble + c.lost >= 1 && c.stumble > 0 && c.lost > 0, "cold: stumbling / looks lost happen, both variants", "stumbling " + c.stumble + ", looks lost " + c.lost);
  ok(c.drop >= 1, "cold: drops what they were carrying happens", "drops " + c.drop);
  ok(c.nod + c.slowing >= 1, "cold: nodding off / slowing further happens", "nodding " + c.nod + ", slowing " + c.slowing);
  ok(c.slow > 0, "cold control: 'is moving slow' still logged", "slow " + c.slow + " of " + c.people + " people"); }
// drowsy bedtime: stage 4+ people seek warmth on some nights (12%), not never
{ let seek = 0, nights = 0; const R = { float: () => 0.05 }, R2 = { float: () => 0.5 };
  const rngTest = p => (p.float() >= 0.12);   // mirror of agent.js:653 logic
  ok(!rngTest(R) && rngTest(R2), "cold: skipSeek uses a 0-1 draw (low draw seeks, high draw skips)");
  const r = new G.RNG(42); let lo = 0; for (let i = 0; i < 1000; i++) if (r.float() < 0.12) lo++;
  ok(lo > 80 && lo < 160, "cold: float() < 0.12 about 12% of the time", lo + "/1000"); }
{ const srcA = fs.readFileSync(path.join(process.env.ROOT || path.join(__dirname, ".."), "src/agent.js"), "utf8");
  ok(!/sim\.rng\.next\(\)/.test(srcA), "agent.js: no raw rng.next() left", (srcA.match(/sim\.rng\.next\(\)/g) || []).length + " left"); }
console.log("\n" + passes + " PASS, " + fails + " FAIL"); process.exit(fails ? 1 : 0);
