// Step 30 Disease powers (v27) proofs. Run: node tests/headless_powers30.js
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
const G = load(), C = G.data.config, P = G.Powers;
let fails = 0;
const ok = (c, msg, extra) => { console.log((c ? "PASS " : "FAIL ") + msg + (extra !== undefined ? "  " + extra : "")); if (!c) fails++; };

ok(C.saveVersion === 27 && !!G.Disease && !!G.Disease.clearPower && !!P.cure && !!P.plague,
  "saveVersion 27 + Disease.clearPower + Powers.cure/plague", C.saveVersion);
ok(C.powers.order.indexOf("cure") >= 0 && C.powers.order.indexOf("plague") >= 0
  && C.powers.labels.cure === "Cure" && C.powers.labels.plague === "Plague"
  && P.KINDS.indexOf("cure") >= 0 && P.KINDS.indexOf("plague") >= 0,
  "powers.order/labels/KINDS include cure+plague after spawn", C.powers.order.join(","));
ok(P.cooldownLeft({ powers: P.newState() }, "cure") === 0 && P.cooldownLeft({ powers: P.newState() }, "plague") === 0,
  "no cooldown on cure/plague");

{ const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const refs = [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+)"/g)].map(m => m[1]).filter(u => !/^(https?:|data:)/.test(u));
  const bad = refs.filter(u => { const m = u.match(/[?&]v=(\d+)/); return !m || +m[1] !== 27; });
  ok(!bad.length, "index.html ?v=27 everywhere", refs.length + " links, bad=" + bad.slice(0, 3));
  const icons = fs.readFileSync(path.join(root, "src/icons.js"), "utf8");
  ok(/"cure":/.test(icons) && /"plague":/.test(icons), "icons.js has cure + plague SVG keys");
}

// ---- Unit: Cure clears sick in circle; outside unchanged ----
{ const s = G.Sim.create(11);
  const a = s.agents[0], b = s.agents[1] || s.agents[0];
  const cx = Math.round(a.pos.x), cy = Math.round(a.pos.y);
  a.pos = { x: cx, y: cy };
  // place outsider beyond radiusTiles
  const R = C.powers.radiusTiles;
  let ox = cx + R + 3, oy = cy;
  if (!G.World.inb(s.world, ox, oy)) { ox = cx - R - 3; }
  if (b === a) {
    // only one agent — spawn a second by cloning position far
  } else {
    b.pos = { x: ox, y: oy };
  }
  const out = b !== a ? b : null;
  G.Disease.infect(s, a, "meat");
  if (out) G.Disease.infect(s, out, "meat");
  ok(G.Disease.isSick(a), "pre: insider sick");
  if (out) ok(G.Disease.isSick(out), "pre: outsider sick");
  const r = P.cast(s, "cure", cx, cy);
  ok(r.ok && r.cleared >= 1 && !G.Disease.isSick(a), "Cure clears ≥1 sick in circle", "cleared=" + r.cleared);
  if (out) ok(G.Disease.isSick(out), "Cure leaves outsider sick");
  ok(s.log.some(e => /sickness lifts/i.test(e.text)), "Cure place log", s.log.filter(e => /sickness|lifts/.test(e.text)).map(e => e.text).slice(-1)[0]);
  ok((s.powers.stats.casts.cure || 0) >= 1, "casts.cure incremented");
}

// ---- Unit: Plague seeds sick in circle; outside unchanged ----
{ const s = G.Sim.create(13);
  const a = s.agents[0], b = s.agents[1];
  const cx = Math.round(a.pos.x), cy = Math.round(a.pos.y);
  a.pos = { x: cx, y: cy };
  const R = C.powers.radiusTiles;
  let ox = cx + R + 3, oy = cy;
  if (!G.World.inb(s.world, ox, oy)) ox = Math.max(0, cx - R - 3);
  if (b) b.pos = { x: ox, y: oy };
  ok(!G.Disease.isSick(a) && (!b || !G.Disease.isSick(b)), "pre: nobody sick");
  const r = P.cast(s, "plague", cx, cy);
  ok(r.ok && r.seeded >= 1 && G.Disease.isSick(a), "Plague seeds ≥1 in circle", "seeded=" + r.seeded + " until+" + (a.sick.until - s.tick));
  if (b) ok(!G.Disease.isSick(b), "Plague leaves outsider well");
  ok(G.Disease.energyX(a) === (C.disease.energyDrainX || 1.5)
    && G.Disease.fullnessX(a) === (C.disease.fullnessDrainX || 1.25), "Plague uses v25 drain multipliers");
  ok(s.log.some(e => /Sickness settles|air turns foul/i.test(e.text)), "Plague action-only log");
  ok((s.powers.stats.casts.plague || 0) >= 1, "casts.plague incremented");
}

// ---- Unit: prayer reinforce via Powers.answer on cure ----
{ const s = G.Sim.create(17);
  const a = s.agents[0];
  const cx = Math.round(a.pos.x), cy = Math.round(a.pos.y);
  a.pos = { x: cx, y: cy };
  a.prayForms = { kneel: { n: 1, like: 50, gen: 0, last: s.tick - 30, hits: 0 } };
  G.Disease.infect(s, a, "meat");
  const like0 = a.prayForms.kneel.like;
  const r = P.cast(s, "cure", cx, cy);
  ok(r.ok && !G.Disease.isSick(a) && a.prayForms.kneel.like === like0 + C.faith.likeGain
    && a.prayForms.kneel.hits === 1 && s.powers.stats.answered >= 1,
    "Cure reinforces recent prayer in faithTiles", "like " + like0 + "→" + a.prayForms.kneel.like + " answered=" + s.powers.stats.answered);
}
{ const s = G.Sim.create(19);
  const a = s.agents[0];
  const cx = Math.round(a.pos.x), cy = Math.round(a.pos.y);
  a.pos = { x: cx, y: cy };
  a.prayForms = { kneel: { n: 1, like: 50, gen: 0, last: s.tick - 30, hits: 0 } };
  const like0 = a.prayForms.kneel.like;
  const r = P.cast(s, "plague", cx, cy);
  ok(r.ok && G.Disease.isSick(a) && a.prayForms.kneel.like === like0 + C.faith.likeGain,
    "Plague reinforces recent prayer", "like " + like0 + "→" + a.prayForms.kneel.like);
}

// ---- migrate 26 → 27 ----
{ const s = G.Sim.create(23);
  const raw = G.Sim.serialize(s);
  raw.version = 26;
  if (raw.powers && raw.powers.stats && raw.powers.stats.casts) {
    delete raw.powers.stats.casts.cure;
    delete raw.powers.stats.casts.plague;
  }
  const back = G.Sim.deserialize(raw);
  ok(back.version === 27 && back.powers.stats.casts.cure === 0 && back.powers.stats.casts.plague === 0,
    "migrate 26→27 fills cure/plague cast counters", back.version);
}

console.log(fails ? ("\n" + fails + " FAIL") : "\nALL PASS");
process.exit(fails ? 1 : 0);
