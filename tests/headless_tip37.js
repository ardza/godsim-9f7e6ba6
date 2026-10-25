// §37 Hard points (v34). Run: node tests/headless_tip37.js
const vm = require("vm"), fs = require("fs"), path = require("path"), root = path.join(__dirname, "..");
function load() {
  const ctx = { console, Math, JSON }; vm.createContext(ctx);
  for (const f of ["data/config.js", "data/tiles.js", "data/names.js", "data/words.js", "data/group_names.js", "data/art.js", "data/materials.js",
    "src/rng.js", "src/world.js", "src/climate.js", "src/agent.js", "src/animal.js", "src/objects.js", "src/fire.js",
    "src/learn.js", "src/hunt.js", "src/cook.js", "src/social.js", "src/family.js", "src/faith.js", "src/shelter.js",
    "src/powers.js", "src/speech.js", "src/corpse.js", "src/moods.js", "src/disease.js", "src/tools.js", "src/hides.js",
    "src/cache.js", "src/hut.js", "src/sim.js"])
    vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
  return ctx.GS;
}
const G = load(), C = G.data.config, TC = C.tools;
let fails = 0;
const ok = (c, msg, extra) => { console.log((c ? "PASS " : "FAIL ") + msg + (extra !== undefined ? "  " + extra : "")); if (!c) fails++; };

ok(C.saveVersion === 34 && !!TC.tip && TC.scoreMin === 45 && Array.isArray(TC.tip.points) && TC.tip.points.indexOf("ore") >= 0 && TC.tip.points.indexOf("flint") >= 0,
  "saveVersion 34 + tools.tip (ore|flint → stick|bone)", "v=" + C.saveVersion + " points=" + (TC.tip && TC.tip.points));
ok(TC.tip.shafts.join() === "stick,bone" && TC.tip.digMult < 1 && TC.tip.huntOddsAdd > 0,
  "tip shafts + dig/hunt bonuses in data", "dig=" + TC.tip.digMult + " huntAdd=" + TC.tip.huntOddsAdd);

{ const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const refs = [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+)"/g)].map(m => m[1]).filter(u => !/^(https?:|data:)/.test(u));
  const bad = refs.filter(u => { const m = u.match(/[?&]v=(\d+)/); return !m || +m[1] !== 34; });
  ok(!bad.length, "index.html ?v=34 everywhere", "bad=" + bad.slice(0, 3));
  ok(fs.existsSync(path.join(root, "data/art/tip_stick_16.png"))
    && fs.existsSync(path.join(root, "data/art/tip_bone_16.png"))
    && fs.existsSync(path.join(root, "data/art/tip_16.png"))
    && G.data.art.tipStick && G.data.art.tipBone && G.data.art.tip
    && G.data.art.tip.cols.join() === "tip_stick,tip_bone",
    "Artist tip sheets wired (tipStick|tipBone|tip)");
}

// ---- Unit: tip craft ≥45; Discoveries; dig + hunt bonus; dull ----
{ const s = G.Sim.create(1101);
  const a = s.agents[0];
  G.Learn.add(a, "strike", 50);
  ok(G.Learn.score(a, "strike") >= 45, "strike score ≥45 for tip craft", G.Learn.score(a, "strike"));
  const shaft = G.Items.create(s, "stick", Math.round(a.pos.x), Math.round(a.pos.y));
  const point = G.Items.create(s, "ore", Math.round(a.pos.x), Math.round(a.pos.y));
  s.items.push(shaft, point); shaft.heldBy = a.id; a.carry = shaft.id;
  const beforeN = s.items.length;
  ok(!!G.Tools.finishTip(s, a, shaft, point, "test tip") && shaft.tool === "tip_stick" && a.carry === shaft.id,
    "finishTip → tip_stick in hand", shaft.tool + " tippedWith=" + shaft.tippedWith);
  ok(s.items.length === beforeN - 1 && !s.items.includes(point), "ore point consumed");
  ok((s.discoveries || []).some(d => d.title === "First hard tip"),
    "Discoveries First hard tip", (s.discoveries || []).map(d => d.title || d.key).join(","));
  ok(s.log.some(e => /hard tip|strikes a hard tip|strikes the ore/.test(e.text)),
    "action-only tip craft log", s.log.filter(e => /tip|ore/.test(e.text)).map(e => e.text).slice(0, 2).join(" | "));
  ok(G.Tools.digOk(shaft) && G.Tools.digMult(shaft) === TC.tip.digMult && G.Tools.digMult(shaft) < 1,
    "tip dig bonus", "digMult=" + G.Tools.digMult(shaft));
  const bare = G.Hunt.odds(a, { material: "rock", form: "whole", props: { hardness: 70, sharpness: 10 } });
  const tipped = G.Hunt.odds(a, shaft);
  ok(tipped > bare && G.Tools.huntOddsAdd(shaft) === TC.tip.huntOddsAdd,
    "tip hunt odds bonus", "bare=" + bare + " tip=" + tipped);
  // bone + flint → tip_bone
  G.Items.drop(s, a);
  const bone = G.Items.create(s, "bone", Math.round(a.pos.x), Math.round(a.pos.y));
  const flint = G.Items.create(s, "flint", Math.round(a.pos.x), Math.round(a.pos.y));
  s.items.push(bone, flint);
  G.Tools.finishTip(s, a, bone, flint, "bone tip");
  ok(bone.tool === "tip_bone" && G.Tools.isTip(bone), "flint on bone → tip_bone", bone.tool);
  // dull loses bonus
  bone.props.durability = TC.dullBelow;
  ok(!G.Tools.bonusLive(bone) && G.Tools.digMult(bone) === 1 && G.Tools.huntOddsAdd(bone) === 0,
    "dull tip loses dig/hunt bonus");
  // wear via Tools.use
  bone.tool = "tip_bone"; bone.props.durability = 20;
  G.Tools.use(s, a, bone, "hunt");
  ok(bone.props.durability < 20, "tip dulls with use", bone.props.durability);
}

// ---- onTry strike path crafts tip ----
{ const s = G.Sim.create(1103);
  const a = s.agents[0];
  G.Learn.add(a, "strike", 50);
  const stick = G.Items.create(s, "stick", Math.round(a.pos.x), Math.round(a.pos.y));
  const ore = G.Items.create(s, "ore", Math.round(a.pos.x) + 1, Math.round(a.pos.y));
  s.items.push(stick, ore); ore.heldBy = a.id; a.carry = ore.id;
  G.Tools.onTry(s, a, "strike", ore, stick, { results: ["set tip"], broke: null });
  ok(stick.tool === "tip_stick" && !s.items.includes(ore),
    "onTry strike ore onto stick → tip", "tool=" + stick.tool);
}

// ---- score gate: below 45 no tip ----
{ const s = G.Sim.create(1105);
  const a = s.agents[0];
  // start is 50; pull strike/cut/rub/bind under scoreMin
  for (const k of ["strike", "cut", "rub", "bind"]) G.Learn.add(a, k, -40);
  const stick = G.Items.create(s, "stick", Math.round(a.pos.x), Math.round(a.pos.y));
  const flint = G.Items.create(s, "flint", Math.round(a.pos.x), Math.round(a.pos.y));
  s.items.push(stick, flint); stick.heldBy = a.id; a.carry = stick.id;
  ok(G.Learn.score(a, "strike") < 45 && !G.Tools.scoreOk(a, ["strike", "cut", "rub", "bind"]),
    "low craft scores setup", "strike=" + G.Learn.score(a, "strike"));
  ok(!G.Tools.finishTip(s, a, stick, flint, "blocked") && !stick.tool,
    "tip craft blocked under scoreMin 45");
}

// ---- Multi-seed: ≥1 tip craft on 3 of 8 seeds ----
{ const seeds = [201, 302, 403, 504, 605, 706, 807, 908];
  let hit = 0; const detail = [];
  for (const seed of seeds) {
    const s = G.Sim.create(seed);
    let crafted = 0;
    for (const a of s.agents) {
      if (G.Family && G.Family.isChild(a)) continue;
      G.Learn.add(a, "strike", 50);
      a.traits.curiosity = 90;
      const ax = Math.round(a.pos.x), ay = Math.round(a.pos.y);
      let shaft = s.items.find(i => !i.heldBy && (i.material === "stick" || i.material === "bone") && !i.tool);
      let point = s.items.find(i => !i.heldBy && (i.material === "ore" || i.material === "flint"));
      if (!shaft) { shaft = G.Items.create(s, "stick", ax, ay); s.items.push(shaft); }
      if (!point) { point = G.Items.create(s, seed % 2 ? "ore" : "flint", ax, ay); s.items.push(point); }
      shaft.x = ax; shaft.y = ay; point.x = ax; point.y = ay;
      shaft.heldBy = a.id; a.carry = shaft.id;
      a.lastTip = -1e9;
      // force tip attempt via startTip/stepTip (deterministic)
      if (G.Tools.startTip(s, a, shaft, point)) {
        a.act.t = a.act.n;
        G.Tools.stepTip(s, a);
      }
      if (G.Tools.isTip(shaft) || s.items.some(i => G.Tools.isTip(i))) crafted++;
    }
    if (crafted) hit++;
    detail.push(seed + ":" + crafted);
  }
  ok(hit >= 3, "≥1 tip craft on 3 of 8 seeds", hit + "/8 · " + detail.join(", "));
}

// ---- migrate 33→34 + round-trip ----
{ const s = G.Sim.create(1201);
  const a = s.agents[0];
  G.Learn.add(a, "strike", 50);
  const shaft = G.Items.create(s, "stick", Math.round(a.pos.x), Math.round(a.pos.y));
  const point = G.Items.create(s, "flint", Math.round(a.pos.x), Math.round(a.pos.y));
  s.items.push(shaft, point);
  G.Tools.finishTip(s, a, shaft, point, "migrate tip");
  const raw = G.Sim.serialize(s);
  // simulate a v33 save (no tip tools required — migrate just bumps)
  const v33 = JSON.parse(JSON.stringify(raw));
  v33.version = 33;
  // strip tip flags to mimic pre-v34
  for (const it of v33.items || []) if (it.tool === "tip_stick" || it.tool === "tip_bone") { it.tool = null; delete it.tippedWith; }
  const d = G.Sim.deserialize(v33);
  ok(d.version === 34, "migrate 33→34 bumps saveVersion", "v=" + d.version);
  // fresh v34 round-trip with a tip present
  const j = G.Sim.serialize(s);
  const r = G.Sim.deserialize(j);
  ok(r.version === 34 && (r.items || []).some(it => it.tool === "tip_stick" || it.tool === "tip_bone"),
    "tip round-trips in save v34",
    "tips=" + (r.items || []).filter(it => it.tool && String(it.tool).indexOf("tip") === 0).map(it => it.tool).join(","));
}

console.log(fails ? ("\n" + fails + " FAIL") : "\nALL PASS");
process.exit(fails ? 1 : 0);
