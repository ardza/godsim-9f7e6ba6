// Steps 9-10: things on the ground (rock, stick, flint, bone), carrying, the physics of striking/rubbing/cutting, and the Discoveries record.
// Items are plain objects {id, kind:"item", material, form:"whole"|"shard", x, y, heldBy, props:{hardness, sharpness, dryness, durability, flex}}.
// Placement and every object roll use their own seeded stream sim.orng. Outcomes come only from the property numbers through config.physics.
(function (G) {
  const CF = () => G.data.config, OC = () => CF().objects, PH = () => CF().physics, M = () => G.data.materials, W = G.World, TM = () => CF().time.tickGameMinutes;
  const Items = {}, Physics = {}, Discoveries = {};
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), r1 = v => Math.round(v * 10) / 10;

  // ---------- items ----------
  // Step 26b: per-piece jitter ±10–20% of type base (hardness/sharpness/dryness/durability) + flex (wider per material).
  Items.jitterProps = function (material, rng) {
    const m = M()[material], O = OC(), jp = O.jitterPct || [0.10, 0.20], fj = (O.flexJitter || {})[material] || 5;
    const j1 = base => { const p = rng.range(jp[0], jp[1]) * (rng.chance(0.5) ? 1 : -1); return clamp(Math.round(base * (1 + p)), 0, 100); };
    return { hardness: j1(m.hardness), sharpness: j1(m.sharpness), dryness: j1(m.dryness), durability: j1(m.durability),
      flex: clamp(Math.round((m.flex == null ? 20 : m.flex) + rng.range(-fj, fj)), 0, 100) };
  };
  Items.create = function (sim, material, x, y, form, props) {
    const m = M()[material];
    return { id: sim.nextId++, kind: "item", material, form: form || "whole", x, y, heldBy: null,
      props: props || Items.jitterProps(material, sim.orng || { range: (a, b) => (a + b) / 2, chance: () => false }) };
  };
  Items.props = it => Object.assign({ burns: !!M()[it.material].burns }, it.props);
  Items.sharp = it => !!it && it.props.sharpness >= PH().sharpAt;   // Director (step 17): one shared threshold for every rule
  // name from the data: a broken piece with a keen edge is a "<material> shard", a blunt one is a "broken <material>"
  Items.matLabel = it => { if (it.lit) return "burning " + M()[it.material].label; const l = M()[it.material].label; return it.form === "shard" ? (Items.sharp(it) ? l + " shard" : "broken " + l) : l; };
  Items.baseLabel = it => M()[it.material].label;   // the material's own name, whole or broken
  Items.label = it => { const tl = G.Tools && G.Tools.labelOf(it); return tl ? "a " + tl : "a " + Items.matLabel(it); };
  Items.frame = it => (it.form === "shard" && G.data.artItems && G.data.artItems.indexOf(it.material + "_shard") >= 0) ? it.material + "_shard" : it.material;
  Items.byId = (sim, id) => sim.items.find(i => i.id === id) || null;
  Items.held = (sim, a) => a.carry != null ? Items.byId(sim, a.carry) : null;
  Items.at = (sim, x, y) => sim.items.filter(i => !i.heldBy && i.x === x && i.y === y);

  // Step 26b deposits by terrain: rocks on hill/mountain slopes (clusters); sticks on woods edges; flint in 1–3 river-bank clusters; reeds on river banks only (never mid-stream).
  Items.populate = function (sim) {
    const w = sim.world, T = G.data.T, rng = sim.orng, O = OC(); sim.items = sim.items || [];
    const near = (x, y, r, t) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (W.inb(w, x + dx, y + dy) && W.tile(w, x + dx, y + dy) === t) return true; return false; };
    const isWater = (x, y) => { const t = W.tile(w, x, y); return t === T.RIVER || t === T.LAKE; };
    // Prefer true river banks (1–2 tile land band); if a map has no river, flint/reed fall back to lake shore. Never mid-stream.
    const hasRiver = (() => { for (let i = 0; i < w.tiles.length; i++) if (w.tiles[i] === T.RIVER) return true; return false; })();
    const ok = {
      slope: (x, y) => W.walkable(w, x, y) && (W.hillAt(w, x, y) || (W.mountainAt && W.mountainAt(w, x, y) > 0)),
      woodsEdge: (x, y) => W.walkable(w, x, y) && near(x, y, 1, T.WOODS),
      riverBank: (x, y) => {
        if (!W.walkable(w, x, y) || isWater(x, y)) return false;
        if (hasRiver) return near(x, y, 1, T.RIVER) || near(x, y, 2, T.RIVER);
        return near(x, y, 1, T.LAKE) || near(x, y, 2, T.LAKE);
      }
    };
    const used = new Set(sim.agents.map(a => a.pos.x + "," + a.pos.y));
    function placeDeposits(mat) {
      const c = O[mat]; if (!c || !c.deposits) return;
      const where = ok[c.where] || (() => false), cand = [];
      for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (where(x, y)) cand.push([x, y]);
      if (!cand.length) return;
      rng.shuffle(cand);
      const nDep = rng.int(c.deposits[0], c.deposits[1]);
      const seeds = [];
      for (const [x, y] of cand) {
        if (seeds.length >= nDep) break;
        if (seeds.every(([sx, sy]) => Math.hypot(sx - x, sy - y) >= 5)) seeds.push([x, y]);
      }
      if (!seeds.length) seeds.push(cand[0]);
      for (const [sx, sy] of seeds) {
        const n = rng.int(c.size[0], c.size[1]);
        const local = cand.filter(([x, y]) => Math.hypot(x - sx, y - sy) <= 3);
        rng.shuffle(local);
        let placed = 0;
        for (const [x, y] of local) {
          if (placed >= n) break;
          const k = x + "," + y; if (used.has(k)) continue;
          used.add(k); sim.items.push(Items.create(sim, mat, x, y)); placed++;
        }
        // if cluster was thin, fill from any remaining candidates near seed
        if (placed < Math.max(1, Math.floor(c.size[0] / 2))) {
          for (const [x, y] of cand) {
            if (placed >= n) break;
            if (Math.hypot(x - sx, y - sy) > 4) continue;
            const k = x + "," + y; if (used.has(k)) continue;
            used.add(k); sim.items.push(Items.create(sim, mat, x, y)); placed++;
          }
        }
      }
    }
    for (const mat of ["rock", "stick", "flint", "reed"]) placeDeposits(mat);
  };

  // ---------- carrying (one thing at a time) ----------
  function pickables(sim, a) {
    const R = CF().person.sightTiles, out = [], taken = new Set(sim.agents.filter(b => b !== a && b.act.goal === "pickup").map(b => b.act.target));
    const kid = G.Family && G.Family.isChild(a), may = CF().child.carry;   // step 20: a child picks up only sticks and rocks (no flint, meat or bones)
    for (const it of sim.items) if (!it.heldBy && !it.lit && !taken.has(it.id) && (!kid || may.indexOf(it.material) >= 0) && Math.hypot(it.x - a.pos.x, it.y - a.pos.y) <= R) out.push({ id: it.id, x: it.x, y: it.y, d: Math.hypot(it.x - a.pos.x, it.y - a.pos.y) });
    if (!kid) for (const b of sim.bodies) if (b.stage === "bones" && !b.burial && (b.bonesLeft == null || b.bonesLeft > 0) && !taken.has(b.id) && Math.hypot(b.x - a.pos.x, b.y - a.pos.y) <= R) out.push({ id: b.id, x: b.x, y: b.y, d: Math.hypot(b.x - a.pos.x, b.y - a.pos.y), body: true });
    return out.sort((p, q) => p.d - q.d || p.id - q.id);
  }
  // idle curiosity: maybe walk over to the nearest thing in sight and pick it up. Returns true if she set off (or picked it up here).
  Items._pickables = pickables;   // for tests
  Items.maybePickUp = function (sim, a) {
    if (a.carry != null || !sim.orng.chance(OC().pickupChance * a.traits.curiosity / 50)) return false;
    for (const c of pickables(sim, a).slice(0, 3)) {
      if (c.d === 0) { pickUp(sim, a, c.id); Items.maybeTry(sim, a); return true; }
      if (G.Agent.claimed(sim, a, c.x, c.y)) continue;
      if (G.Agent.walkTo(sim, a, c.x, c.y, "pickup", { target: c.id })) return true; }
    return false;
  };
  function pickUp(sim, a, id) {
    let it = Items.byId(sim, id);
    if (!it) { const b = sim.bodies.find(q => q.id === id && q.stage === "bones"); if (!b) return false;     // a bone off a skeleton
      if (b.bonesLeft == null) b.bonesLeft = OC().bonesPerBody; if (b.bonesLeft <= 0) return false;
      it = Items.create(sim, "bone", b.x, b.y); sim.items.push(it); b.bonesLeft--;
      if (b.bonesLeft <= 0) b.gone = true;   // all its bones are carried off: the skeleton is no longer there as a body
      G.Sim.log(sim, a.name + " picks up a bone from " + b.name + "'s bones", [a, b]);
    } else { if (it.heldBy || Math.round(a.pos.x) !== it.x || Math.round(a.pos.y) !== it.y) return false; G.Sim.log(sim, a.name + " picks up " + Items.label(it), a);
      if (it.material === "reed") { const d = Discoveries.note(sim, a, "pickup", ["reed"], "reed in hand"); if (d) d.title = "First reed"; }
    }
    it.heldBy = a.id; a.carry = it.id; a.carryUntil = sim.tick + sim.orng.int(OC().carry[0], OC().carry[1]); if (it.lit) { a.carryUntil = it.lit + 1; it.lastBy = a.id; it.lastByName = a.name; if (sim.fireStats) { sim.fireStats.brandPickups = (sim.fireStats.brandPickups || 0) + 1; if (it.bolt) sim.fireStats.boltPickups = (sim.fireStats.boltPickups || 0) + 1; }
      const d = Discoveries.note(sim, a, "carried", ["burning stick"], "fire in hand"); if (d) d.title = "First lit stick carried"; }   /* step 23: the first carry of a lit stick, from the data */   /* step 19: a burning stick is kept until it burns out */ a.stats.pickups = (a.stats.pickups || 0) + 1;
    return true;
  }
  Items.pickUp = pickUp;
  Items.arrivePickup = (sim, a) => pickUp(sim, a, a.act.target);
  // put the held thing down on the tile she is on (or stepping onto)
  Items.drop = function (sim, a, why) {
    const it = Items.held(sim, a); a.carry = null; a.carryUntil = null; if (!it) return;
    it.heldBy = null; it.x = Math.round(a.pos.x); it.y = Math.round(a.pos.y);
    G.Sim.log(sim, a.name + " puts down the " + Items.matLabel(it), a);
  };
  Items.dropAll = (sim, a) => { if (a.carry != null) Items.drop(sim, a); };

  // ---------- physics: outcome of an action from the two property sets (no recipes) ----------
  // returns {results: [text], spark, broke: "held"|"target"|null, held: newProps, target: newProps, sharpened}
  Physics.outcome = function (action, held, target, rng) {
    const P = PH(), h = Object.assign({}, held), t = Object.assign({}, target), res = [], out = { results: res, spark: false, broke: null, held: h, target: t };
    if (action === "strike") {
      if (Math.min(h.hardness, t.hardness) >= P.spark.minHardness && Math.max(h.sharpness, t.sharpness) >= P.spark.minEdge && rng.chance(P.spark.chance)) { out.spark = true; res.push("spark"); }
      // the softer one may break
      const soft = h.hardness < t.hardness ? "held" : t.hardness < h.hardness ? "target" : null;
      if (soft) { const s = soft === "held" ? h : t, o = soft === "held" ? t : h, B = P.break;
        const p = Math.min(B.max, B.scale * (o.hardness - s.hardness) / 100 * (100 - s.durability) / 100);
        if (s.whole !== false && rng.chance(p)) { out.broke = soft; s.sharpness = Math.max(s.sharpness, Math.min(100, Math.round(s.hardness * B.edgeFromHardness))); s.durability = Math.round(s.durability * B.shardDurability); s.whole = false;
          res.push((soft === "held" ? "@held" : "@target") + " breaks" + (s.sharpness >= PH().sharpAt ? ": sharp shard" : "")); } }
    } else if (action === "rub") {
      const R = P.rub, gap = h.hardness - t.hardness;
      if (Math.abs(gap) < R.hardnessGap) { if (h.hardness <= R.warmMaxHardness && t.hardness <= R.warmMaxHardness && h.dryness >= R.warmMinDryness && t.dryness >= R.warmMinDryness) res.push("grows warm"); }
      else if (gap < 0) { if (h.hardness >= R.sharpenMinHardness && h.sharpness < Math.min(100, Math.round(h.hardness * P.break.edgeFromHardness))) { h.sharpness = Math.min(Math.round(h.hardness * P.break.edgeFromHardness), h.sharpness + R.sharpenBy); out.sharpened = true; res.push("@held grows keener"); }
        else { h.durability = Math.max(1, h.durability - R.wear); res.push("@held wears down"); } }
      else { t.durability = Math.max(1, t.durability - R.wear); res.push("@target is scratched"); }
    } else if (action === "cut") {
      const C = P.cut;
      if (h.sharpness >= C.minSharpness && h.hardness > t.hardness) { t.durability = Math.max(0, t.durability - C.wear);
        if (t.durability <= 0 && t.whole !== false) { out.broke = "target"; t.whole = false; t.durability = 10; res.push("@target is cut through"); } else res.push("@target is notched"); }
    }
    return out;
  };

  // An idle holder with nothing pressing may try an action on a thing lying within reach (walks there first). ~once per person per game day.
  Items.maybeTry = function (sim, a) {
    const O = OC(), it = Items.held(sim, a);
    if (!it || it.material === "meat" || sim.tick - (a.lastTry == null ? -1e9 : a.lastTry) < O.tryCooldown) return false;
    const c = sim.items.filter(i => !i.heldBy && Math.hypot(i.x - a.pos.x, i.y - a.pos.y) <= O.tryReach).sort((p, q) => Math.hypot(p.x - a.pos.x, p.y - a.pos.y) - Math.hypot(q.x - a.pos.x, q.y - a.pos.y) || p.id - q.id)[0];
    if (!c) return false;
    const action = sim.orng.pick(PH().actions);
    const tryP = O.tryChance * (G.Moods ? G.Moods.inventMult(a, action) : 1);
    if (!sim.orng.chance(clamp(tryP, 0, 1))) return false;
    a.lastTry = sim.tick;
    if (Math.round(a.pos.x) === c.x && Math.round(a.pos.y) === c.y && G.Agent.whole(a)) { startTry(sim, a, c, action); return true; }
    // stand on the thing's tile or next to it
    const spots = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [c.x + dx, c.y + dy]).filter(([x, y]) => W.walkable(sim.world, x, y) && !G.Agent.claimed(sim, a, x, y));
    for (const [x, y] of spots) if (G.Agent.walkTo(sim, a, x, y, "try", { target: c.id, action })) return true;
    return false;
  };
  function startTry(sim, a, target, action) { a.act = { type: "try", target: target.id, action, t: 0, n: Math.max(1, Math.round(OC().tryMinutes / TM())) }; }
  Items.arriveTry = function (sim, a) { const t = Items.byId(sim, a.act.target), it = Items.held(sim, a);
    if (!t || t.heldBy || !it || Math.hypot(t.x - a.pos.x, t.y - a.pos.y) > 1.5) return false; startTry(sim, a, t, a.act.action); return true; };
  // the try action itself: after tryMinutes the outcome is applied, logged, and checked for a Discoveries first
  Items.stepTry = function (sim, a) {
    const act = a.act; if (++act.t < act.n) return true;
    const it = Items.held(sim, a), t = Items.byId(sim, act.target);
    if (!it || !t || t.heldBy) return false;
    const hp = Object.assign({ whole: it.form === "whole" }, it.props), tp = Object.assign({ whole: t.form === "whole" }, t.props);
    const hl = Items.matLabel(it), tl = Items.matLabel(t), o = Physics.outcome(act.action, hp, tp, sim.orng);
    const st = sim.physStats || (sim.physStats = { tries: 0, byAction: {}, sparks: 0, shards: 0, breaks: 0, results: {} });
    st.tries++; st.byAction[act.action] = (st.byAction[act.action] || 0) + 1;
    const apply = (item, np) => { item.props = { hardness: np.hardness, sharpness: np.sharpness, dryness: np.dryness, durability: np.durability, flex: item.props.flex != null ? item.props.flex : (M()[item.material].flex || 0) }; if (np.whole === false) item.form = "shard"; };
    apply(it, o.held); apply(t, o.target);
    const verb = { strike: "strikes", rub: "rubs", cut: "cuts at" }[act.action], combo = act.action === "cut" ? verb + " " + tl + " with " + hl : verb + " " + hl + " on " + tl;
    if (o.results.length) {
      const words = o.results.map(r => r.replace("@held", hl).replace("@target", tl));
      G.Sim.log(sim, a.name + " " + combo + ": " + words.join(", "), a);
      // Discoveries key on base materials (a broken stick is a stick) in any order (flint on rock = rock on flint)
      const bh = Items.baseLabel(it), bt = Items.baseLabel(t), bwords = o.results.map(r => r.replace("@held", bh).replace("@target", bt));
      bwords.forEach(w => Discoveries.note(sim, a, act.action, [bh, bt], w));
      for (const w of words) { st.results[act.action + " " + hl + " / " + tl + ": " + w] = (st.results[act.action + " " + hl + " / " + tl + ": " + w] || 0) + 1; }
      if (o.spark) { st.sparks++; G.Fire.spark(sim, t.x, t.y, a, { action: act.action, held: bh, target: bt }); }
      if (o.broke) { st.breaks++; if ((o.broke === "held" ? it : t).props.sharpness >= PH().sharpAt) st.shards++;
        if (G.Moods && G.Moods.dominant(a) === "anger") { const br = G.Moods.breakMult(a), piece = o.broke === "held" ? it : t;
          if (piece.props.sharpness > 0) piece.props.sharpness = Math.min(100, Math.round(piece.props.sharpness * br)); }
      }
    } else st.results[act.action + " " + hl + " / " + tl + ": nothing"] = (st.results[act.action + " " + hl + " / " + tl + ": nothing"] || 0) + 1;
    if (G.Tools) G.Tools.onTry(sim, a, act.action, it, t, o);
    return false;
  };

  // ---------- Discoveries: each first-ever combination of action + materials + result, detected from what happened ----------
  // the key ignores the order of the materials (sorted); callers pass base material names (Items.baseLabel), so a broken stick counts as a stick
  Discoveries.key = (action, mats, result) => [action].concat(mats.slice().sort(), [result]).join("|");
  Discoveries.note = function (sim, who, action, mats, result) {
    sim.discoveries = sim.discoveries || []; const key = Discoveries.key(action, mats, result);
    if (sim.discoveries.some(d => d.key === key)) return null;
    const d = { n: sim.discoveries.length + 1, key, action, materials: mats.slice(), result, who: who.name, whoId: who.id, tick: sim.tick, group: G.Social ? G.Social.groupName(sim, G.Social.group(sim, who)) : "" };   // step 18: her group at the time, if any
    sim.discoveries.push(d);
    // her own log gets a "first" line (not the main log, where the action line already shows it)
    if (who.id != null) G.Sim.plogAdd(sim, who.id, { t: sim.tick, text: who.name + " was the first to see it: " + action + " " + mats.join(" / ") + " \u2192 " + result, ids: [who.id], k: "disc" });
    return d;
  };

  G.Items = Items; G.Physics = Physics; G.Discoveries = Discoveries;
})(this.GS = this.GS || {});
