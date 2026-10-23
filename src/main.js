// Boot + main loop. Fixed sim tick (1 game minute) driven by an accumulator, rendering via requestAnimationFrame.
(function (G) {
  const T = () => G.data.config.time;
  const app = G.app = { sim: null, speed: 1, lastSpeed: 1, selected: null, acc: 0, ticksLastFrame: 0 };

  app.setSpeed = s => { if (s) app.lastSpeed = s; app.speed = s; G.UI.update(app); };
  app.select = id => { app.selected = id; if (id != null) G.UI.openSheet(true); G.UI.update(app); };
  app.save = manual => { const ok = G.Save.save(app.sim); if (manual) G.UI.toast(ok ? "Saved" : "Save failed"); return ok; };
  app.load = () => { const s = G.Save.load(); if (s) { app.sim = s; app.acc = 0; app.selected = null; G.UI.toast("Loaded"); } else G.UI.toast("No save"); G.UI.update(app); return !!s; };
  app.newWorld = seedText => {
    const seed = String(seedText || "").trim() ? G.RNG.seedFrom(seedText) : (Math.random() * 4294967296) >>> 0;
    app.sim = G.Sim.create(seed); app.acc = 0; app.selected = null; app.save(false); G.UI.toast("New world " + seed); G.UI.update(app);
  };
  app.clickTile = (tx, ty) => { // nearest person within ~1 tile of the tap
    let best = null; for (const a of app.sim.agents) { const p = (G.Render.screen && G.Render.screen[a.id]) || a.pos, d = Math.hypot(p.x + 0.5 - tx, p.y + 0.5 - ty); if (d < 1.3 && (!best || d < best.d)) best = { id: a.id, d }; }
    app.select(best ? best.id : null);
  };

  function boot() {
    G.Render.init(document.getElementById("cv"));
    const q = new URLSearchParams(location.search);
    app.sim = (!q.has("seed") && G.Save.load()) || G.Sim.create(q.has("seed") ? G.RNG.seedFrom(q.get("seed")) : (Math.random() * 4294967296) >>> 0);
    G.UI.init(app); G.UI.update(app);
    // the world pauses while closed: save on hide/close, continue from the saved tick on load (no catch-up)
    document.addEventListener("visibilitychange", () => { if (document.hidden) app.save(false); });
    window.addEventListener("pagehide", () => app.save(false));
    setInterval(() => app.save(false), T().autosaveRealSeconds * 1000);
    let last = performance.now(), uiT = 0;
    function frame(now) {
      const dt = Math.min(0.25, (now - last) / 1000); last = now;
      const perTick = G.Time.realSecondsPerTick(), max = T().maxTicksPerFrame;
      app.acc += dt * app.speed / perTick;
      let n = 0; while (app.acc >= 1 && n < max) { G.Sim.step(app.sim); app.acc -= 1; n++; }
      if (app.acc > 1) app.acc = 1; // can't keep up: drop time rather than spiral
      app.ticksLastFrame = n;
      G.Render.draw(app.sim, Math.min(1, app.acc), now / 1000, app.selected); // acc is kept while paused, so pausing never makes her jump
      if (now - uiT > 200) { uiT = now; G.UI.update(app); }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})(this.GS = this.GS || {});
