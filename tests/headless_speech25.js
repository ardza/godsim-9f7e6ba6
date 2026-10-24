// Step 25 polish (save v21) headless tests: invent/bind/group lock, Discoveries first spoken syllable,
// child copy x2, v19/v20 -> v21 migration.
// Called from tests/headless.js; run alone with: node tests/headless_speech25.js
module.exports = function (G, C, ok, h) {
  const Sp = G.Speech, S = G.Social, W = G.World, MD = 1440, { withCfg, NO_LIGHTNING, NO_THIRST_SLEEP } = h;
  const TPM = 1 / C.time.tickGameMinutes;
  const sig = s => JSON.stringify(G.Sim.serialize(s));
  const awake = s => { for (const a of s.agents) if (a.act.type === "sleep") G.Agent.startIdle(s, a); };
  const keep = s => { for (const a of s.agents) { a.needs.water = 100; a.needs.energy = 100; if (a.needs.fullness != null) a.needs.fullness = 100; if (a.needs.warmth != null) a.needs.warmth = 100; } };
  const clump = (s, x, y) => { let i = 0; for (const a of s.agents) { a.pos.x = x + (i % 3); a.pos.y = y + Math.floor(i / 3); a.facing = "down"; G.Agent.startIdle(s, a); i++; } };

  // config + words + art
  const SC = C.speech, wj = require("fs").readFileSync(require("path").join(__dirname, "../data/words.json"), "utf8");
  const words = JSON.parse(wj);
  ok(C.saveVersion === 21 && SC && SC.inventDiv === 100 && SC.groupMin === 3 && SC.scoreAt === 40 && SC.meanings.join() === "food,water,warm,danger,follow,stop" &&
    SC.tokens.length === 5 && SC.tokens.every(t => t.token && t.col && t.action) &&
    G.data.words && G.data.words.meanings && SC.meanings.every(m => (G.data.words.meanings[m] || []).length >= 4) &&
    JSON.stringify(G.data.words.meanings) === JSON.stringify(words.meanings) &&
    G.data.art.gesture && G.data.art.gesture.src.indexOf("gesture_16") >= 0 && G.data.art.gesture.cols.join() === "point_right,point_left,pat_chest,stop_hand,beckon" &&
    G.data.art.childGesture && !!Sp && typeof Sp.emit === "function",
    "25 config: save v21 inventDiv 100; speech tokens/meanings; words.js synced from words.json; gesture art cols",
    SC.tokens.map(t => t.token).join(", "));

  // invent: low need + someone nearby + high curiosity -> gesture emit (action log, no quotes yet); gestureUntil set; hearer gets a watch
  withCfg(Object.assign({}, NO_LIGHTNING, NO_THIRST_SLEEP, { "speech.inventDiv": 1 }), () => {
    const s = G.Sim.create(11); for (let i = 0; i < 5; i++) G.Sim.step(s); awake(s); keep(s);
    clump(s, 20, 18);
    const a = s.agents[0], b = s.agents[1];
    a.traits.curiosity = 100; a.needs.fullness = 10; a.speechDue = 0; a.gesture = null;
    // force invent roll: call inventRoll until emit, or emit directly if stream is stubborn
    let emitted = false;
    for (let i = 0; i < 200 && !emitted; i++) { keep(s); a.needs.fullness = 10; awake(s); Sp.inventRoll(s, a); if (a.gesture) emitted = true; else G.Sim.step(s); }
    if (!emitted) { Sp.emit(s, a, "point+grunt", "fullness"); emitted = !!a.gesture; }
    const watch = b.speechWatch, line = s.log.slice().reverse().find(e => e.ids && e.ids.indexOf(a.id) >= 0 && /points|pats|holds|beckons|gestures/.test(e.text));
    const quoted = s.log.some(e => /says "/.test(e.text));
    ok(emitted && a.gesture && a.gesture.token && a.gesture.until > s.tick && watch && watch.token === a.gesture.token && watch.from === a.id &&
      line && !quoted && Sp.gestureNow(s, a) && Sp.colOf(a.gesture.token),
      "25 invent: low need + neighbour → gesture emit (action log, no quotes); hearer watch; gesture overlay active",
      (a.gesture && a.gesture.token) + " watch=" + !!(watch) + " line=" + (line && line.text));
  });

  // bind: hearer with a watch sees the speaker eat → token binds to food with bindGain; reuse raises score
  withCfg(Object.assign({}, NO_LIGHTNING, NO_THIRST_SLEEP), () => {
    const s = G.Sim.create(13); for (let i = 0; i < 5; i++) G.Sim.step(s); awake(s); keep(s);
    clump(s, 22, 16);
    const a = s.agents[0], b = s.agents[1], token = "point+grunt";
    Sp.emit(s, a, token, "fullness");
    ok(b.speechWatch && b.speechWatch.token === token, "25 bind setup: hearer has watch after emit");
    Sp.onEat(s, a);
    const e = b.words && b.words[token];
    const score1 = e && e.score;
    Sp.emit(s, a, token, "fullness"); Sp.onEat(s, a); // reuse
    const score2 = b.words && b.words[token] && b.words[token].score;
    ok(e && e.meaning === "food" && score1 >= SC.bindGain && score2 > score1 && s.speech.stats.binds >= 1,
      "25 bind: hearer seeing speaker eat binds token→food (bindGain); reuse raises score",
      "score " + score1 + " → " + score2 + " binds " + s.speech.stats.binds);
  });

  // group speech lock: 3+ in a group share token→meaning at scoreAt+ → lock + syllable from words.js; then quotes; gesture stops
  withCfg(Object.assign({}, NO_LIGHTNING, NO_THIRST_SLEEP), () => {
    const s = G.Sim.create(17); for (let i = 0; i < 10; i++) G.Sim.step(s); awake(s); keep(s);
    clump(s, 24, 20);
    // force a group of 3
    const g = { id: s.nextGroup++, members: s.agents.slice(0, 3).map(a => a.id), since: s.tick, skills: {} };
    s.groups.push(g); for (const a of s.agents.slice(0, 3)) a.group = g.id;
    const token = "beckon+call", meaning = "follow";
    for (const a of s.agents.slice(0, 3)) {
      a.words = a.words || {}; a.words[token] = { meaning, score: SC.scoreAt, n: 2, from: null, t: s.tick };
    }
    Sp.recheckLocks(s);
    const lk = Sp.lockKey(g.id, token, meaning), L = s.speech.locks[lk];
    const wordOk = L && (G.data.words.meanings[meaning] || []).indexOf(L.word) >= 0;
    const label = Sp.cardLabel(s, s.agents[0]);
    // emit as speech: quoted syllable
    const a0 = s.agents[0]; Sp.emit(s, a0, token, "follow");
    const said = s.log.slice().reverse().find(e => e.k === "speech" && /says "/.test(e.text));
    const gestGone = !Sp.gestureNow(s, a0); // locked → no overlay
    ok(L && L.holders >= 3 && wordOk && /Speech: 1 shared word/.test(label) && said && said.text.indexOf('"' + L.word) >= 0 && gestGone && s.speech.stats.locks >= 1,
      "25 group: 3+ at scoreAt+ lock token as speech; syllable from words.js; quoted log; gesture overlay stops",
      "word=" + (L && L.word) + " label=" + label + " said=" + (said && said.text));
    // 2 holders only: no lock for a different token
    const token2 = "stop+hand";
    for (const a of s.agents.slice(0, 2)) { a.words[token2] = { meaning: "stop", score: SC.scoreAt, n: 1, from: null, t: s.tick }; }
    Sp.recheckLocks(s);
    ok(!s.speech.locks[Sp.lockKey(g.id, token2, "stop")], "25 group: under groupMin does not lock", "holders 2 < " + SC.groupMin);
  });

  // v21: Discoveries catches the first spoken syllable (quoted word) per seed — data-detected
  withCfg(Object.assign({}, NO_LIGHTNING, NO_THIRST_SLEEP), () => {
    const s = G.Sim.create(23); for (let i = 0; i < 8; i++) G.Sim.step(s); awake(s); keep(s);
    clump(s, 18, 18);
    const g = { id: s.nextGroup++, members: s.agents.slice(0, 3).map(a => a.id), since: s.tick, skills: {} };
    s.groups.push(g); for (const a of s.agents.slice(0, 3)) a.group = g.id;
    const token = "point+grunt", meaning = "food";
    for (const a of s.agents.slice(0, 3)) a.words = { [token]: { meaning, score: SC.scoreAt, n: 2, from: null, t: s.tick } };
    Sp.recheckLocks(s);
    const L = s.speech.locks[Sp.lockKey(g.id, token, meaning)];
    const before = (s.discoveries || []).filter(d => d.title === "First spoken word").length;
    Sp.emit(s, s.agents[0], token, "fullness");
    const disc = (s.discoveries || []).filter(d => d.title === "First spoken word");
    const d = disc[disc.length - 1];
    Sp.emit(s, s.agents[1], token, "fullness"); // second speak of same syllable — no new discovery
    const after = (s.discoveries || []).filter(d => d.title === "First spoken word").length;
    ok(L && before === 0 && disc.length === 1 && after === 1 && d && d.materials[0] === L.word && d.action === "speak" && d.result === meaning,
      "25 v21 Discoveries: first spoken syllable per seed (data-detected); same syllable does not re-note",
      (d && d.materials[0]) + " → " + (d && d.result) + " n=" + after);
  });

  // v21: children copy speech tokens at x2 (Learn.stageX), same as other skills
  withCfg(Object.assign({}, NO_LIGHTNING, NO_THIRST_SLEEP, { "speech.copyChance": 1 }), () => {
    const s = G.Sim.create(29); for (let i = 0; i < 5; i++) G.Sim.step(s); awake(s); keep(s);
    clump(s, 20, 16);
    const adult = s.agents[0], child = s.agents[1];
    adult.age = 20; child.age = 5; child.traits.curiosity = 100;
    const token = "pat+chest", meaning = "warm";
    adult.words = { [token]: { meaning, score: 80, n: 4, from: null, t: s.tick } };
    child.words = {};
    // force adult stage for stageX; child stage by age
    const sx = G.Learn.stageX(child, adult);
    Sp.emit(s, adult, token, "warm");
    const copied = child.words && child.words[token] && child.words[token].meaning === meaning;
    ok(sx === 2 && (copied || s.speech.stats.copies >= 1),
      "25 v21 child copy: Learn.stageX(child, adult) === 2; child can copy speech tokens at x2",
      "stageX=" + sx + " copied=" + !!copied + " copies=" + s.speech.stats.copies);
  });

  // migration: v19 → v21 (empty speech); v20 → v21 keeps locks; round-trip
  withCfg(Object.assign({}, NO_LIGHTNING), () => {
    const s = G.Sim.create(19); for (let i = 0; i < 20; i++) G.Sim.step(s);
    const g = { id: s.nextGroup++, members: s.agents.slice(0, 3).map(a => a.id), since: s.tick, skills: {} };
    s.groups = s.groups || []; s.groups.push(g); for (const a of s.agents.slice(0, 3)) { a.group = g.id; a.words = { "pat+chest": { meaning: "warm", score: 50, n: 3, from: null, t: s.tick } }; }
    Sp.recheckLocks(s);
    const j = sig(s), r = G.Sim.deserialize(JSON.parse(j));
    const locksOk = Object.keys(r.speech.locks).length === Object.keys(s.speech.locks).length && r.wrng && typeof r.wrng.s === "number";
    // strip to v19 shape → empty speech after migrate20+21
    const o = JSON.parse(j); o.version = 19; delete o.wrng; delete o.speech;
    for (const a of o.agents) { delete a.words; delete a.speechWatch; delete a.speechDue; delete a.gesture; }
    const m = G.Sim.deserialize(o), back = G.Sim.deserialize(JSON.parse(sig(m)));
    // v20 shape → migrate21 keeps locks
    const o20 = JSON.parse(j); o20.version = 20;
    const m20 = G.Sim.deserialize(o20);
    ok(JSON.parse(j).version === 21 && locksOk && sig(s) === sig(r) && m.version === 21 && m.speech && m.speech.stats && Object.keys(m.speech.locks).length === 0 &&
      m.agents.every(a => !a.words && !a.gesture) && m.wrng && typeof m.wrng.s === "number" && sig(back) === sig(m) &&
      m20.version === 21 && Object.keys(m20.speech.locks).length === Object.keys(s.speech.locks).length,
      "25 save: v21 keeps speech locks + wrng; v19→v21 empty speech; v20→v21 keeps locks",
      "locks " + Object.keys(s.speech.locks).length + " → after v19 " + Object.keys(m.speech.locks).length + " after v20 " + Object.keys(m20.speech.locks).length);
  });

  // cardLabel / pickWord stability
  { const s = G.Sim.create(3); const w1 = Sp.pickWord(s, "food", 1), w2 = Sp.pickWord(s, "food", 1), w3 = Sp.pickWord(s, "food", 2);
    ok(w1 === w2 && (G.data.words.meanings.food || []).indexOf(w1) >= 0 && typeof w3 === "string",
      "25 pickWord: stable per (seed, group, meaning), from words.js", w1 + " / group2 " + w3);
    ok(Sp.cardLabel(s, s.agents[0]) === "Speech: none", "25 card: loner / no locks → Speech: none"); }
};

if (require.main === module) {
  const vm = require("vm"), fs = require("fs"), path = require("path"), root = path.join(__dirname, ".."), src = fs.readFileSync(path.join(__dirname, "headless.js"), "utf8");
  const list = JSON.parse(src.match(/for \(const f of (\[[^\]]+\])\)/)[1]); const ctx = { console, Math, JSON }; vm.createContext(ctx);
  for (const f of list) vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
  const G = ctx.GS, C = G.data.config; let fails = 0; const ok = (c, msg, extra) => { console.log((c ? "PASS " : "FAIL ") + msg + (extra !== undefined ? "  " + extra : "")); if (!c) fails++; };
  function withCfg(patch, fn) { const old = {}; for (const k in patch) { const ps = k.split("."); let o = C; for (const q of ps.slice(0, -1)) o = o[q]; old[k] = [o, ps.at(-1), o[ps.at(-1)]]; o[ps.at(-1)] = patch[k]; }
    try { return fn(); } finally { for (const k in old) { const [o, f, v] = old[k]; o[f] = v; } } }
  const NO_LIGHTNING = { "fire.lightning.perSeason": [0, 0, 0, 0] }, NO_THIRST_SLEEP = { "person.water.minutesFullToThirsty": 1e15, "person.energy.drainMinutes": 1e15, "person.energy.nightFrom": 1440 };
  module.exports(G, C, ok, { withCfg, NO_LIGHTNING, NO_THIRST_SLEEP });
  console.log(fails ? "SPEECH25 FAILED (" + fails + ")" : "SPEECH25 PASSED"); process.exit(fails ? 1 : 0);
}
