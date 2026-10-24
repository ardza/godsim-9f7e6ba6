// Step 25: local language (Director calls). Speech emerges from shared gestures and copied sounds.
//   Invent: when a need is under speech.needBelow and someone is within nearTiles, chance = curiosity/inventDiv per hour
//     of emitting a gesture+sound token (e.g. "point+grunt"). First emit per seed is a Discoveries entry.
//   Meaning: a hearer within hearTiles stores a watch; if they see a matching outcome within meanMinutes, the token
//     binds to that meaning (food/water/warm/danger/follow/stop) on them with a score. Reuse raises the score.
//   Group speech: when 3+ people in a group share the same token→meaning at score >= scoreAt, that token is group
//     speech. One syllable is picked from data/words.js for that meaning (seeded). Copying odds x copyX inside the
//     group for speech tokens. Outsiders hear noise only (action log, no quotes).
//   Log: if the speaker's group has the token as speech, a short quoted syllable; else action-only. Never freeform.
//   Gesture art: transparent overlays on the down-facing frame while the token is not yet group speech for her group.
//   Rolls use their own seeded stream sim.wrng.
(function (G) {
  const Speech = {};
  const SC = () => G.data.config.speech, TM = () => G.data.config.time.tickGameMinutes;
  const r2 = v => Math.round(v * 100) / 100, clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  Speech.newState = () => ({ locks: {}, stats: { invents: 0, emits: 0, binds: 0, locks: 0, copies: 0, spoken: 0, heard: 0 } });
  Speech.init = function (sim) {
    sim.wrng = new G.RNG((sim.seed ^ 0x5FEE7C11) >>> 0);
    sim.speech = Speech.newState();
  };

  // ---- per-person lexicon: a.words[token] = { meaning, score, n, from, t } ----
  const rec = (a, token) => { const W = a.words || (a.words = {}); return W[token] || (W[token] = { meaning: null, score: SC().start, n: 0, from: null, t: null }); };
  Speech.score = (a, token) => { const e = a.words && a.words[token]; return e && e.meaning ? e.score : 0; };
  Speech.meaningOf = (a, token) => { const e = a.words && a.words[token]; return e && e.meaning || null; };

  // token → art column (Artist gesture_16 cols)
  Speech.colOf = function (token) {
    const T = SC().tokens; for (const t of T) if (t.token === token) return t.col;
    if (token.indexOf("point") === 0) return "point_right";
    if (token.indexOf("pat") === 0) return "pat_chest";
    if (token.indexOf("stop") === 0) return "stop_hand";
    if (token.indexOf("beckon") === 0) return "beckon";
    return null;
  };
  Speech.actionWords = function (token) {
    const T = SC().tokens.find(t => t.token === token);
    return (T && T.action) || "gestures and makes a sound";
  };

  // ---- group speech lock: 3+ members share token→meaning at scoreAt+ ----
  Speech.lockKey = (gid, token, meaning) => gid + "|" + token + "|" + meaning;
  Speech.isSpeech = function (sim, a, token) {
    if (!a || a.group == null || !sim.speech) return false;
    const m = Speech.meaningOf(a, token); if (!m) return false;
    return !!sim.speech.locks[Speech.lockKey(a.group, token, m)];
  };
  Speech.groupWords = function (sim, g) {
    if (!g || !sim.speech) return [];
    const out = [];
    for (const k in sim.speech.locks) {
      const L = sim.speech.locks[k];
      if (L.group === g.id) out.push({ token: L.token, meaning: L.meaning, word: L.word, n: L.holders });
    }
    return out.sort((p, q) => (p.meaning < q.meaning ? -1 : 1));
  };
  Speech.cardLabel = function (sim, a) {
    const g = G.Social && G.Social.group(sim, a);
    const n = g ? Speech.groupWords(sim, g).length : 0;
    return n ? ("Speech: " + n + " shared word" + (n === 1 ? "" : "s")) : "Speech: none";
  };
  // pick one syllable for a meaning (seeded by sim seed + group + meaning); stable once locked
  Speech.pickWord = function (sim, meaning, groupId) {
    const W = (G.data.words && G.data.words.meanings && G.data.words.meanings[meaning]) || [];
    if (!W.length) return meaning;
    const h = G.RNG.hash2(groupId || 0, meaning.split("").reduce((t, c) => t + c.charCodeAt(0), 0), sim.seed);
    return W[Math.floor(h * W.length) % W.length];
  };
  Speech.recheckLocks = function (sim) {
    const C = SC(), A = sim.agents, byG = {};
    for (const a of A) if (a.group != null) (byG[a.group] || (byG[a.group] = [])).push(a);
    for (const gid in byG) {
      const members = byG[gid], counts = {};
      for (const a of members) {
        if (!a.words) continue;
        for (const token in a.words) {
          const e = a.words[token]; if (!e.meaning || e.score < C.scoreAt) continue;
          const k = token + "|" + e.meaning; (counts[k] || (counts[k] = [])).push(a.id);
        }
      }
      for (const k in counts) {
        const ids = counts[k]; if (ids.length < C.groupMin) continue;
        const [token, meaning] = k.split("|"), lk = Speech.lockKey(+gid, token, meaning);
        if (sim.speech.locks[lk]) { sim.speech.locks[lk].holders = ids.length; continue; }
        const word = Speech.pickWord(sim, meaning, +gid);
        sim.speech.locks[lk] = { group: +gid, token, meaning, word, holders: ids.length, since: sim.tick };
        sim.speech.stats.locks++;
        const names = ids.map(id => (A.find(p => p.id === id) || {}).name).filter(Boolean);
        G.Sim.log(sim, (names.length <= 3 ? names.join(", ") : names.slice(0, 2).join(", ") + " and others") + " share a word for " + meaning, ids.map(id => A.find(p => p.id === id)).filter(Boolean), "speech");
        const d = G.Discoveries.note(sim, A.find(p => p.id === ids[0]), "speak", [meaning], "shared word");
        if (d) d.title = "First shared word";
      }
    }
  };

  // ---- invent / emit ----
  const NEED_TO_MEANING = { fullness: "food", water: "water", warmth: "warm" };
  Speech.lowNeed = function (a) {
    const C = SC(); let k = null, v = C.needBelow;
    for (const q of ["fullness", "water", "warmth"]) if (a.needs[q] < v) { v = a.needs[q]; k = q; }
    return k;
  };
  Speech.nearSomeone = function (sim, a) {
    const R = SC().nearTiles;
    return sim.agents.some(b => b !== a && b.act.type !== "sleep" && Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y) <= R);
  };
  Speech.pickToken = function (sim, a, need) {
    const C = SC(), meaning = NEED_TO_MEANING[need] || "stop";
    // prefer a token she already knows for that meaning, else one biased toward it, else any
    const known = a.words && Object.keys(a.words).filter(t => a.words[t].meaning === meaning);
    if (known && known.length) return known[sim.wrng.int(0, known.length - 1)];
    const biased = C.tokens.filter(t => (t.bias || []).indexOf(meaning) >= 0);
    const pool = biased.length ? biased : C.tokens;
    return pool[sim.wrng.int(0, pool.length - 1)].token;
  };
  Speech.emit = function (sim, a, token, why) {
    const C = SC(), st = sim.speech.stats; st.emits++;
    a.gesture = { token, col: Speech.colOf(token), until: sim.tick + Math.round(C.gestureMinutes / TM()), why: why || null };
    // hearers within hearTiles get a watch
    for (const b of sim.agents) {
      if (b === a || b.act.type === "sleep" || Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y) > C.hearTiles) continue;
      b.speechWatch = { token, from: a.id, fromName: a.name, until: sim.tick + Math.round(C.meanMinutes / TM()), t: sim.tick };
      st.heard++;
      // copying: if speaker has a bound meaning and hearer's score is lower, chance to copy (x copyX inside group for speech tokens)
      Speech.maybeCopy(sim, a, b, token);
    }
    const spoken = Speech.isSpeech(sim, a, token);
    const word = spoken && sim.speech.locks[Speech.lockKey(a.group, token, Speech.meaningOf(a, token))];
    if (spoken && word) {
      st.spoken++;
      G.Sim.log(sim, a.name + ' says "' + word.word + '!"', a, "speech");
    } else {
      G.Sim.log(sim, a.name + " " + Speech.actionWords(token), a);
    }
    const d = G.Discoveries.note(sim, a, "gesture", [token], "sound");
    if (d) d.title = "First gesture";
    // speaker who already knows the meaning reinforces a little when reusing it
    const e = a.words && a.words[token];
    if (e && e.meaning) { e.n++; e.score = r2(clamp(e.score + C.reuseGain, 0, 100)); e.t = sim.tick; }
    return true;
  };
  Speech.maybeCopy = function (sim, a, b, token) {
    const C = SC(), sa = Speech.score(a, token), ma = Speech.meaningOf(a, token);
    if (!ma || sa < C.copyMinScore) return;
    const own = Speech.score(b, token); if (sa <= own) return;
    const speechTok = Speech.isSpeech(sim, a, token);
    const p = clamp(C.copyChance * b.traits.curiosity / 50 * (speechTok && a.group != null && a.group === b.group ? C.copyX : (G.Social ? G.Social.copyFactor(a, b) : 1)), 0, 1);
    if (!sim.wrng.chance(p)) return;
    const e = rec(b, token); e.meaning = ma; e.score = r2(own + (sa - own) * C.copyShare); e.from = a.name; e.t = sim.tick;
    sim.speech.stats.copies++;
  };
  Speech.inventRoll = function (sim, a) {
    const C = SC(), need = Speech.lowNeed(a);
    if (!need || !Speech.nearSomeone(sim, a) || a.act.type === "sleep" || a.act.type === "pray") return false;
    if (a.gesture && sim.tick < a.gesture.until) return false; // already gesturing
    // at most one invent attempt roll window per hour (flag cleared when due)
    if (a.speechDue && sim.tick > a.speechDue) a.speechDue = 0;
    if (!a.speechDue && sim.wrng.chance(clamp(a.traits.curiosity / C.inventDiv * TM() / 60, 0, 1))) {
      a.speechDue = sim.tick + Math.round(60 / TM());
      sim.speech.stats.invents++;
    }
    if (!a.speechDue) return false;
    // free enough to gesture: idle or light walk
    const free = a.act.type === "idle" || (a.act.type === "walk" && ["wander", "follow", "food", "water", "explore", "exploreWater"].indexOf(a.act.goal) >= 0);
    if (!free || !G.Agent.whole || !G.Agent.whole(a)) return false;
    a.speechDue = 0;
    const token = Speech.pickToken(sim, a, need);
    return Speech.emit(sim, a, token, need);
  };

  // ---- meaning bind from outcomes the hearer sees ----
  Speech.bind = function (sim, hearer, token, meaning) {
    const C = SC(), e = rec(hearer, token);
    const first = !e.meaning;
    if (e.meaning && e.meaning !== meaning) return false; // already bound differently; keep first meaning
    e.meaning = meaning; e.n++; e.score = r2(clamp((e.score || C.start) + (first ? C.bindGain : C.reuseGain), 0, 100)); e.t = sim.tick;
    if (first) sim.speech.stats.binds++;
    hearer.speechWatch = null;
    Speech.recheckLocks(sim);
    return true;
  };
  // an outcome happened at (x,y) involving `who` (optional). Hearers with a matching watch bind the meaning.
  Speech.outcome = function (sim, meaning, who, x, y) {
    if (!sim.speech) return;
    const C = SC(), R = C.seeTiles;
    const px = x != null ? x : (who && who.pos ? who.pos.x : null);
    const py = y != null ? y : (who && who.pos ? who.pos.y : null);
    if (px == null) return;
    for (const b of sim.agents) {
      const w = b.speechWatch; if (!w || sim.tick > w.until) { if (w && sim.tick > w.until) b.speechWatch = null; continue; }
      if (Math.hypot(b.pos.x - px, b.pos.y - py) > R) continue;
      // speaker doing the thing, or anyone near the watch's speaker
      const from = sim.agents.find(p => p.id === w.from);
      const nearFrom = from && Math.hypot(from.pos.x - px, from.pos.y - py) <= R;
      if (who && who.id !== w.from && who.id !== b.id && !nearFrom) continue;
      Speech.bind(sim, b, w.token, meaning);
    }
  };

  // ---- per-minute ----
  Speech.step = function (sim) {
    if (!sim.speech) return;
    for (const a of sim.agents) {
      if (a.gesture && sim.tick >= a.gesture.until) a.gesture = null;
      if (a.speechWatch && sim.tick > a.speechWatch.until) a.speechWatch = null;
      // follow / stop outcomes from movement
      if (a.act.type === "walk" && a.act.goal === "follow" && a.act.to != null) {
        const t = sim.agents.find(p => p.id === a.act.to);
        if (t) Speech.outcome(sim, "follow", t, t.pos.x, t.pos.y);
      }
      if (a.act.type === "idle" && a.speechWatch) {
        // standing still after a stop gesture from the speaker who is also idle nearby
        const w = a.speechWatch, sp = sim.agents.find(p => p.id === w.from);
        if (sp && sp.act.type === "idle" && Math.hypot(sp.pos.x - a.pos.x, sp.pos.y - a.pos.y) <= SC().nearTiles)
          Speech.bind(sim, a, w.token, "stop");
      }
      Speech.inventRoll(sim, a);
    }
    // danger: anyone frightened / running
    for (const a of sim.agents) {
      if (a.fright && a.fright.until > sim.tick) Speech.outcome(sim, "danger", a, a.pos.x, a.pos.y);
      if (a.act.goal === "scared" || a.act.goal === "fleeFire") Speech.outcome(sim, "danger", a, a.pos.x, a.pos.y);
    }
    if ((sim.tick * TM()) % 60 === 0) Speech.recheckLocks(sim);
  };

  // hooks used from agent / hunt / fire / powers
  Speech.onEat = (sim, a) => Speech.outcome(sim, "food", a, a.pos.x, a.pos.y);
  Speech.onDrink = (sim, a) => Speech.outcome(sim, "water", a, a.pos.x, a.pos.y);
  Speech.onWarm = (sim, a) => Speech.outcome(sim, "warm", a, a.pos.x, a.pos.y);
  Speech.onDanger = (sim, a) => Speech.outcome(sim, "danger", a, a.pos.x, a.pos.y);
  Speech.onFollow = (sim, a, leader) => Speech.outcome(sim, "follow", leader || a, (leader || a).pos.x, (leader || a).pos.y);
  Speech.onStop = (sim, a) => Speech.outcome(sim, "stop", a, a.pos.x, a.pos.y);

  // gesture still showing? (render)
  Speech.gestureNow = function (sim, a) {
    if (!a.gesture || sim.tick >= a.gesture.until) return null;
    // once this token is group speech for her group, stop drawing the overlay
    if (Speech.isSpeech(sim, a, a.gesture.token)) return null;
    return a.gesture;
  };

  G.Speech = Speech;
})(this.GS = this.GS || {});
