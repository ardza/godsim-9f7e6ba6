// §31 / v28: grazer hides. Skinned carcass leaves one hide; cold people may wear it or sleep under it.
// Warmth felt stacks with fire + shelter under shelter.capX × fire.heatC. First wear → Discoveries.
// Action-only logs. Soft mass item (not a tool).
(function (G) {
  const CF = () => G.data.config, HC = () => CF().hides || {}, TM = () => CF().time.tickGameMinutes;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), r2 = v => Math.round(v * 100) / 100;
  const Hides = {};

  Hides.newStats = () => ({ spawned: 0, worn: 0, slept: 0, dropped: 0 });
  Hides.init = function (sim) { sim.hideStats = Hides.newStats(); };
  const st = sim => sim.hideStats || (sim.hideStats = Hides.newStats());

  Hides.isHide = it => !!it && it.material === "hide";
  Hides.wearing = a => !!(a && a.wearingHide != null);
  Hides.wornItem = (sim, a) => a.wearingHide != null ? G.Items.byId(sim, a.wearingHide) : null;

  // One hide per grazer body, at the carcass when first meat is taken (skinning implied).
  Hides.maybeSpawn = function (sim, body) {
    if (!body || (HC().fromSpecies || ["grazer"]).indexOf(body.species) < 0 || body.hideSpawned) return null;   // v38 (f): wolves too
    body.hideSpawned = true;
    const it = G.Items.create(sim, "hide", body.x, body.y);
    it.from = body.id;
    sim.items.push(it);
    st(sim).spawned++;
    G.Sim.log(sim, "A hide lies by " + body.name + "'s carcass");
    return it;
  };

  Hides.nearGround = function (sim, a) {
    const R = HC().reachTiles != null ? HC().reachTiles : 1.5;
    let best = null, bd = 1e9;
    for (const it of sim.items) {
      if (!Hides.isHide(it) || it.heldBy || it.wornBy) continue;
      const d = Math.hypot(it.x - a.pos.x, it.y - a.pos.y);
      if (d <= R + 1e-9 && d < bd) { bd = d; best = it; }
    }
    return best;
  };

  Hides.carried = function (sim, a) {
    const it = G.Items.held(sim, a);
    return Hides.isHide(it) ? it : null;
  };

  Hides.cold = function (sim, a) {
    if (!a || !a.needs) return false;
    if (a.hypo && a.hypo >= 1) return true;
    const seek = G.Agent.warmthSeekBelow ? G.Agent.warmthSeekBelow(a) : (CF().person.warmth.seekBelow || 35);
    return a.needs.warmth < seek;
  };

  // Felt °C from worn / sleep-under hide; trimmed so fire+huddle+sleep+bond+den+hide stay under shelter.capX × fire.heatC
  Hides.warmC = function (sim, a, others) {
    const C = HC(), F = CF().fire.heatC, capX = (CF().shelter && CF().shelter.capX != null) ? CF().shelter.capX : 1.5;
    const cap = capX * F;
    let want = 0;
    if (Hides.wearing(a) && Hides.wornItem(sim, a)) want = C.wornC != null ? C.wornC : 8;
    else if (a.act && a.act.type === "sleep" && a.sleepHide != null) {
      const it = G.Items.byId(sim, a.sleepHide);
      if (it && !it.heldBy && !it.wornBy) want = C.sleepC != null ? C.sleepC : 6;
    }
    if (!(want > 0)) return 0;
    return r2(Math.max(0, Math.min(want, cap - Math.max(0, others || 0))));
  };

  Hides.wear = function (sim, a, it) {
    if (!a || !Hides.isHide(it) || Hides.wearing(a)) return false;
    if (it.heldBy === a.id) { a.carry = null; it.heldBy = null; }
    else if (it.heldBy || it.wornBy) return false;
    it.x = Math.round(a.pos.x); it.y = Math.round(a.pos.y);
    it.wornBy = a.id; a.wearingHide = it.id;
    st(sim).worn++;
    a.stats = a.stats || {}; a.stats.hideWear = (a.stats.hideWear || 0) + 1;
    G.Learn.add(a, "hide", HC().gainWear != null ? HC().gainWear : 10);
    G.Sim.log(sim, a.name + " " + (HC().logWear || "pulls the hide about her shoulders"), a);
    const d = G.Discoveries.note(sim, a, "wear", ["hide"], "shoulders warm");
    if (d) d.title = "First hide";
    return true;
  };

  Hides.dropWorn = function (sim, a) {
    if (!Hides.wearing(a)) return false;
    const it = Hides.wornItem(sim, a); a.wearingHide = null;
    if (it) { it.wornBy = null; it.x = Math.round(a.pos.x); it.y = Math.round(a.pos.y); }
    st(sim).dropped++;
    G.Sim.log(sim, a.name + " " + (HC().logDrop || "lets the hide fall from her shoulders"), a);
    return true;
  };

  Hides.sleepUnder = function (sim, a, it) {
    if (!a || !Hides.isHide(it) || it.heldBy || it.wornBy) return false;
    a.sleepHide = it.id;
    st(sim).slept++;
    a.stats = a.stats || {}; a.stats.hideSleep = (a.stats.hideSleep || 0) + 1;
    G.Learn.add(a, "hide", HC().gainSleep != null ? HC().gainSleep : 6);
    G.Sim.log(sim, a.name + " " + (HC().logSleep || "curls up under the hide"), a);
    // first wear Discoveries covers first use; sleep-under alone does not claim "First hide" unless never worn
    if (!a.stats.hideWear) {
      const d = G.Discoveries.note(sim, a, "wear", ["hide"], "slept under");
      if (d) d.title = "First hide";
    }
    return true;
  };

  Hides.clearSleep = function (a) { if (a) a.sleepHide = null; };

  // Idle / cold: try wear carried or ground hide; going to sleep near a ground hide may sleep under it.
  Hides.maybe = function (sim, a) {
    if (!a || !HC() || (G.Family && G.Family.isChild && G.Family.isChild(a))) return false;
    const C = HC(), every = Math.max(1, Math.round((C.tryEveryMinutes || 30) / TM()));
    if (a.hideTryAt != null && sim.tick - a.hideTryAt < every) return false;
    if (!Hides.cold(sim, a)) return false;
    a.hideTryAt = sim.tick;
    const score = G.Learn.score(a, "hide");
    const lock = C.scoreLock != null ? C.scoreLock : 45;
    if (score < lock) return false;
    const cur = (a.traits.curiosity != null ? a.traits.curiosity : 50) / 100;
    const fear = (a.traits.coldFear != null ? a.traits.coldFear : 50) / 100;
    const p = clamp((C.tryChance || 0.4) * (0.5 + cur) * (0.5 + fear), 0, 1);
    const rng = sim.lrng || sim.rng;
    if (!rng.chance(p)) return false;

    // Prefer wear: carried hide, else ground hide (pick up then wear if empty hands optional — wear from ground directly)
    if (!Hides.wearing(a)) {
      let it = Hides.carried(sim, a) || Hides.nearGround(sim, a);
      if (it && Hides.wear(sim, a, it)) return true;
    }
    // Sleep under: if about to sleep / already sleeping and not wearing, use a ground hide
    if ((a.act.type === "sleep" || a.act.type === "idle") && !Hides.wearing(a) && a.sleepHide == null) {
      const g = Hides.nearGround(sim, a);
      if (g && a.act.type === "sleep" && Hides.sleepUnder(sim, a, g)) return true;
      // idle and cold: start sleep under if energy wants rest — leave to normal sleep; tag when they sleep
    }
    return false;
  };

  // Call when a person begins sleep near a hide
  Hides.onSleep = function (sim, a) {
    if (!a || Hides.wearing(a) || a.sleepHide != null || !Hides.cold(sim, a)) return false;
    const score = G.Learn.score(a, "hide");
    if (score < (HC().scoreLock != null ? HC().scoreLock : 45)) return false;
    const g = Hides.nearGround(sim, a);
    if (!g) return false;
    const cur = (a.traits.curiosity != null ? a.traits.curiosity : 50) / 100;
    const fear = (a.traits.coldFear != null ? a.traits.coldFear : 50) / 100;
    const p = clamp((HC().tryChance || 0.4) * (0.5 + cur) * (0.5 + fear), 0, 1);
    if (!(sim.lrng || sim.rng).chance(p)) return false;
    return Hides.sleepUnder(sim, a, g);
  };

  Hides.step = function (sim) {
    for (const a of sim.agents) {
      // wake: clear sleep-under tag
      if (a.sleepHide != null && a.act.type !== "sleep") Hides.clearSleep(a);
      // worn hide stays with person
      if (Hides.wearing(a)) {
        const it = Hides.wornItem(sim, a);
        if (!it) { a.wearingHide = null; continue; }
        it.x = Math.round(a.pos.x); it.y = Math.round(a.pos.y);
        // deep heat: drop worn if somehow invalid
        if (it.wornBy !== a.id) it.wornBy = a.id;
      }
    }
  };

  G.Hides = Hides;
})(this.GS = this.GS || {});
