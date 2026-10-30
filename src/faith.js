// Step 21: faith and prayer (Director calls, Oct 23). Data-driven, no speech, no named powers, nothing scripted.
//   faith: a trait 0-100 (founders seeded from this module's own stream prng; babies inherit it like any other trait).
//   trigger: a need under faith.needBelow, or a death seen nearby in the last deathSeenMinutes -> per-hour chance faith/hourDiv of a prayer bout
//     (boutMinutes). Never instead of drinking / eating when the source is within sourceTiles; never asleep, fleeing, hunting, eating...
//   form: 1-3 primitive actions ("kneel+offer:bone"). The first prayer picks a random form, weighted by what she holds and what is near;
//     after that she reuses her forms (weight 1 + liking / likeScale). A prayer seen within copyTiles is copied as a form by the learning
//     copy rule (copyChance x curiosity/50 x group factor x child factor).
//   reinforcement: if the triggering need rises riseBy+ within reinforceMinutes, her liking for that form goes up (a superstition: no real effect).
//   places: spotMin prayers within spotTiles of a spot make a prayer spot; praying people within driftTiles walk there first.
//   §33 / v30 sacred: spots at spotMin get a map marker (spot.marker); groups with shared speech may know a spot (g.sacred / a.sacred)
//     after a member prayed there or saw the marker; idle people with high faith or low needs may drift toward a known marked spot.
//   feed: sim.prayers, newest last, last feedMax action lines (saved); shown newest first in the Prayers tab.
(function (G) {
  const Faith = {};
  const FC = () => G.data.config.faith, TM = () => G.data.config.time.tickGameMinutes;
  const r2 = v => Math.round(v * 100) / 100, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const NEEDS = ["fullness", "water", "warmth", "energy"];

  Faith.newState = () => ({ spots: [], places: [], forms: {}, stats: { bouts: 0, byNeed: {}, byDeath: 0, copies: 0, reinforced: 0, offerings: 0, skippedSource: 0, drifts: 0, markers: 0, groupKnown: 0, sacredDrifts: 0 } });
  Faith.init = function (sim) {
    sim.prng = new G.RNG((sim.seed ^ 0xFA17B0DE) >>> 0); sim.faith = Faith.newState(); sim.prayers = [];
    const sp = G.data.config.person.traitSpread;
    for (const a of sim.agents) Faith.seedTrait(sim, a, sp);
  };
  Faith.seedTrait = (sim, a, sp) => { a.traits.faith = Math.round(clamp(50 + sim.prng.gauss() * sp, 0, 100)); };
  // summary numbers (all-time, from sim.faith.forms): who prayed, how many forms, how far they spread by copying, superstitions, spots
  Faith.stats = function (sim) {
    const F = sim.faith, people = {}, liked = {}, Fm = F.forms, keys = Object.keys(Fm);
    let maxHolders = 0, maxGen = 0, spread = 0, sup = 0;
    for (const f of keys) { const o = Fm[f], h = Object.keys(o.holders).length; for (const id in o.prayed) people[id] = 1;
      maxHolders = Math.max(maxHolders, h); for (const id in o.holders) maxGen = Math.max(maxGen, o.holders[id]);
      if (Object.keys(o.prayed).some(id => o.holders[id] >= 1)) spread++;   // prayed by someone who copied it
      if (o.liked) { const n = Object.keys(o.liked).length; sup += n; for (const id in o.liked) liked[id] = 1; } }
    return { bouts: F.stats.bouts, byNeed: F.stats.byNeed, byDeath: F.stats.byDeath, prayed: Object.keys(people).length, forms: keys.length,
      spreadForms: spread, copies: F.stats.copies, maxHolders, maxGen, reinforced: F.stats.reinforced, superstitions: sup, superPeople: Object.keys(liked).length,
      offerings: F.stats.offerings, spots: F.spots.length, spotPrayers: F.spots.reduce((t, q) => t + q.n, 0), drifts: F.stats.drifts, markers: F.spots.filter(q => q.marker).length, sacredDrifts: F.stats.sacredDrifts || 0, groupKnown: F.stats.groupKnown || 0, skippedSource: F.stats.skippedSource, rolls: F.stats.rolls || 0,
      top: keys.sort((p, q) => Object.keys(Fm[q].holders).length - Object.keys(Fm[p].holders).length || (p < q ? -1 : 1)).slice(0, 3).map(f => f + " x" + Object.keys(Fm[f].holders).length) };
  };

  // ---- readable words for a form (action lines only) ----
  const VERB = { kneel: "kneels", raise: a => "raises " + G.Family.poss(a) + " arms skyward", sway: "sways", circle: "circles a spot", still: "lies still" };
  const ING = { kneel: "kneeling", raise: "raising arms skyward", sway: "swaying", offer: "placing something on the ground", circle: "circling a spot", face: "facing the light", still: "lying still" };
  Faith.verb = function (a, act) { const [k, x] = act.split(":");
    if (k === "offer") return "places " + (x === "meat" ? "a piece of meat" : "a " + x) + " on the ground";
    if (k === "face") return "faces the " + x;
    const v = VERB[k]; return typeof v === "function" ? v(a) : v || k; };
  Faith.formWords = form => form.split("+").map(s => { const [k, x] = s.split(":"); return k === "offer" ? "offer " + x : k === "face" ? "face " + x : k === "raise" ? "raise arms" : k === "still" ? "lie still" : k; }).join(" + ");
  const join = l => l.length < 2 ? l.join("") : l.slice(0, -1).join(", ") + " and " + l[l.length - 1];
  // 26b.8: Story banks for every need why-tag (Commissioner); skip ", why" when same person+need in last 2 game hours. Death lines unchanged.
  const STATE = {
    energy: ["tired", "worn out", "weary", "spent"],
    warmth: ["shivering", "cold", "chilled"],
    fullness: ["hungry", "empty", "starved"],
    water: ["thirsty", "parched", "dry"]
  };
  const WHY_COOL_H = 2;   // game hours before the same person+need why-tag may repeat
  Faith.line = function (a, acts, why) { return a.name + " " + join(acts.map(s => Faith.verb(a, s))) + (why ? ", " + why : ""); };
  Faith.whyTag = function (sim, a, need) {
    if (!need || need === "death") return "";
    const win = Math.round(WHY_COOL_H * 60 / TM()), L = sim.prayers || [];
    for (let i = L.length - 1; i >= 0; i--) {
      const e = L[i]; if (sim.tick - e.t > win) break;
      if (e.need === need && e.ids && e.ids[0] === a.id) return "";
    }
    const w = STATE[need]; if (!w) return "";
    return Array.isArray(w) ? w[sim.prng.int(0, w.length - 1)] : w;
  };
  Faith.doing = a => "praying, " + (ING[((a.act.done || a.act.acts) && (a.act.done || a.act.acts)[Math.min((a.act.done || a.act.acts).length - 1, Math.floor(a.act.t / Math.max(1, a.act.per)))] || "").split(":")[0]] || "still");

  // ---- the person's choices ----
  const offerable = (sim, a) => { const it = G.Items.held(sim, a); return it && !it.lit && FC().offer.indexOf(it.material) >= 0 ? it.material : null; };
  const fireNear = (sim, a) => { const R = FC().fireSight; for (const k in sim.fire) { const e = sim.fire[k]; if (e.s !== "fire" && e.s !== "ember") continue; const [x, y] = k.split(",").map(Number); if (Math.hypot(x - a.pos.x, y - a.pos.y) <= R) return true; }
    return sim.items.some(i => i.lit && Math.hypot(i.x - a.pos.x, i.y - a.pos.y) <= R); };
  // a random first form: 1-3 different actions, weighted by what she holds and what is near
  Faith.randomForm = function (sim, a) {
    const C = FC(), r = sim.prng, W = [], held = offerable(sim, a), fire = fireNear(sim, a), sun = !G.Agent.isNight(sim.tick);
    for (const k of C.actions) { let w = C.weights[k] || 1, s = k;
      if (k === "offer") { if (!held) continue; s = "offer:" + held; w *= C.heldX; }
      if (k === "face") { if (fire) { s = "face:fire"; w *= C.nearX; } else if (sun) s = "face:sun"; else continue; }
      W.push({ s, w }); }
    const n = r.int(1, Math.min(C.maxActs, W.length)), out = [];
    for (let i = 0; i < n; i++) { const tot = W.reduce((t, q) => t + q.w, 0); let x = r.float() * tot, j = 0; for (; j < W.length - 1; j++) { x -= W[j].w; if (x < 0) break; } out.push(W[j].s); W.splice(j, 1); }
    return out.join("+");
  };
  Faith.pickForm = function (sim, a) {
    const P = a.prayForms || (a.prayForms = {}), keys = Object.keys(P);
    if (!keys.length) return Faith.randomForm(sim, a);
    const L = FC().likeScale, tot = keys.reduce((t, f) => t + 1 + P[f].like / L, 0); let x = sim.prng.float() * tot;
    for (const f of keys) { x -= 1 + P[f].like / L; if (x < 0) return f; } return keys[keys.length - 1];
  };
  const rec = (a, form) => { const P = a.prayForms || (a.prayForms = {}); return P[form] || (P[form] = { n: 0, like: 0, gen: 0 }); };
  // all-time record of a form (sim.faith.forms): who held it (id -> copy generation, 0 = made it up), who prayed it, copies, reinforcements
  const reg = (sim, form) => sim.faith.forms[form] || (sim.faith.forms[form] = { holders: {}, prayed: {}, copies: 0, hits: 0, first: null });

  // step 23: her latest prayer (begun within win ticks) is answered by a strike / new animal close by: reinforced like a need that rose after it
  // (once per bout: e.ans = the bout's start tick). True = reinforced.
  Faith.answer = function (sim, a, win) {
    if (!sim.faith || !a.prayForms) return false; const C = FC(); let form = null, e = null;
    for (const f in a.prayForms) { const r = a.prayForms[f]; if (r.last != null && sim.tick - r.last <= win && (!e || r.last > e.last)) { form = f; e = r; } }
    if (!e || e.ans === e.last) return false; e.ans = e.last;
    e.like = Math.min(100, e.like + C.likeGain); e.hits = (e.hits || 0) + 1; sim.faith.stats.reinforced++; sim.faith.stats.byPower = (sim.faith.stats.byPower || 0) + 1;
    const R = reg(sim, form); R.hits++; (R.liked || (R.liked = {}))[a.id] = 1; return true;
  };
  // ---- triggers ----
  // the need under needBelow (lowest), else "death" for a death seen in the last day, else null
  Faith.trigger = function (sim, a) {
    const C = FC(); let k = null, v = C.needBelow; for (const q of NEEDS) if (a.needs[q] < v) { v = a.needs[q]; k = q; }
    if (k) return k; if (a.sawDeath && sim.tick - a.sawDeath.t <= C.deathSeenMinutes / TM()) return "death"; return null;
  };
  // the water / food she is after is within sourceTiles: no prayer instead of drinking or eating
  Faith.sourceClose = function (sim, a) {
    const R = FC().sourceTiles, w = G.Agent.want(a), act = a.act;
    if ((act.goal === "water" || act.goal === "food" || act.goal === "meat") && act.path && act.path.length - act.i <= R) return true;
    if (!w) return false; const x0 = Math.round(a.pos.x), y0 = Math.round(a.pos.y), T = G.data.T;
    if (w === "water") { for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const t = G.World.tile(sim.world, x0 + dx, y0 + dy); if ((t === T.RIVER || t === T.LAKE) && Math.hypot(dx, dy) <= R) return true; } return false; }
    return sim.bushes.some(b => b.ripe && Math.hypot(b.x - a.pos.x, b.y - a.pos.y) <= R) || sim.items.some(i => i.material === "meat" && !i.heldBy && Math.hypot(i.x - a.pos.x, i.y - a.pos.y) <= R);
  };
  const FREE = { idle: 1 }, FREE_WALK = { wander: 1, food: 1, explore: 1, water: 1, exploreWater: 1, follow: 1, avoid: 1, keep: 1, settle: 1, shelter: 1 };
  Faith.free = a => FREE[a.act.type] || (a.act.type === "walk" && FREE_WALK[a.act.goal]);

  Faith.step = function (sim) {
    if (!sim.faith) return; const C = FC(), tm = TM();
    for (const a of sim.agents) {
      const w = a.prayWatch; if (w) { if (a.needs[w.need] >= w.v + C.riseBy) { const e = rec(a, w.form); e.like = Math.min(100, e.like + C.likeGain); e.hits = (e.hits || 0) + 1; sim.faith.stats.reinforced++; const R = reg(sim, w.form); R.hits++; (R.liked || (R.liked = {}))[a.id] = 1; a.prayWatch = null; }
        else if (sim.tick >= w.until) a.prayWatch = null; }
      const why = Faith.trigger(sim, a); if (!why || a.needs.energy <= 0) { a.prayDue = 0; continue; }
      // the hourly roll runs every awake minute; the bout starts the next time she is free on a whole tile (within an hour)
      if (a.prayDue && sim.tick > a.prayDue) a.prayDue = 0;
      if (!a.prayDue && a.act.type !== "sleep" && sim.prng.chance(clamp(a.traits.faith / C.hourDiv * tm / 60 * (G.Moods ? G.Moods.prayerMult(a) : 1), 0, 1))) { a.prayDue = sim.tick + Math.round(60 / tm); sim.faith.stats.rolls = (sim.faith.stats.rolls || 0) + 1; }
      if (!a.prayDue || !Faith.free(a) || !G.Agent.whole(a)) continue; a.prayDue = 0;
      if (Faith.sourceClose(sim, a)) { sim.faith.stats.skippedSource++; continue; }
      Faith.start(sim, a, why);
    }
    Faith.seeMarkers(sim);
  };
  // start a bout: walk to a prayer spot within driftTiles first, else pray here
  Faith.start = function (sim, a, why, form) {
    const C = FC(), mins = sim.prng.int(C.boutMinutes[0], C.boutMinutes[1]); form = form || Faith.pickForm(sim, a);
    const pay = { form, why, mins };
    const sp = Faith.spotNear(sim, a.pos.x, a.pos.y, C.driftTiles);
    if (sp && Math.hypot(sp.x - a.pos.x, sp.y - a.pos.y) > C.spotTiles) {
      const c = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = sp.x + dx, y = sp.y + dy; if (G.World.walkable(sim.world, x, y) && !G.Agent.claimed(sim, a, x, y)) c.push([x, y, Math.hypot(x - a.pos.x, y - a.pos.y)]); }
      c.sort((p, q) => p[2] - q[2]);
      for (const [x, y] of c) if (G.Agent.walkTo(sim, a, x, y, "prayspot", { pray: pay })) { sim.faith.stats.drifts++; return true; }
    }
    return Faith.begin(sim, a, pay);
  };
  Faith.arriveSpot = function (sim, a) { const pay = a.act.pray; if (!pay) return false; return Faith.begin(sim, a, pay); };
  Faith.begin = function (sim, a, pay) {
    const C = FC(), acts = pay.form.split("+"), n = Math.max(1, Math.round(pay.mins / TM())), st = sim.faith.stats;
    a.act = { type: "pray", form: pay.form, acts, why: pay.why, t: 0, n, per: Math.max(1, Math.round(n / acts.length)) };
    const e = rec(a, pay.form); e.n++; e.last = sim.tick; st.bouts++;
    const R = reg(sim, pay.form); if (!(a.id in R.holders)) R.holders[a.id] = e.gen || 0; R.prayed[a.id] = (R.prayed[a.id] || 0) + 1; if (!R.first) R.first = { name: a.name, t: sim.tick };
    if (pay.why === "death") st.byDeath++; else { st.byNeed[pay.why] = (st.byNeed[pay.why] || 0) + 1; a.prayWatch = { need: pay.why, v: a.needs[pay.why], form: pay.form, until: sim.tick + Math.round(C.reinforceMinutes / TM()) }; }
    // what is actually done: an offering needs that thing in hand; facing the sun needs daylight
    const held = offerable(sim, a), done = acts.filter(s => { const [k, x] = s.split(":"); if (k === "offer") return held === x; if (s === "face:sun") return !G.Agent.isNight(sim.tick); if (s === "face:fire") return fireNear(sim, a); return true; });
    const shown = done.length ? done : ["still"];
    a.act.done = shown;
    const whyWord = pay.why === "death" ? (a.sawDeath && a.sawDeath.name ? "near where " + a.sawDeath.name + " died" : "") : Faith.whyTag(sim, a, pay.why);
    Faith.feed(sim, a, Faith.line(a, shown, whyWord), pay.why === "death" ? null : pay.why);
    const px = Math.round(a.pos.x), py = Math.round(a.pos.y);
    Faith.place(sim, px, py);
    Faith.onPrayAt(sim, a, px, py);
    Faith.watch(sim, a, pay.form);
    return true;
  };
  // each minute of a bout; the offering is set down when its turn comes. false = the bout is over
  Faith.stepPray = function (sim, a) {
    const act = a.act, i = Math.min(act.acts.length - 1, Math.floor(act.t / act.per)), s = act.acts[i];
    if (s.indexOf("offer:") === 0 && !act.offered) { const it = G.Items.held(sim, a); if (it && it.material === s.slice(6) && !it.lit) { a.carry = null; a.carryUntil = null; it.heldBy = null; it.x = Math.round(a.pos.x); it.y = Math.round(a.pos.y); it.offered = sim.tick; sim.faith.stats.offerings++; } act.offered = true; }
    act.t++; return act.t < act.n;
  };
  // onlookers within copyTiles may copy the form (learning copy rule: copyChance x curiosity/50, x1.25 group / x0.85 others, x2 child / x1.5 youth)
  Faith.watch = function (sim, a, form) {
    const C = FC(), L = G.data.config.learn, src = rec(a, form);
    for (const b of sim.agents) {
      if (b === a || b.act.type === "sleep" || Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y) > C.copyTiles) continue;
      if (b.prayForms && b.prayForms[form]) continue;
      const p = clamp(L.copyChance * b.traits.curiosity / 50 * (G.Social ? G.Social.copyFactor(a, b) : 1) * G.Learn.stageX(b, a) * (G.Moods ? G.Moods.copyMult(b, a) : 1), 0, 1);
      if (!sim.prng.chance(p)) continue;
      const e = rec(b, form); e.from = a.name; e.fromId = a.id; e.t = sim.tick; e.gen = (src.gen || 0) + 1; sim.faith.stats.copies++;
      const R = reg(sim, form); R.copies++; R.holders[b.id] = e.gen;
    }
  };
  // prayer places: a spot once spotMin prayers were made within spotTiles of it
  Faith.spotNear = function (sim, x, y, R) { let best = null, bd = Infinity; for (const s of sim.faith.spots) { const d = Math.hypot(s.x - x, s.y - y); if (d <= R && d < bd) { bd = d; best = s; } } return best; };
  Faith.spotKey = (x, y) => x + "," + y;
  Faith.spotId = (x, y) => "spot:" + x + "," + y;
  Faith.parseSpotId = id => { if (typeof id !== "string" || id.indexOf("spot:") !== 0) return null; const p = id.slice(5).split(","); return p.length === 2 ? { x: +p[0], y: +p[1] } : null; };
  Faith.byId = function (sim, id) {
    const p = Faith.parseSpotId(id); if (!p || !sim.faith) return null;
    return sim.faith.spots.find(s => s.x === p.x && s.y === p.y) || null;
  };
  // §33: light map marker once spotMin prayers land here (decorative; not a building)
  Faith.setMarker = function (sim, s) {
    if (!s || s.marker) return false;
    if (s.n < FC().spotMin) return false;
    s.marker = true;
    sim.faith.stats.markers = (sim.faith.stats.markers || 0) + 1;
    return true;
  };
  Faith.hasPersonal = (a, s) => !!(a.sacred || []).some(q => q.x === s.x && q.y === s.y);
  Faith.hasGroup = (g, s) => !!((g && g.sacred) || []).some(q => q.x === s.x && q.y === s.y);
  // personal + (if group has shared speech) group-known; shares to all living members
  Faith.knowSpot = function (sim, a, s) {
    if (!a || !s) return false;
    const L = a.sacred || (a.sacred = []);
    let added = false;
    if (!L.some(q => q.x === s.x && q.y === s.y)) { L.push({ x: s.x, y: s.y }); added = true; }
    const g = G.Social && G.Social.group(sim, a);
    const shared = g && G.Speech && G.Speech.groupWords(sim, g).length > 0;
    if (shared) {
      const K = g.sacred || (g.sacred = []);
      if (!K.some(q => q.x === s.x && q.y === s.y)) {
        K.push({ x: s.x, y: s.y });
        sim.faith.stats.groupKnown = (sim.faith.stats.groupKnown || 0) + 1;
        added = true;
      }
      for (const id of g.members) {
        const b = sim.agents.find(p => p.id === id); if (!b) continue;
        const M = b.sacred || (b.sacred = []);
        if (!M.some(q => q.x === s.x && q.y === s.y)) M.push({ x: s.x, y: s.y });
      }
      if (G.Social && G.Social.refreshNames) G.Social.refreshNames(sim);
    }
    return added;
  };
  Faith.onPrayAt = function (sim, a, x, y) {
    const s = Faith.spotNear(sim, x, y, FC().spotTiles); if (!s) return;
    Faith.knowSpot(sim, a, s);
  };
  // idle people who see a marked spot may learn it (and share via speech group)
  Faith.seeMarkers = function (sim) {
    if (!sim.faith) return; const R = FC().sacredSight || 8;
    for (const a of sim.agents) {
      if (a.act.type === "sleep") continue;
      for (const s of sim.faith.spots) {
        if (!s.marker) continue;
        if (Math.hypot(s.x - a.pos.x, s.y - a.pos.y) > R) continue;
        Faith.knowSpot(sim, a, s);
      }
    }
  };
  Faith.knownMarked = function (sim, a) {
    const g = G.Social && G.Social.group(sim, a), out = [], seen = new Set();
    const add = (x, y) => { const k = Faith.spotKey(x, y); if (seen.has(k)) return; const s = (sim.faith.spots || []).find(q => q.x === x && q.y === y); if (!s || !s.marker) return; seen.add(k); out.push(s); };
    for (const q of (a.sacred || [])) add(q.x, q.y);
    for (const q of (g && g.sacred) || []) add(q.x, q.y);
    return out;
  };
  // §33 idle drift toward a known sacred marker when Faith high or needs low (not starving / fleeing)
  Faith.maybeDriftSacred = function (sim, a) {
    if (!sim.faith || !Faith.free(a) || !G.Agent.whole(a)) return false;
    const C = FC();
    if (a.needs.fullness < 20 || a.needs.water < 20) return false;
    const faithHigh = (a.traits.faith || 0) >= (C.sacredFaith || 55);
    const floor = C.sacredNeeds || 45;
    const needsLow = ["fullness", "water", "warmth", "energy"].every(k => a.needs[k] >= floor);
    if (!faithHigh && !needsLow) return false;
    const R = C.driftTiles, known = Faith.knownMarked(sim, a);
    let best = null, bd = Infinity;
    for (const s of known) {
      const d = Math.hypot(s.x - a.pos.x, s.y - a.pos.y);
      if (d < 1.5 || d > R) continue;
      if (d < bd) { bd = d; best = s; }
    }
    if (!best) return false;
    if (!sim.prng.chance(C.sacredDrift == null ? 0.35 : C.sacredDrift)) return false;
    const c = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = best.x + dx, y = best.y + dy;
      if (G.World.walkable(sim.world, x, y) && !G.Agent.claimed(sim, a, x, y)) c.push([x, y, Math.hypot(x - a.pos.x, y - a.pos.y)]);
    }
    c.sort((p, q) => p[2] - q[2]);
    for (const [x, y] of c) if (G.Agent.walkTo(sim, a, x, y, "sacred")) {
      sim.faith.stats.sacredDrifts = (sim.faith.stats.sacredDrifts || 0) + 1;
      return true;
    }
    return false;
  };
  Faith.place = function (sim, x, y) {
    const C = FC(), F = sim.faith, s = Faith.spotNear(sim, x, y, C.spotTiles);
    if (s) { s.n++; s.last = sim.tick; Faith.setMarker(sim, s); return; }
    F.places.push({ x, y, t: sim.tick }); if (F.places.length > C.placesMax) F.places.splice(0, F.places.length - C.placesMax);
    const near = F.places.filter(p => Math.hypot(p.x - x, p.y - y) <= C.spotTiles);
    if (near.length >= C.spotMin) {
      const spot = { x, y, n: near.length, since: sim.tick, last: sim.tick, marker: false };
      F.spots.push(spot); F.places = F.places.filter(p => near.indexOf(p) < 0);
      Faith.setMarker(sim, spot);
    }
  };
  Faith.feed = function (sim, a, text, need) {
    const L = sim.prayers || (sim.prayers = []); L.push({ t: sim.tick, text, ids: [a.id], g: a.group == null ? null : a.group, need: need || null });
    const m = FC().feedMax; if (L.length > m) L.splice(0, L.length - m);
  };
  // §40 / v37 Bless (Prayers tab): a partial answer to one prayer row, never a full fix (config.bless). Tired: a little energy, capped below full.
  // Hungry: learns where the nearest ripe bush is (fullness untouched). Logs actions only. Returns what was given, or null.
  Faith.bless = function (sim, entry) {
    const B = G.data.config.bless, e = typeof entry === "number" ? (sim.prayers || [])[entry] : entry; if (!e || e.blessed != null) return null;
    const a = sim.agents.find(q => q.id === (e.ids || [])[0]); if (!a) return null;
    const out = { id: a.id, energy: 0, bush: null }, n = a.needs;
    if (n.energy < B.tiredBelow) { const to = Math.min(B.energyCap, n.energy + B.energyAdd); if (to > n.energy) { out.energy = Math.round((to - n.energy) * 1e9) / 1e9; n.energy = to; } }
    if (n.fullness < G.Agent.fullnessThreshold(a)) { let best = null;
      for (const b of sim.bushes) { if (!b.ripe) continue; const d = Math.hypot(b.x - a.pos.x, b.y - a.pos.y); if (d <= B.bushTiles && (!best || d < best.d)) best = { b, d }; }
      if (best) { a.knowledge = a.knowledge || {}; a.knowledge.bushes = a.knowledge.bushes || {}; a.knowledge.bushes[best.b.id] = { x: best.b.x, y: best.b.y, ripe: true, seen: sim.tick }; out.bush = best.b.id; } }
    if (B.happinessAdd && a.moods && a.moods.happiness != null) a.moods.happiness = Math.min(100, a.moods.happiness + B.happinessAdd);
    e.blessed = sim.tick;
    const parts = []; if (out.energy) parts.push("rises a little more rested"); if (out.bush != null) parts.push("turns toward a ripe bush nearby");
    G.Sim.log(sim, a.name + " " + (parts.length ? parts.join(" and ") : "lifts " + (a.sex === "m" ? "his" : "her") + " head and looks around"), a);
    return out;
  };
  // anyone within deathSeenTiles sees it (a sleeper finds the body on waking; the window is a day)
  Faith.onDeath = function (sim, a) {
    if (!sim.faith) return; const R = FC().deathSeenTiles;
    for (const b of sim.agents) if (b !== a && Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y) <= R) b.sawDeath = { t: sim.tick, name: a.name };
  };
  G.Faith = Faith;
})(this.GS = this.GS || {});
