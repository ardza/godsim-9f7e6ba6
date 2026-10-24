// Step 27 Moods (save v24): happiness / sadness / anger 0–100 float toward baseline.
// Dominant = highest of three if ≥ dominantAt; else none. Multipliers on existing rolls only.
// Action-only logs (never “feels sad”). Fear traits stay separate.
(function (G) {
  const CF = () => G.data.config, MC = () => CF().moods || {}, TM = () => CF().time.tickGameMinutes;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), r2 = v => Math.round(v * 100) / 100;
  const Moods = {};

  Moods.ensure = function (a) {
    if (!a || a.kind !== "person") return null;
    const B = (MC().baseline != null ? MC().baseline : 40);
    if (!a.moods) a.moods = { happiness: B, sadness: B, anger: B };
    const m = a.moods;
    if (m.happiness == null) m.happiness = B;
    if (m.sadness == null) m.sadness = B;
    if (m.anger == null) m.anger = B;
    if (!a.moodClock) a.moodClock = { hungryLow: 0, hapWas: m.happiness, logAt: {} };
    return m;
  };

  Moods.baseline = () => (MC().baseline != null ? MC().baseline : 40);

  // Highest of three if ≥ dominantAt; else null. Ties: happiness > sadness > anger.
  Moods.dominant = function (a) {
    const m = Moods.ensure(a); if (!m) return null;
    const at = MC().dominantAt != null ? MC().dominantAt : 60;
    let best = null, bv = at - 1e-9;
    const order = ["happiness", "sadness", "anger"];
    for (const k of order) if (m[k] >= at && m[k] > bv) { bv = m[k]; best = k; }
    return best;
  };

  Moods.inventMult = function (a, action) {
    const d = Moods.dominant(a), I = MC().invent || {};
    if (d === "happiness") return I.happiness != null ? I.happiness : 1.35;
    if (d === "sadness") return I.sadness != null ? I.sadness : 0.7;
    if (d === "anger" && (action === "strike" || action === "cut")) return I.angerStrikeCut != null ? I.angerStrikeCut : 1.1;
    return 1;
  };
  Moods.bindMult = function (a) {
    const d = Moods.dominant(a), B = MC().bind || {};
    if (d === "happiness") return B.happiness != null ? B.happiness : 1.25;
    return 1;
  };
  Moods.ritualBindMult = function (a) {
    const d = Moods.dominant(a), B = MC().bind || {};
    if (d === "sadness") return B.sadnessRitual != null ? B.sadnessRitual : 1.2;
    return 1;
  };
  Moods.breakMult = function (a) {
    const d = Moods.dominant(a), B = MC().bind || {};
    if (d === "anger") return B.angerBreak != null ? B.angerBreak : 1.2;
    return 1;
  };
  Moods.prayerMult = function (a) {
    const d = Moods.dominant(a), P = MC().prayer || {};
    if (d === "sadness") return P.sadness != null ? P.sadness : 1.5;
    if (d === "happiness") return P.happiness != null ? P.happiness : 0.85;
    return 1;
  };
  Moods.huntMult = function (a) {
    const d = Moods.dominant(a), H = MC().hunt || {};
    if (d === "anger") return H.anger != null ? H.anger : 1.4;
    return 1;
  };
  Moods.copyMult = function (a, from) {
    const d = Moods.dominant(a), C = MC().copy || {};
    if (d === "happiness" && from && a.group != null && a.group === from.group)
      return C.happinessGroup != null ? C.happinessGroup : 1.2;
    return 1;
  };
  // happiness dominant → prefer share/copy: boost scavenger/copy, soften contest pull
  Moods.shareBias = function (a) {
    return Moods.dominant(a) === "happiness" ? (MC().hunt && MC().hunt.hapShare != null ? MC().hunt.hapShare : 1.25) : 1;
  };
  Moods.contestBias = function (a) {
    return Moods.dominant(a) === "happiness" ? (MC().hunt && MC().hunt.hapContest != null ? MC().hunt.hapContest : 0.7) : 1;
  };

  function bump(m, key, d) { m[key] = r2(clamp(m[key] + d, 0, 100)); }
  function toward(m, key, base, ratePerMin) {
    if (m[key] === base) return;
    const step = ratePerMin;
    if (m[key] > base) m[key] = r2(Math.max(base, m[key] - step));
    else m[key] = r2(Math.min(base, m[key] + step));
  }

  Moods.log = function (sim, a, key, text) {
    const C = MC(), cool = Math.round((C.logCoolMinutes || 360) / TM());
    const clk = a.moodClock || (a.moodClock = { hungryLow: 0, hapWas: 0, logAt: {} });
    const at = clk.logAt || (clk.logAt = {});
    if (at[key] != null && sim.tick - at[key] < cool) return false;
    at[key] = sim.tick;
    G.Sim.log(sim, text, a);
    return true;
  };

  // Death of someone with liking ≥ sadDeathLike within sadDeathTiles → sadness up + action log
  Moods.onDeath = function (sim, dead) {
    if (!sim || !dead) return;
    const C = MC(), likeMin = C.sadDeathLike != null ? C.sadDeathLike : 50;
    const R = C.sadDeathTiles != null ? C.sadDeathTiles : 10;
    const bumpAmt = C.sadDeathBump != null ? C.sadDeathBump : 25;
    for (const a of sim.agents) {
      if (a === dead || a.act && a.act.type === "sleep") continue;
      const e = a.rel && a.rel[dead.id]; if (!e || e.l < likeMin) continue;
      if (Math.hypot(a.pos.x - dead.pos.x, a.pos.y - dead.pos.y) > R) continue;
      const m = Moods.ensure(a); bump(m, "sadness", bumpAmt);
      Moods.log(sim, a, "death_" + dead.id, a.name + " sits with " + (a.sex === "m" ? "his" : "her") + " head down after " + dead.name + " dies");
    }
  };

  Moods.onLikeDelta = function (a, d) {
    if (!a || !(d < 0)) return;
    const C = MC(), scale = C.angLikeHitScale != null ? C.angLikeHitScale : 2;
    const m = Moods.ensure(a); bump(m, "anger", Math.abs(d) * scale);
  };

  Moods.onWolfChase = function (sim, a, pack) {
    if (!a) return;
    const C = MC(), cool = Math.round((C.logCoolMinutes || 360) / TM());
    const first = a.wolfChaseAt == null || sim.tick - a.wolfChaseAt >= cool;
    if (first) {
      const bumpAmt = C.angWolfChaseBump != null ? C.angWolfChaseBump : 20;
      const m = Moods.ensure(a); bump(m, "anger", bumpAmt);
      a.wolfChaseAt = sim.tick;
    }
    // Flee territory / seek group while chased
    if (a.act && a.act.type === "sleep") return;
    if (!a.act || a.act.goal !== "fleeWolf" && a.act.goal !== "follow") Moods.fleeWolfOrGroup(sim, a, pack);
  };

  Moods.fleeWolfOrGroup = function (sim, a, pack) {
    if (!a || a.act && (a.act.type === "sleep" || a.act.goal === "scared" || a.act.goal === "fleeWolf")) return false;
    const C = MC(), seekR = (C.band && C.band.sadSeekTiles) || 15;
    // Prefer a group member within seekR
    let best = null, bd = 1e9;
    if (a.group != null) for (const b of sim.agents) {
      if (b === a || b.group !== a.group) continue;
      const d = Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y);
      if (d <= seekR && d < bd) { bd = d; best = b; }
    }
    if (best) {
      const bx = Math.round(best.pos.x), by = Math.round(best.pos.y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1]]) {
        const x = bx + dx, y = by + dy;
        if (G.World.walkable(sim.world, x, y) && !G.Agent.claimed(sim, a, x, y) && G.Agent.walkTo(sim, a, x, y, "follow", { to: best.id })) {
          Moods.log(sim, a, "flee_group", a.name + " runs toward " + best.name);
          return true;
        }
      }
    }
    // Else flee away from den / current wolves
    const den = pack && pack.den ? pack.den : null;
    const t = G.Agent.tilePos(a);
    let fx = t.x, fy = t.y;
    if (den) { const ang = Math.atan2(t.y - den.y, t.x - den.x); fx = Math.round(t.x + Math.cos(ang) * 6); fy = Math.round(t.y + Math.sin(ang) * 6); }
    else { fx = t.x + (sim.arng ? (sim.arng.chance(0.5) ? 5 : -5) : 5); fy = t.y; }
    const c = [];
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
      const x = t.x + dx, y = t.y + dy, d = Math.hypot(dx, dy);
      if (d < 3 || d > 7 || !G.World.walkable(sim.world, x, y) || G.Agent.claimed(sim, a, x, y)) continue;
      const away = den ? Math.hypot(x - den.x, y - den.y) : Math.hypot(x - fx, y - fy);
      c.push({ x, y, s: -away + d * 0.1 });
    }
    c.sort((p, q) => p.s - q.s || p.x - q.x || p.y - q.y);
    for (const q of c.slice(0, 6)) if (G.Agent.walkTo(sim, a, q.x, q.y, "fleeWolf")) {
      Moods.log(sim, a, "flee_wolf", a.name + " runs from the Wolves");
      return true;
    }
    return false;
  };

  Moods.onHuntKill = function (sim, a) {
    const C = MC(), drop = C.angHuntDrop != null ? C.angHuntDrop : 15;
    const m = Moods.ensure(a); bump(m, "anger", -drop);
  };
  Moods.onShare = function (sim, a) {
    const C = MC(), drop = C.angShareDrop != null ? C.angShareDrop : 10;
    const m = Moods.ensure(a); bump(m, "anger", -drop);
  };
  Moods.onRitual = function (sim, a) {
    const C = MC(), drop = C.sadRitualDrop != null ? C.sadRitualDrop : 12;
    const m = Moods.ensure(a); bump(m, "sadness", -drop);
  };
  Moods.onSleepDone = function (sim, a) {
    const C = MC(), boost = C.sleepDoneBoost != null ? C.sleepDoneBoost : 8;
    const m = Moods.ensure(a); bump(m, "happiness", boost);
  };

  // Per-minute mood drift + environmental rises/falls
  Moods.step = function (sim) {
    if (!MC() || MC().baseline == null && !CF().moods) return;
    const C = MC(), B = Moods.baseline(), tm = TM();
    const floatH = (C.floatPerHour != null ? C.floatPerHour : 2) / 60 * tm;
    const hapGood = C.hapNeedGood != null ? C.hapNeedGood : 60;
    const hapBad = C.hapNeedBad != null ? C.hapNeedBad : 40;
    const hapRise = (C.hapRisePerHour != null ? C.hapRisePerHour : 4) / 60 * tm;
    const hapFall = (C.hapFallNeedPerHour != null ? C.hapFallNeedPerHour : 6) / 60 * tm;
    const hapAlone = (C.hapAloneNightPerHour != null ? C.hapAloneNightPerHour : 5) / 60 * tm;
    const hapLiked = (C.hapLikedPerHour != null ? C.hapLikedPerHour : 3) / 60 * tm;
    const likedR = C.likedNearbyTiles != null ? C.likedNearbyTiles : 4;
    const likedMin = C.likedMin != null ? C.likedMin : 60;
    const sadHungryBelow = C.sadHungryBelow != null ? C.sadHungryBelow : 25;
    const sadHungryDay = C.sadHungryDayMinutes != null ? C.sadHungryDayMinutes : 1440;
    const sadHungry = (C.sadHungryPerHour != null ? C.sadHungryPerHour : 4) / 60 * tm;
    const sadFallHap = (C.sadFallHapRising != null ? C.sadFallHapRising : 3) / 60 * tm;
    const angFall = (C.angFallPerDay != null ? C.angFallPerDay : 40) / 1440 * tm;
    const night = G.Agent.isNight(sim.tick);

    for (const a of sim.agents) {
      const m = Moods.ensure(a), n = a.needs, clk = a.moodClock;
      const needsFine = n.fullness >= hapGood && n.water >= hapGood && n.warmth >= hapGood;
      const needsBad = n.fullness < hapBad || n.water < hapBad || n.warmth < hapBad;

      // Happiness
      if (needsFine) bump(m, "happiness", hapRise);
      if (needsBad) bump(m, "happiness", -hapFall);
      let likedNear = false, alone = true;
      for (const b of sim.agents) {
        if (b === a) continue;
        const d = Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y);
        if (d <= likedR) alone = false;
        const e = a.rel && a.rel[b.id];
        if (e && e.l >= likedMin && d <= likedR) { likedNear = true; break; }
      }
      if (likedNear) bump(m, "happiness", hapLiked);
      if (night && alone) bump(m, "happiness", -hapAlone);

      // Sadness: Fullness under 25 for a day
      if (n.fullness < sadHungryBelow) clk.hungryLow = (clk.hungryLow || 0) + tm;
      else clk.hungryLow = 0;
      if (clk.hungryLow >= sadHungryDay) bump(m, "sadness", sadHungry);
      if (m.happiness > (clk.hapWas || m.happiness)) bump(m, "sadness", -sadFallHap);
      clk.hapWas = m.happiness;

      // Anger: time fall ~1 day
      bump(m, "anger", -angFall);

      // Float toward baseline when needs fine (gentle)
      if (needsFine) {
        toward(m, "happiness", B, floatH);
        toward(m, "sadness", B, floatH);
        toward(m, "anger", B, floatH * 0.5);
      }

      // Banding impulses while idle
      const dom = Moods.dominant(a);
      if (dom && (a.act.type === "idle" || (a.act.type === "walk" && (a.act.goal === "wander" || a.act.goal === "follow")))) {
        if (dom === "sadness") Moods.seekGroup(sim, a);
        else if (dom === "anger") Moods.avoidNonGroup(sim, a);
      }
    }
  };

  Moods.seekGroup = function (sim, a) {
    const C = MC(), R = (C.band && C.band.sadSeekTiles) || 15;
    if (a.group == null) return false;
    let best = null, bd = 1e9;
    for (const b of sim.agents) {
      if (b === a || b.group !== a.group) continue;
      const d = Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y);
      if (d > 2 && d <= R && d < bd) { bd = d; best = b; }
    }
    if (!best || bd <= 3) return false;
    const bx = Math.round(best.pos.x), by = Math.round(best.pos.y);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = bx + dx, y = by + dy;
      if (G.World.walkable(sim.world, x, y) && !G.Agent.claimed(sim, a, x, y) && G.Agent.walkTo(sim, a, x, y, "follow", { to: best.id })) return true;
    }
    return false;
  };

  Moods.avoidNonGroup = function (sim, a) {
    const C = MC(), R = (C.band && C.band.angerAvoidTiles) || 5;
    let bad = null, bd = 1e9;
    for (const b of sim.agents) {
      if (b === a) continue;
      if (a.group != null && b.group === a.group) continue;
      const d = Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y);
      if (d < R && d < bd) { bd = d; bad = b; }
    }
    if (!bad) return false;
    const t = G.Agent.tilePos(a), c = [];
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      const x = t.x + dx, y = t.y + dy, k = Math.hypot(x - bad.pos.x, y - bad.pos.y);
      if (k < R + 0.5 || !G.World.walkable(sim.world, x, y) || G.Agent.claimed(sim, a, x, y)) continue;
      c.push({ x, y, s: Math.hypot(dx, dy) });
    }
    c.sort((p, q) => p.s - q.s || p.x - q.x || p.y - q.y);
    for (const q of c.slice(0, 4)) if (G.Agent.walkTo(sim, a, q.x, q.y, "avoid", { from: bad.id })) return true;
    return false;
  };

  G.Moods = Moods;
})(this.GS = this.GS || {});
