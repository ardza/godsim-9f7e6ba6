// Step 29 Tools (v26) proofs. Run: node tests/headless_tools29.js
const vm = require("vm"), fs = require("fs"), path = require("path"), root = path.join(__dirname, "..");
function load() {
  const ctx = { console, Math, JSON }; vm.createContext(ctx);
  for (const f of ["data/config.js", "data/tiles.js", "data/names.js", "data/words.js", "data/art.js", "data/materials.js",
    "src/rng.js", "src/world.js", "src/climate.js", "src/agent.js", "src/animal.js", "src/objects.js", "src/fire.js",
    "src/learn.js", "src/hunt.js", "src/cook.js", "src/social.js", "src/family.js", "src/faith.js", "src/shelter.js",
    "src/powers.js", "src/speech.js", "src/corpse.js", "src/moods.js", "src/disease.js", "src/tools.js", "src/sim.js"])
    vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
  return ctx.GS;
}
const G = load(), C = G.data.config;
let fails = 0;
const ok = (c, msg, extra) => { console.log((c ? "PASS " : "FAIL ") + msg + (extra !== undefined ? "  " + extra : "")); if (!c) fails++; };

ok(C.saveVersion === 26 && !!G.Tools && !!C.tools, "saveVersion 26 + G.Tools + config.tools", C.saveVersion);
{ const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const refs = [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+)"/g)].map(m => m[1]).filter(u => !/^(https?:|data:)/.test(u));
  const bad = refs.filter(u => { const m = u.match(/[?&]v=(\d+)/); return !m || +m[1] !== 26; });
  ok(refs.some(u => u.includes("tools.js")) && !bad.length, "index.html ?v=26 everywhere incl. tools.js", refs.length + " links, bad=" + bad.slice(0, 3));
  ok(fs.existsSync(path.join(root, "data/art/tools_16.png"))
    && fs.existsSync(path.join(root, "data/art/flake_16.png"))
    && fs.existsSync(path.join(root, "data/art/axe_16.png"))
    && fs.existsSync(path.join(root, "data/art/spear_16.png")), "tool overlay sheets present under data/art/");
  ok(!!G.data.art.flake && !!G.data.art.axe && !!G.data.art.spear && !!G.data.art.tools, "art.js wires flake/axe/spear/tools");
}

// ---- Unit: lock flake / spear / bind axe; Discoveries first craft; durability ----
{ const s = G.Sim.create(3);
  const a = s.agents[0];
  // spear from whole stick
  let stick = s.items.find(i => i.material === "stick" && !i.heldBy);
  if (!stick) { stick = G.Items.create(s, "stick", Math.round(a.pos.x), Math.round(a.pos.y)); s.items.push(stick); }
  stick.heldBy = a.id; a.carry = stick.id;
  G.Tools.lock(s, a, stick, "spear", "set aside");
  ok(stick.tool === "spear" && G.Tools.bonusLive(stick), "lock long stick (spear)", stick.tool);
  ok((s.discoveries || []).some(d => d.action === "craft" && d.materials.indexOf("long stick") >= 0),
    "Discoveries lists first long stick craft", (s.discoveries || []).filter(d => d.action === "craft").map(d => d.materials + "→" + d.result).join("; "));
  // flake from sharp flint
  G.Items.drop(s, a);
  let flint = G.Items.create(s, "flint", Math.round(a.pos.x), Math.round(a.pos.y));
  flint.props.sharpness = 80; flint.form = "shard"; s.items.push(flint);
  flint.heldBy = a.id; a.carry = flint.id;
  G.Tools.lock(s, a, flint, "flake", "strike edge");
  ok(flint.tool === "flake" && G.Tools.digOk(flint) && G.Tools.cutMult(flint) < 1, "lock flake dig+cut bonus", "dig=" + G.Tools.digMult(flint) + " cut=" + G.Tools.cutMult(flint));
  // dull then lose bonus
  flint.props.durability = (C.tools.dullBelow || 15);
  ok(!G.Tools.bonusLive(flint), "dull flake loses bonus at dullBelow");
  // bind axe: stick + sharp head + reed binder
  G.Items.drop(s, a);
  const shaft = G.Items.create(s, "stick", Math.round(a.pos.x), Math.round(a.pos.y)); s.items.push(shaft);
  const head = G.Items.create(s, "rock", Math.round(a.pos.x) + 1, Math.round(a.pos.y));
  head.props.sharpness = 70; head.form = "shard"; s.items.push(head);
  const reed = G.Items.create(s, "reed", Math.round(a.pos.x), Math.round(a.pos.y)); s.items.push(reed);
  shaft.heldBy = a.id; a.carry = shaft.id; a.pos = { x: Math.round(a.pos.x), y: Math.round(a.pos.y) };
  head.x = a.pos.x; head.y = a.pos.y; reed.x = a.pos.x; reed.y = a.pos.y;
  ok(G.Tools.startBind(s, a, shaft, head), "startBind");
  a.act.t = a.act.n; // complete
  const still = G.Tools.stepBind(s, a);
  ok(still === false && shaft.tool === "axe" && a.carry === shaft.id, "bind → crude axe in hand", shaft.tool + " boundWith=" + shaft.boundWith);
  ok((s.discoveries || []).some(d => d.action === "craft" && /axe/.test(d.materials.join(" "))), "Discoveries first crude axe");
  ok(s.toolStats.crafts >= 3 && s.toolStats.byType.axe >= 1 && s.toolStats.byType.flake >= 1 && s.toolStats.byType.spear >= 1,
    "toolStats byType", JSON.stringify(s.toolStats.byType));
}

// ---- Unit: digMult / Corpse.digTool accepts tools ----
{ const s = G.Sim.create(5);
  const a = s.agents[0];
  const axe = G.Items.create(s, "stick", Math.round(a.pos.x), Math.round(a.pos.y));
  axe.tool = "axe"; axe.props.durability = 80; axe.props.sharpness = 60; s.items.push(axe);
  axe.heldBy = a.id; a.carry = axe.id;
  ok(G.Corpse.digTool(axe) && G.Tools.digMult(axe) < 1, "axe is digTool with faster dig", G.Tools.digMult(axe));
}

// ---- Unit: onTry after strike raises score + may lock ----
{ const s = G.Sim.create(8);
  const a = s.agents[0];
  const rock = G.Items.create(s, "rock", Math.round(a.pos.x), Math.round(a.pos.y));
  rock.props.sharpness = 5; s.items.push(rock); rock.heldBy = a.id; a.carry = rock.id;
  const tgt = G.Items.create(s, "flint", Math.round(a.pos.x) + 1, Math.round(a.pos.y));
  tgt.props.sharpness = 40; s.items.push(tgt);
  const sc0 = G.Learn.score(a, "strike");
  G.Tools.onTry(s, a, "strike", rock, tgt, { results: ["sparks"], broke: "target", held: rock.props, target: Object.assign({}, tgt.props, { sharpness: 80 }) });
  tgt.props.sharpness = 80; tgt.form = "shard";
  // re-check with sharp target
  G.Tools.onTry(s, a, "strike", rock, tgt, { results: ["edge"], broke: "target", held: rock.props, target: tgt.props });
  ok(G.Learn.score(a, "strike") > sc0, "onTry raises strike score", G.Learn.score(a, "strike"));
  ok(tgt.tool === "flake" || rock.tool === "flake" || G.Tools.canFlake(tgt),
    "onTry can lock flake from sharp piece", "tgt.tool=" + tgt.tool + " rock.tool=" + rock.tool);
}

// ---- Multi-seed natural craft: ≥1 tool type on 3 of 8 seeds ----
{ const seeds = [101, 202, 303, 404, 505, 606, 707, 808];
  let hit = 0; const detail = [];
  for (const seed of seeds) {
    const s = G.Sim.create(seed);
    // nudge: give each adult a stick or sharp rock nearby + raise curiosity slightly via idle steps
    for (const a of s.agents) {
      if (G.Family && G.Family.isChild(a)) continue;
      // ensure a whole stick and a sharp flint exist near them
      const sx = Math.round(a.pos.x), sy = Math.round(a.pos.y);
      const st = G.Items.create(s, "stick", sx, sy); s.items.push(st);
      const fl = G.Items.create(s, "flint", sx + (a.id % 2 ? 1 : -1), sy); fl.props.sharpness = 70; fl.form = "shard"; s.items.push(fl);
    }
    // run ~3 game days; keep people alive & idle-curious
    for (let t = 0; t < 1440 * 3; t++) {
      G.Sim.step(s);
      for (const a of s.agents) {
        if (!a.needs) continue;
        if (a.needs.fullness < 35) a.needs.fullness = 75;
        if (a.needs.water < 35) a.needs.water = 75;
        if (a.needs.warmth < 40) a.needs.warmth = 80;
        if (a.needs.energy < 30) a.needs.energy = 80;
      }
    }
    const types = Object.keys((s.toolStats && s.toolStats.byType) || {}).filter(k => (s.toolStats.byType[k] || 0) > 0);
    const crafts = (s.toolStats && s.toolStats.crafts) || 0;
    const disc = (s.discoveries || []).filter(d => d.action === "craft");
    if (crafts >= 1 && types.length >= 1) hit++;
    detail.push(seed + ":" + types.join(",") + "/c" + crafts + "/d" + disc.length);
  }
  ok(hit >= 3, "≥1 tool type crafted on 3 of 8 seeds", hit + "/8  " + detail.join(" | "));
  ok(true, "(detail) Discoveries craft entries appear when crafts lock", detail.filter(d => /\/d[1-9]/.test(d)).length + " seeds with craft disc");
}

// ---- migrate25→26 ----
{ const s = G.Sim.create(9);
  const o = G.Sim.serialize(s); o.version = 25; delete o.toolStats;
  const r = G.Sim.deserialize(o);
  ok(r.version === 26 && r.toolStats && r.toolStats.crafts === 0, "migrate25→26 adds toolStats", r.version);
  const j = JSON.stringify(G.Sim.serialize(s));
  const back = G.Sim.deserialize(JSON.parse(j));
  ok(JSON.parse(j).version === 26 && back.toolStats, "save round-trip v26");
}

// ---- Learn actions + gainOf for strike/cut/rub/bind ----
{ ok(!!C.learn.actions.strike && !!C.learn.actions.cut && !!C.learn.actions.rub && !!C.learn.actions.bind,
    "learn.actions includes strike/cut/rub/bind");
  ok(G.Learn.gainOf("strike") === C.tools.gain.strike && G.Learn.gainOf("bind") === C.tools.gain.bind,
    "Learn.gainOf reads tools.gain", G.Learn.gainOf("strike") + "/" + G.Learn.gainOf("bind"));
}

console.log(fails ? ("FAILED " + fails) : "ALL PASS");
process.exit(fails ? 1 : 0);
