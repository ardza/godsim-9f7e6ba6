// Canvas renderer. Terrain is pre-drawn once per world into an offscreen canvas; water shimmer,
// bushes, people, selection and night shading are drawn every frame. Optional PNGs from data/art.js.
(function (G) {
  const R = {}, H = G.RNG.hash2;
  let cv, cx, terrain, tp, art = { tiles: {} }, artPending = 0;

  function loadImg(src, cb) { if (!src) return; const im = new Image(); artPending++; im.onload = () => { artPending--; cb(im); R.dirty = true; }; im.onerror = () => { artPending--; console.warn("art missing: " + src); }; im.src = src; }
  R.loadArt = function () {
    const A = G.data.art || {};
    for (const [k, src] of Object.entries(A.tiles || {})) loadImg(src, im => art.tiles[k] = im);
    if (A.person && A.person.src) loadImg(A.person.src, im => art.person = im);
    loadImg(A.bush, im => art.bush = im); loadImg(A.bushEmpty, im => art.bushEmpty = im);
  };
  R.art = () => art;

  R.init = function (canvas) {
    cv = canvas; cx = cv.getContext("2d"); tp = G.data.config.map.tilePx;
    cv.width = G.data.config.map.w * tp; cv.height = G.data.config.map.h * tp; cx.imageSmoothingEnabled = false;
    R.loadArt();
  };

  function drawTerrain(w) {
    terrain = document.createElement("canvas"); terrain.width = cv.width; terrain.height = cv.height;
    const g = terrain.getContext("2d"), TL = G.data.tiles, s = w.seed;
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
      const t = TL[G.World.tile(w, x, y)], px = x * tp, py = y * tp, im = art.tiles[t.key];
      if (im) { g.drawImage(im, px, py, tp, tp); continue; }
      g.fillStyle = t.color; g.fillRect(px, py, tp, tp);
      const r = k => H(x * 7 + k, y * 13 + k, s);
      if (t.key === "meadow") {
        g.fillStyle = t.fleck; for (let k = 0; k < 4; k++) g.fillRect(px + (r(k) * 15 | 0), py + (r(k + 9) * 14 | 0), 1, 2);
        if (r(50) < 0.06) { g.fillStyle = r(51) < 0.5 ? "#f2e27a" : "#e9a0c8"; g.fillRect(px + 4 + (r(52) * 8 | 0), py + 4 + (r(53) * 8 | 0), 2, 2); }
      } else if (t.key === "woods") {
        for (let k = 0; k < 2; k++) { const ox = px + 4 + r(k) * 8, oy = py + 4 + r(k + 5) * 8, rad = 3 + r(k + 11) * 2.5;
          g.fillStyle = "#2a5226"; g.beginPath(); g.arc(ox + 1, oy + 1.5, rad, 0, 7); g.fill();
          g.fillStyle = "#356b30"; g.beginPath(); g.arc(ox, oy, rad, 0, 7); g.fill();
          g.fillStyle = "#4d8a43"; g.beginPath(); g.arc(ox - rad / 3, oy - rad / 3, rad / 2.5, 0, 7); g.fill(); }
      } else if (t.key === "sand") {
        g.fillStyle = t.fleck; for (let k = 0; k < 5; k++) g.fillRect(px + (r(k) * 15 | 0), py + (r(k + 7) * 15 | 0), 1, 1);
      } else if (t.water) { // darker edge where water meets land
        g.fillStyle = "rgba(0,20,60,0.18)";
        for (const [a, b, rx, ry, rw, rh] of [[0, -1, 0, 0, tp, 2], [0, 1, 0, tp - 2, tp, 2], [-1, 0, 0, 0, 2, tp], [1, 0, tp - 2, 0, 2, tp]])
          if (G.World.walkable(w, x + a, y + b)) g.fillRect(px + rx, py + ry, rw, rh);
      }
    }
    R.terrainFor = w; R.dirty = false;
  }

  function drawWater(w, time) {
    const TL = G.data.tiles; cx.fillStyle = "rgba(220,240,255,0.35)";
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
      const t = TL[G.World.tile(w, x, y)]; if (!t.water) continue;
      const ph = H(x, y, 99) * 6.28, v = Math.sin(time * (t.key === "river" ? 2.2 : 1.1) + ph);
      if (v > 0.55) cx.fillRect(x * tp + 3 + (H(x, y, 5) * 7 | 0) + (t.key === "river" ? (time * 3 + ph) % 4 : 0), y * tp + 4 + (H(x, y, 6) * 8 | 0), 4, 1);
    }
  }

  function drawBush(b) {
    const px = b.x * tp, py = b.y * tp, im = b.ripe ? art.bush : art.bushEmpty;
    if (im) { cx.drawImage(im, px, py, tp, tp); return; }
    cx.fillStyle = "rgba(0,0,0,0.25)"; cx.beginPath(); cx.ellipse(px + 8, py + 13, 6, 2.5, 0, 0, 7); cx.fill();
    cx.fillStyle = "#2f6b2a"; cx.beginPath(); cx.arc(px + 8, py + 8, 6, 0, 7); cx.fill();
    cx.fillStyle = "#47913c"; cx.beginPath(); cx.arc(px + 6.5, py + 6.5, 3.5, 0, 7); cx.fill();
    if (b.ripe) for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28 + 0.4, rr = 3.5;   // code fallback: full = berries, empty = bare
      cx.fillStyle = "#c2203a"; cx.fillRect(px + 7 + Math.cos(a) * rr, py + 7 + Math.sin(a) * rr, 2, 2); }
  }

  function drawPerson(a, x, y, time, moving) {
    const px = x * tp, py = y * tp, A = G.data.art.person;
    cx.fillStyle = "rgba(0,0,0,0.3)"; cx.beginPath(); cx.ellipse(px + 8, py + 14, 4.5, 2, 0, 0, 7); cx.fill();
    if (art.person && A) {
      const row = Math.max(0, A.rows.indexOf(a.facing)), fr = moving ? Math.floor(time * 4) % A.frames : 0;
      cx.drawImage(art.person, fr * A.frame, row * A.frame, A.frame, A.frame, px, py - 2, tp, tp); return;
    }
    const bob = moving ? Math.round(Math.sin(time * 10)) : 0, hue = (a.id * 67) % 360;
    cx.fillStyle = "#3b2a1e"; cx.fillRect(px + 5, py + 11 + bob, 2, 3); cx.fillRect(px + 9, py + 11 - bob, 2, 3); // legs
    cx.fillStyle = "hsl(" + hue + ",45%,42%)"; cx.fillRect(px + 4, py + 6, 8, 6); // tunic
    cx.fillStyle = "#c89268"; cx.fillRect(px + 5, py + 1, 6, 5); // head
    cx.fillStyle = "#3a2414"; cx.fillRect(px + 5, py + 1, 6, 2); // hair
    if (a.facing !== "up") { cx.fillStyle = "#1c120a"; const ex = a.facing === "left" ? 5 : a.facing === "right" ? 8 : 6; cx.fillRect(px + ex, py + 4, 1, 1); if (a.facing === "down") cx.fillRect(px + 9, py + 4, 1, 1); }
  }

  // alpha = fraction of the way to the next tick, for smooth movement between ticks
  R.draw = function (sim, alpha, time, selectedId) {
    if (R.terrainFor !== sim.world || R.dirty) drawTerrain(sim.world);
    cx.drawImage(terrain, 0, 0); drawWater(sim.world, time);
    for (const b of sim.bushes) drawBush(b);
    R.screen = {};
    for (const a of sim.agents) {
      const p = sim.prev[a.id] || a.pos, x = p.x + (a.pos.x - p.x) * alpha, y = p.y + (a.pos.y - p.y) * alpha;
      R.screen[a.id] = { x, y };
      if (a.id === selectedId) {
        const r = G.Agent.sight(a) * tp; cx.strokeStyle = "rgba(255,255,255,0.25)"; cx.setLineDash([4, 4]); cx.beginPath(); cx.arc(x * tp + 8, y * tp + 8, r, 0, 7); cx.stroke(); cx.setLineDash([]);
        cx.strokeStyle = "#fff6b0"; cx.lineWidth = 1.5; cx.beginPath(); cx.ellipse(x * tp + 8, y * tp + 14, 7, 3, 0, 0, 7); cx.stroke(); cx.lineWidth = 1;
        if (a.act.type === "walk") { cx.strokeStyle = "rgba(255,246,176,0.45)"; cx.beginPath(); cx.moveTo(x * tp + 8, y * tp + 8); for (let i = a.act.i; i < a.act.path.length; i++) cx.lineTo(a.act.path[i][0] * tp + 8, a.act.path[i][1] * tp + 8); cx.stroke(); }
      }
      drawPerson(a, x, y, time, a.act.type === "walk");
    }
    const d = G.Time.darkness(sim.tick); if (d > 0) { cx.fillStyle = "rgba(8,14,40," + (d * 0.55).toFixed(3) + ")"; cx.fillRect(0, 0, cv.width, cv.height); }
  };

  // canvas client px -> tile coords
  R.toTile = function (clientX, clientY) { const r = cv.getBoundingClientRect(); return { x: (clientX - r.left) / r.width * G.data.config.map.w, y: (clientY - r.top) / r.height * G.data.config.map.h }; };
  G.Render = R;
})(this.GS = this.GS || {});
