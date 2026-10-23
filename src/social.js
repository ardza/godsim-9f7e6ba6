// Step 18: relations and groups. Each person keeps, for every other person she has seen, familiarity (0-100) and liking (0-100, starts at 50):
//   a.rel[id] = {f, l, m: minutes near toward the next familiarity point, d: minutes apart toward the next drop, nt: last minute near}.
// Familiarity: +1 per game hour within nearTiles, -1 per game day apart. Liking: +2 once per "good stretch" (a need of hers rising - eating,
// drinking, warmed by a fire or by huddling - with them within nearTiles), -3 when they took the bush / meat / fire spot she was heading for,
// drifting back toward 50 at 1 point per 3 days. Every game day, people whose mutual familiarity and liking are both >= 60 are clustered
// (connected components of 2+) into groups; a group keeps its id and colour while most of its old members are still together.
// Nothing is scripted and nothing is said: log lines describe what people do. No random draws here (colours are a seeded hash).
(function (G) {
  const CF = () => G.data.config, S = () => CF().social, TM = () => CF().time.tickGameMinutes;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), r6 = v => Math.round(v * 1e6) / 1e6;
  const Social = {};

  Social.rel = (a, b) => (a.rel && a.rel[b.id]) || null;
  Social.like = (a, b) => { const r = Social.rel(a, b); return r ? r.l : S().like.start; };
  Social.fam = (a, b) => { const r = Social.rel(a, b); return r ? r.f : 0; };
  const entry = (a, b) => { const R = a.rel || (a.rel = {}); return R[b.id] || (R[b.id] = { f: 0, l: S().like.start, m: 0, d: 0 }); };
  Social.addFam = (a, b, d) => { const e = entry(a, b); e.f = r6(clamp(e.f + d, 0, 100)); return e; };   // 21b: a cold loner joining someone
  Social.addLike = (a, b, d) => { const e = entry(a, b); e.l = r6(clamp(e.l + d, 0, 100)); return e; };

  // did one of her needs rise this minute in a way company shares (eating, drinking, warmed by fire or huddling)?
  function rising(a) {
    const n = a.needs, p = a.soc && a.soc.n; if (!p) return false;
    return n.fullness > p[0] + 1e-9 || n.water > p[1] + 1e-9 || (n.warmth > p[2] + 1e-9 && !!a.felt && (a.felt.heat > 0 || a.felt.huddle > 0));
  }

  // every minute, after people have moved
  Social.step = function (sim) {
    const C = S(), tm = TM(), A = sim.agents, near = C.nearTiles, drift = tm * C.like.driftPerDay / 1440;
    for (const a of A) { const s = a.soc || (a.soc = { ep: null, quiet: 0 }), up = rising(a);
      if (up) { s.quiet = 0; if (!s.ep) s.ep = []; } else if (s.ep && (s.quiet += tm) >= C.like.gapMinutes) s.ep = null;   // a stretch ends after gapMinutes with no rise
      s.up = up; }
    for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) {
      const a = A[i], b = A[j], d = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
      if (d <= G.Agent.sight(a)) entry(a, b); if (d <= G.Agent.sight(b)) entry(b, a);
      if (d > near) continue;
      for (const [p, q] of [[a, b], [b, a]]) { const e = entry(p, q); e.d = 0; e.nt = sim.tick;
        if ((e.m += tm) >= 60) { e.m -= 60; e.f = Math.min(100, e.f + C.famPerHour); }
        if (p.soc.up && p.soc.ep && p.soc.ep.indexOf(q.id) < 0) { p.soc.ep.push(q.id); Social.addLike(p, q, C.like.shared); } }
    }
    for (const a of A) { a.soc.n = [a.needs.fullness, a.needs.water, a.needs.warmth];
      if (!a.rel) continue;
      for (const id in a.rel) { const e = a.rel[id];
        if (e.nt !== sim.tick && (e.d += tm) >= 1440) { e.d -= 1440; e.f = Math.max(0, e.f - C.famDropPerDay); }   // a day apart
        if (e.l !== C.like.start) e.l = r6(e.l > C.like.start ? Math.max(C.like.start, e.l - drift) : Math.min(C.like.start, e.l + drift)); }
    }
    if ((sim.tick * tm) % 1440 === 0) Social.daily(sim);
  };

  // she was heading for it and someone else took it
  Social.took = function (sim, a, taker, what) {
    if (!taker || taker === a || !a.rel || !a.rel[taker.id]) return;   // only someone she knows by sight
    Social.addLike(a, taker, S().like.took); (sim.socStats || (sim.socStats = { took: 0 })).took++;
    G.Sim.log(sim, a.name + " finds " + taker.name + " took the " + what, [a, taker]);
  };

  // ---------- groups ----------
  const nameList = names => names.length <= 1 ? names.join("") : names.length <= 4 ? names.slice(0, -1).join(", ") + " and " + names[names.length - 1] : names.slice(0, 3).join(", ") + " and " + (names.length - 3) + " others";
  // Director (call 7 on 18): six saturated colours clear of meadow green, sand and water blue. A new group takes the first colour no
  // current group has, starting from a seeded spot in the list (hash, no draw); with 6+ groups colours repeat. Kept while the group lasts.
  Social.PALETTE = [[255, 60, 230], [255, 140, 20], [40, 230, 255], [255, 230, 40], [240, 40, 40], [255, 255, 255]];
  Social.PALETTE_NAMES = ["magenta", "orange", "cyan", "yellow", "red", "white"];
  Social.pickColor = (sim, id, taken) => { const N = Social.PALETTE.length, s0 = Math.floor(G.RNG.hash2(id, 18, sim.seed) * N) % N;
    for (let k = 0; k < N; k++) { const c = (s0 + k) % N; if (!taken || taken.indexOf(c) < 0) return c; } return s0; };
  Social.color = (sim, g, alpha) => { const c = Social.PALETTE[(g.ci || 0) % Social.PALETTE.length]; return "rgba(" + c.join(",") + "," + (alpha == null ? 1 : alpha) + ")"; };
  Social.group = (sim, a) => a && a.group != null ? (sim.groups || []).find(g => g.id === a.group) || null : null;
  Social.groupName = (sim, g) => g ? "Group " + g.id : "";
  Social.mutual = (a, b) => { const C = S().group, p = Social.rel(a, b), q = Social.rel(b, a); return !!p && !!q && p.f >= C.fam && q.f >= C.fam && p.l >= C.like && q.l >= C.like; };
  // a group's known skills: union of its members' learned scores >= skillAt
  Social.skills = function (sim, g) {
    const out = [];
    for (const id of g.members) { const a = sim.agents.find(b => b.id === id); if (!a || !a.exp) continue;
      for (const k in a.exp) if (a.exp[k].score >= S().skillAt && out.indexOf(k) < 0) out.push(k); }
    return out.sort();
  };
  Social.daily = function (sim) {
    const A = sim.agents, alive = {}; for (const a of A) alive[a.id] = a;
    for (const a of A) if (a.rel) for (const id in a.rel) if (!alive[id]) delete a.rel[id];   // the dead drop out of the relations
    // connected components of mutual familiarity + liking
    const seen = {}, comps = [];
    for (const a of A) { if (seen[a.id]) continue; const c = [], st = [a]; seen[a.id] = true;
      while (st.length) { const p = st.pop(); c.push(p.id); for (const q of A) if (!seen[q.id] && q !== p && Social.mutual(p, q)) { seen[q.id] = true; st.push(q); } }
      if (c.length >= S().group.min) comps.push(c.sort((x, y) => x - y)); }
    const old = (sim.groups || []).map(g => Object.assign({}, g, { members: g.members.filter(id => alive[id]) })), out = [], used = {};
    sim.nextGroup = sim.nextGroup || 1;
    // an old group keeps its id and colour in the component holding most (more than half) of its old members
    for (const g of old) { let best = null, bo = 0;
      comps.forEach((c, i) => { if (used[i]) return; const o = c.filter(id => g.members.indexOf(id) >= 0).length; if (o > bo) { bo = o; best = i; } });
      if (best != null && bo * 2 > g.members.length) { used[best] = true; const c = comps[best];
        const join = c.filter(id => g.members.indexOf(id) < 0), left = g.members.filter(id => c.indexOf(id) < 0), nm = ids => ids.map(id => alive[id].name);
        for (const id of join) G.Sim.log(sim, alive[id].name + " now keeps with " + nameList(nm(g.members)), [alive[id]].concat(g.members.map(i => alive[i])));
        for (const id of left) G.Sim.log(sim, alive[id].name + " no longer keeps with " + nameList(nm(c)), [alive[id]].concat(c.map(i => alive[i])));
        out.push({ id: g.id, ci: g.ci, members: c, since: g.since }); }
      else if (g.members.length >= 2) G.Sim.log(sim, nameList(g.members.map(id => alive[id].name)) + " no longer keep together", g.members.map(id => alive[id]), "group");
    }
    comps.forEach((c, i) => { if (used[i]) return; const id = sim.nextGroup++;
      out.push({ id, ci: Social.pickColor(sim, id, out.map(g => g.ci)), members: c, since: sim.tick });
      G.Sim.log(sim, nameList(c.map(x => alive[x].name)) + " now keep together", c.map(x => alive[x]), "group"); });
    out.sort((p, q) => p.id - q.id); sim.groups = out;
    for (const a of A) a.group = null; for (const g of out) for (const id of g.members) alive[id].group = g.id;
    const st = sim.socStats || (sim.socStats = { took: 0 }); st.days = (st.days || 0) + 1; st.groupDays = (st.groupDays || 0) + out.length; st.maxGroups = Math.max(st.maxGroups || 0, out.length);
    st.formed = sim.nextGroup - 1;
  };

  // copy odds factor: +25% from someone of her own group, -15% from anyone else
  Social.copyFactor = (a, b) => b.group != null && b.group === a.group ? S().copy.member : S().copy.other;

  // ---------- idle movement: keep away from the disliked, drift toward the most liked ----------
  // returns true if it set her walking
  Social.idleMove = function (sim, a, walkTo, free) {
    const C = S(); if (!a.rel) return false;
    let bad = null, bd = 1e9, best = null, bl = -1;
    for (const b of sim.agents) { if (b === a) continue; const e = a.rel[b.id]; if (!e) continue; const d = Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y);
      if (e.l < C.avoid.below && d < C.avoid.tiles && d < bd) { bad = b; bd = d; }
      if (e.l >= C.follow.minLike && d <= C.follow.tiles && (e.l > bl || e.l === bl && b.id < best.id)) { best = b; bl = e.l; } }
    if (bad) { const t = G.Agent.tilePos(a), c = [];
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) { const x = t.x + dx, y = t.y + dy, k = Math.hypot(x - bad.pos.x, y - bad.pos.y);
        if (k < C.avoid.tiles + 0.5 || !free(x, y)) continue; c.push({ x, y, s: Math.hypot(dx, dy) }); }
      c.sort((p, q) => p.s - q.s || p.x - q.x || p.y - q.y);
      for (const q of c.slice(0, 4)) if (walkTo(q.x, q.y, "avoid", { from: bad.id })) { const st = sim.socStats || (sim.socStats = { took: 0 }); st.avoids = (st.avoids || 0) + 1; return true; }
    }
    if (best && !Social.followOff(sim, a)) { const d = Math.hypot(best.pos.x - a.pos.x, best.pos.y - a.pos.y), [lo, hi] = C.follow.off;
      if (d > hi + 0.5) { const bx = Math.round(best.pos.x), by = Math.round(best.pos.y), c = [];
        for (let dy = -hi; dy <= hi; dy++) for (let dx = -hi; dx <= hi; dx++) { const k = Math.hypot(dx, dy); if (k < lo || k > hi + 0.5 || !free(bx + dx, by + dy)) continue;
          c.push({ x: bx + dx, y: by + dy, s: Math.hypot(bx + dx - a.pos.x, by + dy - a.pos.y) }); }
        c.sort((p, q) => p.s - q.s || p.x - q.x || p.y - q.y);
        for (const q of c.slice(0, 4)) if (walkTo(q.x, q.y, "follow", { to: best.id })) { const st = sim.socStats || (sim.socStats = { took: 0 }); st.follows = (st.follows || 0) + 1; return true; } }
    }
    return false;
  };
  // a wander target is fine if it keeps her within follow.off of the liked person she is near and 3+ tiles from anyone disliked
  Social.wanderOk = function (sim, a, x, y) {
    const C = S(); if (!a.rel) return true;
    for (const b of sim.agents) { if (b === a) continue; const e = a.rel[b.id]; if (!e) continue; const d = Math.hypot(b.pos.x - x, b.pos.y - y);
      if (e.l < C.avoid.below && d < C.avoid.tiles) return false; }
    const f = !Social.followOff(sim, a) && Social.friend(sim, a); return !f || Math.hypot(f.pos.x - x, f.pos.y - y) <= C.follow.off[1] + 0.5 || Math.hypot(f.pos.x - a.pos.x, f.pos.y - a.pos.y) > C.follow.off[1] + 0.5;
  };
  // Director (call 2 on 18): no following in Deep Cold, or while any of her own needs is under follow.offBelow (she sees to herself first)
  Social.followOff = function (sim, a) {
    const F = S().follow, n = a.needs; if (F.offSeason != null && G.Climate.seasonIndex(sim.tick) === F.offSeason) return true;
    return n.fullness < F.offBelow || n.water < F.offBelow || n.energy < F.offBelow || n.warmth < F.offBelow;
  };
  // the most-liked person within follow.tiles with liking >= minLike (ties: lower id)
  Social.friend = function (sim, a) {
    const C = S(); if (!a.rel) return null; let best = null, bl = -1;
    for (const b of sim.agents) { if (b === a) continue; const e = a.rel[b.id]; if (!e || e.l < C.follow.minLike) continue;
      if (Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y) > C.follow.tiles) continue; if (e.l > bl || e.l === bl && b.id < best.id) { best = b; bl = e.l; } }
    return best;
  };
  // card: top N by familiarity among the living: [{name, id, f, l, word}]
  Social.top = function (sim, a, n) {
    const C = S(), out = [];
    if (a.rel) for (const id in a.rel) { const b = sim.agents.find(q => q.id === +id); if (!b) continue; const e = a.rel[id];
      out.push({ id: b.id, name: b.name, f: Math.round(e.f), l: Math.round(e.l), word: e.l >= C.words.warm ? "warm" : e.l >= C.words.neutral ? "neutral" : "wary" }); }
    return out.sort((p, q) => q.f - p.f || q.l - p.l || p.id - q.id).slice(0, n || C.cardTop);
  };

  G.Social = Social;
})(this.GS = this.GS || {});
