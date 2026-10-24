// Step 28 Disease (v25) proofs. Run: node tests/headless_disease28.js
const vm = require("vm"), fs = require("fs"), path = require("path"), root = path.join(__dirname, "..");
function load() {
  const ctx = { console, Math, JSON }; vm.createContext(ctx);
  for (const f of ["data/config.js", "data/tiles.js", "data/names.js", "data/words.js", "data/art.js", "data/materials.js",
    "src/rng.js", "src/world.js", "src/climate.js", "src/agent.js", "src/animal.js", "src/objects.js", "src/fire.js",
    "src/learn.js", "src/hunt.js", "src/cook.js", "src/social.js", "src/family.js", "src/faith.js", "src/shelter.js",
    "src/powers.js", "src/speech.js", "src/corpse.js", "src/moods.js", "src/disease.js", "src/sim.js"])
    vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
  return ctx.GS;
}
const G = load(), C = G.data.config;
let fails = 0;
const ok = (c, msg, extra) => { console.log((c ? "PASS " : "FAIL ") + msg + (extra !== undefined ? "  " + extra : "")); if (!c) fails++; };

ok(C.saveVersion === 25 && !!G.Disease && !!C.disease, "saveVersion 25 + G.Disease + config.disease", C.saveVersion);
{ const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const refs = [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+)"/g)].map(m => m[1]).filter(u => !/^(https?:|data:)/.test(u));
  const bad = refs.filter(u => { const m = u.match(/[?&]v=(\d+)/); return !m || +m[1] !== 25; });
  ok(refs.some(u => u.includes("disease.js")) && !bad.length, "index.html ?v=25 everywhere incl. disease.js", refs.length + " links, bad=" + bad.slice(0, 3)); }

// ---- Unit: infect → lasting sick, drain multipliers ----
{ const s = G.Sim.create(7);
  const a = s.agents[0];
  const e0 = G.Agent.energyDrainPerTick(a), f0 = G.Agent.fullnessDrainPerTick(a);
  G.Disease.infect(s, a, "meat");
  ok(G.Disease.isSick(a) && a.sick.until > s.tick, "infect sets lasting sick", "until +" + (a.sick.until - s.tick) + "m");
  ok(Math.abs(G.Agent.energyDrainPerTick(a) / e0 - 1.5) < 1e-9, "Energy drain ×1.5 while sick", G.Agent.energyDrainPerTick(a) / e0);
  ok(Math.abs(G.Agent.fullnessDrainPerTick(a) / f0 - 1.25) < 1e-9, "Fullness drain ×1.25 while sick", G.Agent.fullnessDrainPerTick(a) / f0);
  const days = (a.sick.until - s.tick) / 1440;
  ok(days >= 1 - 1e-9 && days <= 3 + 1e-9, "duration 1–3 days", days.toFixed(2));
  const logHit = s.log.some(e => /retches|doubles over/.test(e.text) && !/feels sick|I feel/.test(e.text));
  ok(logHit, "action-only infect log (no feels-sick speech)", s.log.filter(e => /retch|double/.test(e.text)).map(e => e.text)[0]);
  ok(G.Agent.doing(a).indexOf("sick") >= 0, "doing shows sick", G.Agent.doing(a));
}

// ---- Unit: recover via sleep / drink / cooked / berries / fire → Discoveries ----
{ const s = G.Sim.create(11);
  const a = s.agents[0];
  G.Disease.infect(s, a, "meat");
  a.sick.recover = 90; // near threshold
  G.Disease.onDrink(s, a);
  ok(!G.Disease.isSick(a), "drink can finish recovery", a.sick);
  const disc = (s.discoveries || []).some(d => d.action === "recover" || (d.title && /recovery/i.test(d.title)));
  ok(disc, "first recovery → Discoveries", (s.discoveries || []).filter(d => /recover/i.test(d.action + (d.title || ""))).map(d => d.title || d.action)[0]);
}
{ const s = G.Sim.create(12);
  const a = s.agents[0];
  G.Disease.infect(s, a, "meat");
  a.act = { type: "sleep", since: s.tick, until: s.tick + 500 };
  const r0 = a.sick.recover;
  for (let i = 0; i < 120; i++) G.Disease.step(s); // 2h sleep recover
  ok(G.Disease.isSick(a) ? a.sick.recover > r0 : true, "sleep while sick raises recover", G.Disease.isSick(a) ? (r0 + "→" + a.sick.recover) : "cleared");
}

// ---- Unit: danger speech when danger locked + Energy < 30 ----
{ const s = G.Sim.create(13);
  const a = s.agents[0];
  const prev = C.disease.dangerChancePerHour;
  C.disease.dangerChancePerHour = 60; // → 100% per tick (chance × tickMinutes/60)
  for (const p of s.agents) p.group = 0;
  s.groups = [{ id: 0, members: s.agents.map(p => p.id) }];
  const tok = "point+grunt";
  s.speech.locks["0|" + tok + "|danger"] = { group: 0, token: tok, meaning: "danger", word: "rak", holders: 3, since: 0 };
  a.words = a.words || {}; a.words[tok] = { meaning: "danger", score: 50, n: 1, from: null, t: 0 };
  G.Disease.infect(s, a, "meat");
  a.needs.energy = 20; a.act = { type: "idle", until: s.tick + 10 }; a.gesture = null;
  G.Disease.step(s);
  const hit = s.log.some(e => e.text && (e.text.indexOf("rak") >= 0 || e.text.indexOf("points and grunts") >= 0));
  C.disease.dangerChancePerHour = prev;
  ok(hit, "sick + Energy<30 may emit locked danger word", s.log.filter(e => e.text && (e.text.indexOf("rak") >= 0 || /points and grunts/.test(e.text))).map(e => e.text).slice(-1)[0]);
}

// ---- Proof: ≥1 outbreak + ≥1 recovery on 4 seeds ----
{ let outbreaks = 0, recoveries = 0;
  for (const seed of [101, 202, 303, 404]) {
    const s = G.Sim.create(seed);
    // cluster people, infect one, force spread-friendly curiosity
    const patient = s.agents[0];
    for (const a of s.agents) {
      a.pos = { x: patient.pos.x + (a === patient ? 0 : 1), y: patient.pos.y };
      a.traits.curiosity = 10; // high catch chance (100-10)/800
      a.needs.energy = 70; a.needs.fullness = 70; a.needs.water = 70; a.needs.warmth = 70;
      a.act = { type: "idle", until: 0 };
    }
    G.Disease.infect(s, patient, "meat");
    // accelerate recover on others after spread via drink spam
    for (let t = 0; t < 1440 * 4; t++) { // 4 days
      G.Sim.step(s);
      // keep people clustered & alive
      for (const a of s.agents) {
        if (!a.needs) continue;
        a.pos = { x: patient.pos.x + (a.id % 3), y: patient.pos.y + ((a.id >> 2) % 2) };
        if (a.needs.fullness < 40) a.needs.fullness = 70;
        if (a.needs.water < 40) a.needs.water = 70;
        if (a.needs.warmth < 40) a.needs.warmth = 70;
        // nudge recovery actions on sick
        if (G.Disease.isSick(a) && t % 60 === 0) {
          if (t % 180 === 0) G.Disease.onDrink(s, a);
          else if (t % 180 === 60) G.Disease.onEatBerries(s, a);
          else G.Disease.onEatCooked(s, a);
        }
      }
    }
    const st = s.diseaseStats || {};
    if ((st.spreads || 0) >= 1 || s.agents.filter(G.Disease.isSick).length + (st.recovered || 0) > 1) outbreaks++;
    if ((st.recovered || 0) >= 1 || (s.discoveries || []).some(d => d.action === "recover")) recoveries++;
  }
  ok(outbreaks >= 1, "≥1 outbreak on 4 seeds", outbreaks + "/4");
  ok(recoveries >= 1, "≥1 recovery on 4 seeds", recoveries + "/4");
}

// ---- Proof: sickness deaths rare (<2 on 16 seeds) ----
{ let deaths = 0;
  for (let seed = 500; seed < 516; seed++) {
    const s = G.Sim.create(seed);
    // one patient under the dual-need gate; others healthy — deaths must stay rare
    const a = s.agents[0];
    G.Disease.infect(s, a, "meat");
    a.needs.fullness = 15; a.needs.water = 15; a.needs.energy = 50; a.needs.warmth = 70;
    a.act = { type: "idle", until: 0 };
    for (let t = 0; t < 1440 * 3; t++) {
      G.Sim.step(s);
      if (!a.needs) break;
      if (G.Disease.isSick(a)) { a.needs.fullness = Math.min(a.needs.fullness, 18); a.needs.water = Math.min(a.needs.water, 18); }
      a.needs.warmth = 70;
      if (a.needs.fullness <= 0) a.needs.fullness = 10;
      if (a.needs.water <= 0) a.needs.water = 10;
    }
    deaths += (s.diseaseStats && s.diseaseStats.deaths) || 0;
  }
  ok(deaths < 2, "sickness deaths rare (<2 on 16 seeds)", deaths + " deaths");
}

// ---- migrate24→25 ----
{ const s = G.Sim.create(9);
  const o = G.Sim.serialize(s); o.version = 24; delete o.drng; delete o.diseaseStats;
  const r = G.Sim.deserialize(o);
  ok(r.version === 25 && r.drng && r.diseaseStats && r.agents.every(a => a.sick == null || a.sick === null || typeof a.sick === "object"),
    "migrate24→25 adds drng + diseaseStats", r.version);
  const j = JSON.stringify(G.Sim.serialize(s));
  const back = G.Sim.deserialize(JSON.parse(j));
  ok(JSON.parse(j).version === 25 && back.diseaseStats && back.drng, "save round-trip v25");
}


// ---- UI: Log tab in personTabs; no under-card plog strip in index ----
{ const tabs = C.ui.personTabs || [];
  ok(tabs.some(x => x.key === "log" && x.label === "Log") && tabs.map(x => x.key).join(",") === "needs,mind,kin,knows,log",
    "personTabs = Needs/Mind/Kin/Knows/Log", tabs.map(x => x.label).join(" / "));
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const uiSrc = fs.readFileSync(path.join(root, "src/ui.js"), "utf8");
  ok(!/id="plog-sec"/.test(html) && !/id="plog"[^a-z]/.test(html), "index.html has no under-card #plog strip");
  ok(/plogHtml/.test(uiSrc) && /personTab === "log"/.test(uiSrc) && !/function plogRender/.test(uiSrc),
    "ui.js: Log pane via plogHtml, no plogRender strip");
  ok(/#info \.pcard-tab \{[^}]*font-size: 16px/.test(html), "pcard-tab labels ≥16px");
  ok(/#info \.pcard-tab \{[^}]*min-height: 44px/.test(html) && /min-width: 44px/.test(html), "pcard-tab taps ≥44px");
  ok(/esc\(a\.name\).*s log|name\) \+ "'s log"/.test(uiSrc) || /'s log/.test(uiSrc), "Log pane title is Name's log (mock)");
}

console.log(fails ? ("FAILED " + fails) : "ALL PASS");
process.exit(fails ? 1 : 0);
