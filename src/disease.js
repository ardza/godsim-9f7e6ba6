// Step 28 Disease (save v25): lasting sick state. Energy drain ×1.5, Fullness drain ×1.25, 1–3 days.
// Seeded by raw meat / corpse eat, spread within spreadTiles, scavengers at rotting bodies (once/day).
// Recover via sleep / drink / cooked meat / berries / sit by fire. First recovery → Discoveries.
// Rare death while sick if Fullness and Water both under deathNeedBelow. Own stream drng.
// Action-only logs (watching style — never “I feel sick”).
(function (G) {
  const CF = () => G.data.config, DC = () => CF().disease || {}, TM = () => CF().time.tickGameMinutes;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), r2 = v => Math.round(v * 100) / 100;
  const Disease = {};

  Disease.newStats = () => ({ infected: 0, recovered: 0, deaths: 0, spreads: 0, seeds: 0, acute: 0 });
  Disease.init = function (sim) {
    sim.drng = new G.RNG((sim.seed ^ 0xD15EA5E) >>> 0);
    sim.diseaseStats = Disease.newStats();
  };
  Disease.ensureRng = function (sim) {
    if (!sim.drng) sim.drng = new G.RNG((sim.seed ^ 0xD15EA5E) >>> 0);
    if (!sim.diseaseStats) sim.diseaseStats = Disease.newStats();
    return sim.drng;
  };

  Disease.isSick = function (a) {
    return !!(a && a.sick && a.sick.until != null);
  };

  Disease.energyX = function (a) {
    return Disease.isSick(a) ? (DC().energyDrainX != null ? DC().energyDrainX : 1.5) : 1;
  };
  Disease.fullnessX = function (a) {
    return Disease.isSick(a) ? (DC().fullnessDrainX != null ? DC().fullnessDrainX : 1.25) : 1;
  };

  function dayOf(sim) { return G.Time.at(sim.tick).day; }

  Disease.log = function (sim, a, key, text) {
    const cool = Math.round((DC().logCoolMinutes || 360) / TM());
    const clk = a.sickLog || (a.sickLog = {});
    if (clk[key] != null && sim.tick - clk[key] < cool) return false;
    clk[key] = sim.tick;
    G.Sim.log(sim, text, a);
    return true;
  };

  // Infect (or refresh duration if already sick). source: "meat"|"corpse"|"spread"|"rot"
  Disease.infect = function (sim, a, source) {
    if (!a || a.kind !== "person") return false;
    Disease.ensureRng(sim);
    const C = DC(), days = C.durationDays || [1, 3];
    const d = sim.drng.range(days[0], days[1]);
    const until = sim.tick + Math.round(d * 1440);
    const was = Disease.isSick(a);
    a.sick = { until, from: source || "meat", recover: was && a.sick ? (a.sick.recover || 0) : 0, since: was && a.sick && a.sick.since != null ? a.sick.since : sim.tick };
    if (!was) {
      sim.diseaseStats.infected++;
      a.stats = a.stats || {}; a.stats.sick = (a.stats.sick || 0) + 1;
      const acute = C.acuteEnergy != null ? C.acuteEnergy : 20;
      a.needs.energy = Math.round(Math.max(0, a.needs.energy - acute) * 1e9) / 1e9;
      sim.diseaseStats.acute++;
      const line = source === "corpse" ? a.name + " doubles over after eating from the body"
        : source === "spread" ? a.name + " doubles over, catching what the others have"
        : source === "rot" ? a.name + " retches near the rotting body"
        : a.name + " retches after the meat";
      G.Sim.log(sim, line, a);
    }
    return true;
  };

  Disease.clear = function (sim, a, how) {
    if (!Disease.isSick(a)) return false;
    a.sick = null;
    sim.diseaseStats.recovered++;
    Disease.log(sim, a, "recover", a.name + " stands straighter, the sickness past");
    const d = G.Discoveries.note(sim, a, "recover", ["sickness"], how || "recovered");
    if (d) d.title = "First recovery";
    return true;
  };

  Disease.addRecover = function (sim, a, amt, how) {
    if (!Disease.isSick(a) || !(amt > 0)) return false;
    a.sick.recover = r2(clamp((a.sick.recover || 0) + amt, 0, 200));
    const at = DC().recoverAt != null ? DC().recoverAt : 100;
    if (a.sick.recover >= at) Disease.clear(sim, a, how || "recovered");
    return true;
  };

  Disease.onDrink = function (sim, a) {
    if (!Disease.isSick(a)) return;
    Disease.addRecover(sim, a, (DC().recover && DC().recover.drink) || 12, "drank while sick");
  };
  Disease.onEatBerries = function (sim, a) {
    if (!Disease.isSick(a)) return;
    Disease.addRecover(sim, a, (DC().recover && DC().recover.berries) || 10, "ate berries while sick");
  };
  Disease.onEatCooked = function (sim, a) {
    if (!Disease.isSick(a)) return;
    Disease.addRecover(sim, a, (DC().recover && DC().recover.cookedMeat) || 20, "ate cooked meat while sick");
  };
  Disease.onSitFire = function (sim, a) {
    if (!Disease.isSick(a)) return;
    const cool = Math.round((DC().fireSitCoolMinutes || 60) / TM());
    if (a.sick.fireSitAt != null && sim.tick - a.sick.fireSitAt < cool) return;
    a.sick.fireSitAt = sim.tick;
    Disease.addRecover(sim, a, (DC().recover && DC().recover.fireSit) || 8, "sat by fire while sick");
  };

  function groupHasDanger(sim, a) {
    if (!a || a.group == null || !sim.speech || !sim.speech.locks) return false;
    for (const k in sim.speech.locks) {
      const L = sim.speech.locks[k];
      if (L.group === a.group && L.meaning === "danger") return L;
    }
    return null;
  }

  function maybeDangerSpeech(sim, a) {
    const C = DC();
    if (!Disease.isSick(a) || a.needs.energy >= (C.dangerEnergyBelow != null ? C.dangerEnergyBelow : 30)) return;
    if (a.act && a.act.type === "sleep") return;
    const lock = groupHasDanger(sim, a); if (!lock) return;
    if (a.gesture && sim.tick < a.gesture.until) return;
    const p = (C.dangerChancePerHour != null ? C.dangerChancePerHour : 0.25) * TM() / 60;
    if (!sim.drng.chance(clamp(p, 0, 1))) return;
    // emit the locked danger token (Speech.emit handles quoted vs action-only)
    if (G.Speech && G.Speech.emit) G.Speech.emit(sim, a, lock.token, "danger");
  }

  function tryDeath(sim, a) {
    const C = DC(), below = C.deathNeedBelow != null ? C.deathNeedBelow : 20;
    if (a.needs.fullness >= below || a.needs.water >= below) return false;
    const p = (C.deathChancePerHour != null ? C.deathChancePerHour : 0.008) * TM() / 60;
    if (!sim.drng.chance(clamp(p, 0, 1))) return false;
    sim.diseaseStats.deaths++;
    G.Sim.die(sim, a, "sickness");
    return true;
  }

  function trySpread(sim) {
    const C = DC(), R = C.spreadTiles != null ? C.spreadTiles : 2, div = C.spreadDiv != null ? C.spreadDiv : 800;
    const sick = sim.agents.filter(Disease.isSick);
    if (!sick.length) return;
    for (const a of sim.agents) {
      if (Disease.isSick(a) || (a.act && a.act.type === "sleep")) continue;
      let near = false;
      for (const s of sick) {
        if (Math.hypot(s.pos.x - a.pos.x, s.pos.y - a.pos.y) <= R) { near = true; break; }
      }
      if (!near) continue;
      const cur = a.traits && a.traits.curiosity != null ? a.traits.curiosity : 50;
      const pHour = Math.max(0, (100 - cur) / div);
      if (!sim.drng.chance(clamp(pHour * TM() / 60, 0, 1))) continue;
      Disease.infect(sim, a, "spread");
      sim.diseaseStats.spreads++;
    }
  }

  function tryRotSeed(sim) {
    const C = DC(), R = C.seedTiles != null ? C.seedTiles : 2, ch = C.seedChance != null ? C.seedChance : 0.15;
    const rotting = (sim.bodies || []).filter(b => b.stage === "rotting" && (b.flesh == null || b.flesh > 0));
    if (!rotting.length) return;
    const scavNear = (b) => (sim.animals || []).some(an => an.species === "scavenger" && Math.hypot(an.pos.x - b.x, an.pos.y - b.y) <= R + 1);
    const day = dayOf(sim);
    for (const a of sim.agents) {
      if (Disease.isSick(a)) continue;
      if (a.sickSeedDay === day) continue;
      let hit = false;
      for (const b of rotting) {
        if (Math.hypot(a.pos.x - b.x, a.pos.y - b.y) > R) continue;
        if (!b.scavenged && !scavNear(b)) continue;
        hit = true; break;
      }
      if (!hit) continue;
      a.sickSeedDay = day; // once per day attempt (even if roll fails)
      if (!sim.drng.chance(ch)) continue;
      Disease.infect(sim, a, "rot");
      sim.diseaseStats.seeds++;
    }
  }

  Disease.step = function (sim) {
    if (!sim.agents) return;
    Disease.ensureRng(sim);
    const C = DC(), sleepPerMin = ((C.recover && C.recover.sleepPerHour) || 8) / 60;

    for (const a of sim.agents.slice()) {
      if (!Disease.isSick(a)) continue;
      // natural end
      if (sim.tick >= a.sick.until) { Disease.clear(sim, a, "time"); continue; }
      // sleep recovers
      if (a.act && a.act.type === "sleep") Disease.addRecover(sim, a, sleepPerMin * TM(), "slept while sick");
      // fire sit: idle near fire after sitFireAt recent
      if (a.sitFireAt != null && sim.tick - a.sitFireAt <= Math.round(30 / TM()) && a.act && (a.act.type === "idle" || a.act.goal === "fireside"))
        Disease.onSitFire(sim, a);
      if (!Disease.isSick(a)) continue;
      maybeDangerSpeech(sim, a);
      if (Disease.isSick(a)) tryDeath(sim, a);
    }
    trySpread(sim);
    tryRotSeed(sim);
  };

  G.Disease = Disease;
})(this.GS = this.GS || {});
