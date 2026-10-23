// Canvas renderer. Terrain is pre-drawn once per world into an offscreen canvas; water shimmer,
// bushes, people, selection and night shading are drawn every frame. Optional PNGs from data/art.js.
(function (G) {
  const R = {}, H = G.RNG.hash2;
  let cv, cx, terrain, tp, sc = 1, mw = 0, mh = 0, art = { tiles: {} }, artPending = 0;

  function loadImg(src, cb) { if (!src) return; const im = new Image(); artPending++; im.onload = () => { artPending--; cb(im); R.dirty = true; }; im.onerror = () => { artPending--; console.warn("art missing: " + src); }; im.src = src; }
  R.loadArt = function () {
    const A = G.data.art || {};
    for (const [k, src] of Object.entries(A.tiles || {})) loadImg(src, im => art.tiles[k] = im);
    if (A.person && A.person.src) loadImg(A.person.src, im => art.person = im);
    if (A.founders && A.founders.src) loadImg(A.founders.src, im => art.founders = im);
    loadImg(A.bush, im => art.bush = im); loadImg(A.bushEmpty, im => art.bushEmpty = im);
    for (const k of ["body", "grazer", "scavenger", "items", "fx", "food", "carcass", "smoke"]) if (A[k] && A[k].src) loadImg(A[k].src, im => art[k] = im);
  };
  R.art = () => art;

  R.init = function (canvas) {
    const M = G.data.config.map;
    cv = canvas; cx = cv.getContext("2d"); tp = M.tilePx; sc = Math.max(1, Math.round(M.renderScale || 1));
    mw = M.w * tp; mh = M.h * tp; cv.width = mw * sc; cv.height = mh * sc; cx.imageSmoothingEnabled = false; view.bw = mw; view.bh = mh;
    R.loadArt();
  };

  // ---- view (zoom + pan). View state only: never saved, never touches the sim. ----
  // z = whole-number zoom (1 = whole map fits, up to render.zoom.max); ox, oy = top-left of the visible area in art px.
  // bw, bh = the art-px window shown at z = 1: the whole map, or (phone portrait with the Log closed) a full-height slice shaped like the canvas
  const view = R.view = { z: 1, ox: 0, oy: 0, bw: 0, bh: 0 };
  const ZC = () => G.data.config.render.zoom;
  function clampView() { view.ox = Math.max(0, Math.min(mw - view.bw / view.z, view.ox)); view.oy = Math.max(0, Math.min(mh - view.bh / view.z, view.oy)); }
  // step zoom by whole numbers, keeping the map point under canvas fraction (fx, fy) fixed
  R.zoomTo = function (z, fx, fy) {
    z = Math.max(1, Math.min(ZC().max, Math.round(z))); if (fx === undefined) { fx = 0.5; fy = 0.5; }
    const wx = view.ox + fx * view.bw / view.z, wy = view.oy + fy * view.bh / view.z;
    view.z = z; view.ox = wx - fx * view.bw / z; view.oy = wy - fy * view.bh / z; clampView(); return z;
  };
  R.zoomBy = (d, fx, fy) => R.zoomTo(view.z + d, fx, fy);
  // pan by a drag of (dx, dy) CSS px on the canvas
  R.panBy = function (dx, dy) { const r = cv.getBoundingClientRect(); view.ox -= dx / r.width * view.bw / view.z; view.oy -= dy / r.height * view.bh / view.z; clampView(); };
  R.resetView = () => { view.z = 1; view.ox = 0; view.oy = 0; clampView(); };
  // canvas shape changed (Log opened/closed): aspect = canvas w/h, or null for the whole 3:2 map. Keeps the view centre, zoom and the pan clamp.
  R.setViewport = function (aspect) {
    const bw = aspect && aspect < mw / mh ? Math.max(tp, Math.round(mh * aspect)) : mw, bh = mh;
    if (bw === view.bw && bh === view.bh) return false;
    const cxw = view.ox + view.bw / (2 * view.z); view.bw = bw; view.bh = bh; view.ox = cxw - bw / (2 * view.z);
    cv.width = bw * sc; cv.height = bh * sc; cx.imageSmoothingEnabled = false; clampView(); return true;
  };
  R.frac = (clientX, clientY) => { const r = cv.getBoundingClientRect(); return { fx: (clientX - r.left) / r.width, fy: (clientY - r.top) / r.height }; };

  // per-person walk animation, render-only: step frame advances with distance actually drawn, not with time
  const anim = {}; R.anim = anim;

  function drawTerrain(w) {
    terrain = document.createElement("canvas"); terrain.width = mw; terrain.height = mh;
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

  // Fallback when founders_16.png is missing: the single person sheet, tinted per look in code (cached per look).
  const tinted = {};
  function tintedPerson(look) {
    if (tinted[look]) return tinted[look];
    const im = art.person, c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const g = c.getContext("2d"); g.drawImage(im, 0, 0); g.globalCompositeOperation = "source-atop";
    g.fillStyle = "hsla(" + (look * 45) % 360 + ",70%,50%,0.35)"; g.fillRect(0, 0, c.width, c.height);
    return (tinted[look] = c);
  }
  // small pixel 'z' over a sleeper, bobbing slowly
  function drawZ(px, py, time) {
    const b = Math.round(Math.sin(time * 2) * 1.5), X = px + 11, Y = py - 5 + b; cx.fillStyle = "rgba(0,0,0,0.55)"; cx.fillRect(X - 1, Y - 1, 6, 6);
    cx.fillStyle = "#f1e6cf"; cx.fillRect(X, Y, 4, 1); cx.fillRect(X + 2, Y + 1, 1, 1); cx.fillRect(X + 1, Y + 2, 1, 1); cx.fillRect(X, Y + 3, 4, 1);
  }
  function drawPerson(a, x, y, frame, facing, time) {
    const px = x * tp, py = y * tp, F = G.data.art.founders, A = G.data.art.person, asleep = a.act.type === "sleep";
    cx.fillStyle = "rgba(0,0,0,0.3)"; cx.beginPath(); cx.ellipse(px + 8, py + 14, asleep ? 6.5 : 4.5, 2, 0, 0, 7); cx.fill();
    const grp = G.Social && G.Social.group(R.sim, a);   // step 18: a small ring in the group colour under her feet (loners: none)
    if (grp) { cx.strokeStyle = G.Social.color(R.sim, grp); cx.lineWidth = 1.5; cx.beginPath(); cx.ellipse(px + 8, py + 14, asleep ? 7.5 : 6, 2.6, 0, 0, 7); cx.stroke(); cx.lineWidth = 1; }
    if (art.founders && F) {   // Artist founders: look block at x = blockW * (look mod variants); sleep row while asleep
      const row = asleep ? F.rows.indexOf("sleep") : Math.max(0, F.rows.indexOf(facing)), fr = asleep ? 0 : frame % F.frames, bx = ((a.look || 0) % F.variants) * F.blockW;
      cx.drawImage(art.founders, bx + fr * F.frame, row * F.frame, F.frame, F.frame, px, py - 2, tp, tp);
      if (asleep) drawZ(px, py, time); return;
    }
    if (art.person && A) {
      const row = Math.max(0, A.rows.indexOf(asleep ? "down" : facing)), fr = asleep ? 0 : frame % A.frames, im = tintedPerson(a.look || 0);
      if (asleep) { cx.save(); cx.translate(px + 8, py + 9); cx.rotate(-Math.PI / 2); cx.drawImage(im, fr * A.frame, row * A.frame, A.frame, A.frame, -8, -8, tp, tp); cx.restore(); drawZ(px, py, time); return; }
      cx.drawImage(im, fr * A.frame, row * A.frame, A.frame, A.frame, px, py - 2, tp, tp); return;
    }
    if (asleep) { cx.fillStyle = "hsl(" + ((a.look || 0) * 45) % 360 + ",45%,42%)"; cx.fillRect(px + 3, py + 9, 9, 4); cx.fillStyle = "#c89268"; cx.fillRect(px + 11, py + 8, 4, 4); drawZ(px, py, time); return; }
    const bob = frame % 2 ? 1 : 0, hue = ((a.look || 0) * 45) % 360;
    cx.fillStyle = "#3b2a1e"; cx.fillRect(px + 5, py + 11 + bob, 2, 3); cx.fillRect(px + 9, py + 11 - bob, 2, 3); // legs
    cx.fillStyle = "hsl(" + hue + ",45%,42%)"; cx.fillRect(px + 4, py + 6, 8, 6); // tunic
    cx.fillStyle = "#c89268"; cx.fillRect(px + 5, py + 1, 6, 5); // head
    cx.fillStyle = "#3a2414"; cx.fillRect(px + 5, py + 1, 6, 2); // hair
    if (facing !== "up") { cx.fillStyle = "#1c120a"; const ex = facing === "left" ? 5 : facing === "right" ? 8 : 6; cx.fillRect(px + ex, py + 4, 1, 1); if (facing === "down") cx.fillRect(px + 9, py + 4, 1, 1); }
  }

  // Bodies: one frame per stage (fresh / rotting / bones); code fallback when body_stages_16.png is missing.
  function drawBody(b, sel) {
    const px = b.x * tp, py = b.y * tp, B = G.data.art.body;
    if (sel) { cx.strokeStyle = "#fff6b0"; cx.lineWidth = 1.5; cx.strokeRect(px + 0.5, py + 0.5, tp - 1, tp - 1); cx.lineWidth = 1; }
    if (b.stage === "bones") cx.globalAlpha = 0.45 + 0.55 * b.condition / 100;   // weathering fades them slowly over the years
    if (b.species) {   // step 16: a killed grazer: fresh -> picked (meat taken or rotting) -> bones
      const C = G.data.art.carcass, col = G.Body.carcassFrame(b);
      if (art.carcass && C) cx.drawImage(art.carcass, Math.max(0, C.cols.indexOf(col)) * C.frame, 0, C.frame, C.frame, px, py, tp, tp);
      else { cx.fillStyle = col === "bones" ? "#e8e0c8" : col === "fresh" ? "#8a6a44" : "#7a3a2a"; cx.fillRect(px + 3, py + 8, 10, col === "bones" ? 2 : 4); }
      cx.globalAlpha = 1; return; }
    if (art.body && B) cx.drawImage(art.body, Math.max(0, B.cols.indexOf(b.stage)) * B.frame, 0, B.frame, B.frame, px, py, tp, tp);
    else if (b.stage === "bones") { cx.fillStyle = "#e8e0c8"; cx.fillRect(px + 3, py + 9, 10, 1); cx.fillRect(px + 4, py + 7, 1, 5); cx.fillRect(px + 7, py + 7, 1, 5); cx.fillRect(px + 10, py + 7, 1, 5); cx.fillRect(px + 12, py + 7, 3, 3); }
    else { cx.fillStyle = "rgba(0,0,0,0.3)"; cx.beginPath(); cx.ellipse(px + 8, py + 12, 7, 2.5, 0, 0, 7); cx.fill();
      cx.fillStyle = b.stage === "fresh" ? "hsl(" + ((b.look || 0) * 45) % 360 + ",35%,38%)" : "#5b5a3a"; cx.fillRect(px + 2, py + 8, 10, 4);
      cx.fillStyle = b.stage === "fresh" ? "#b08868" : "#7d7a52"; cx.fillRect(px + 11, py + 7, 4, 4); }
    cx.globalAlpha = 1;
  }
  // Animals: sheet rows by facing, 2 walk frames; code fallback = a small body shape.
  function drawAnimal(a, x, y, frame, facing) {
    const px = x * tp, py = y * tp, A = G.data.art[a.species], im = art[a.species], gz = a.species === "grazer";
    cx.fillStyle = "rgba(0,0,0,0.3)"; cx.beginPath(); cx.ellipse(px + 8, py + 14, gz ? 5.5 : 4, 1.8, 0, 0, 7); cx.fill();
    if (im && A) { cx.drawImage(im, (frame % A.frames) * A.frame, Math.max(0, A.rows.indexOf(facing)) * A.frame, A.frame, A.frame, px, py - 1, tp, tp); return; }
    const bob = frame % 2 ? 1 : 0, side = facing === "left" || facing === "right", dir = facing === "left" ? -1 : 1;
    cx.fillStyle = gz ? "#8a6a44" : "#5a5550";
    if (side) { cx.fillRect(px + 3, py + (gz ? 7 : 9), 10, gz ? 5 : 4); cx.fillRect(px + (dir > 0 ? 12 : 1), py + (gz ? 5 : 8), 3, 3);
      cx.fillRect(px + 4, py + 12 + bob, 1, 2); cx.fillRect(px + 11, py + 12 - bob, 1, 2); }
    else { cx.fillRect(px + 5, py + (gz ? 4 : 7), 6, gz ? 9 : 6); cx.fillRect(px + 5, py + 13 + bob, 1, 1); cx.fillRect(px + 10, py + 13 - bob, 1, 1); }
    if (gz) { cx.fillStyle = "#e8dcc0"; cx.fillRect(px + (side ? (dir > 0 ? 12 : 2) : 7), py + (side ? 4 : 4), 2, 1); }
  }
  function animState(sim, a, x, y) {
    let st = anim[a.id]; if (!st || st.sim !== sim) st = anim[a.id] = { sim, x, y, dist: 0, frame: 0, facing: a.facing };
    const dx = x - st.x, dy = y - st.y, d = Math.hypot(dx, dy), walking = a.act.type === "walk";
    if (d > 2) st.dist = 0; else if (walking) st.dist += d;
    if (!walking) { st.dist = 0; st.facing = a.facing; }
    else if (d > 1e-6 && d <= 2) st.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    st.frame = walking ? Math.floor(st.dist * G.data.config.render.stepsPerTile) : 0; st.x = x; st.y = y; return st;
  }

  // ---- steps 9-12: items, fire, spark flashes ----
  function sheetCol(k, name) { const A = G.data.art[k]; return art[k] && A ? A.cols.indexOf(name) : -1; }
  function drawItemAt(it, px, py, size) {   // size 16 = on the ground, 8 = in the hand
    if (it.material === "meat") { const c2 = sheetCol("food", ({ raw: "raw", cooked: "cooked", charred: "burnt" })[G.Cook.of(it)]);   // step 17: raw / cooked / charred (the "burnt" frame)
      if (c2 >= 0) { cx.drawImage(art.food, c2 * 16, 0, 16, 16, px, py, size, size); return; }
      const f2 = size / 16; cx.fillStyle = "#a8383a"; cx.fillRect(px + 4 * f2, py + 7 * f2, 8 * f2, 5 * f2); return; }
    const c = sheetCol("items", G.Items.frame(it)), f = size / 16;
    if (c >= 0) { cx.drawImage(art.items, c * 16, 0, 16, 16, px, py, size, size); return; }
    const m = it.material, sh = it.form === "shard";   // code fallback: small shapes in earthy colours
    cx.fillStyle = { rock: "#7d766b", stick: "#7a5230", flint: "#3f4652", bone: "#e8e0c8" }[m] || "#999";
    const R2 = (x, y, w, h) => cx.fillRect(px + x * f, py + y * f, Math.max(1, w * f), Math.max(1, h * f));
    if (m === "stick") { if (sh) R2(5, 9, 6, 2); else { R2(2, 10, 12, 2); R2(9, 8, 2, 2); } }
    else if (m === "bone") { if (sh) { R2(6, 7, 2, 6); R2(7, 5, 1, 2); } else { R2(3, 9, 10, 2); R2(2, 8, 2, 4); R2(12, 8, 2, 4); } }
    else if (sh) { R2(6, 8, 4, 4); R2(7, 6, 2, 2); }
    else { R2(4, 7, 8, 6); R2(5, 6, 6, 1); cx.fillStyle = "rgba(255,255,255,0.25)"; R2(5, 7, 3, 1); }
  }
  R.drawItemAt = drawItemAt;
  function drawFx(name, px, py) {
    const c = sheetCol("fx", name); if (c >= 0) { cx.drawImage(art.fx, c * 16, 0, 16, 16, px, py, tp, tp); return; }
    if (name === "scorched_tile") { cx.fillStyle = "#3d3326"; cx.fillRect(px, py, tp, tp); cx.fillStyle = "#2a231a"; cx.fillRect(px + 3, py + 5, 4, 2); cx.fillRect(px + 9, py + 10, 3, 2); }
    else if (name === "ash") { cx.fillStyle = "#8f8a80"; cx.fillRect(px + 2, py + 6, 12, 6); cx.fillStyle = "#b8b2a6"; cx.fillRect(px + 4, py + 7, 4, 2); cx.fillRect(px + 9, py + 9, 3, 2); }
    else if (name === "ember") { cx.fillStyle = "#5a2a14"; cx.fillRect(px + 5, py + 9, 6, 3); cx.fillStyle = "#e0662a"; cx.fillRect(px + 6, py + 10, 2, 1); cx.fillRect(px + 9, py + 9, 1, 1); }
    else if (name === "spark") { cx.fillStyle = "#fff3b0"; cx.fillRect(px + 7, py + 3, 2, 10); cx.fillRect(px + 3, py + 7, 10, 2); cx.fillStyle = "#ffd25a"; cx.fillRect(px + 5, py + 5, 1, 1); cx.fillRect(px + 10, py + 10, 1, 1); cx.fillRect(px + 10, py + 5, 1, 1); cx.fillRect(px + 5, py + 10, 1, 1); }
    else { const b = name === "fire_1" ? 1 : 0; cx.fillStyle = "#c2401c"; cx.fillRect(px + 3, py + 6 + b, 10, 9 - b); cx.fillStyle = "#e88a2a"; cx.fillRect(px + 5, py + 4 - b, 6, 9); cx.fillStyle = "#f6d36a"; cx.fillRect(px + 7, py + 8, 2, 5); }
  }
  function drawFire(sim, time) {
    for (const k in sim.fire || {}) {
      const e = sim.fire[k], [x, y] = k.split(",").map(Number), px = x * tp, py = y * tp;
      if (e.s === "scorched") { drawFx("scorched_tile", px, py); continue; }
      if (e.s === "ash") { drawFx("scorched_tile", px, py); drawFx("ash", px, py); continue; }
      const fl = Math.floor(time * 3 + x * 3 + y) % 2, tree = G.World.tile(sim.world, x, y) === G.data.T.WOODS;
      if (e.s === "ember") { if (e.hold && tree && drawSmoke("smoulder_" + fl, px, py)) { drawSmoke("wisp_" + fl, px, py - tp); continue; } drawFx("ember", px, py); continue; }
      drawFx("scorched_tile", px, py); drawFx(Math.floor(time * 6 + x * 3 + y) % 2 ? "fire_1" : "fire_0", px, py);
      if (tree) drawSmoke("wisp_" + fl, px, py - tp);
    }
  }
  // smoke overlays (step 17 art): false when the sheet is missing, so the plain ember / fire fx stay as they were
  function drawSmoke(name, px, py) { const c = sheetCol("smoke", name); if (c < 0) return false; cx.globalAlpha = 0.85; cx.drawImage(art.smoke, c * 16, 0, 16, 16, px, py, tp, tp); cx.globalAlpha = 1; return true; }
  function drawSparks(sim, time) {   // a spark is a brief flash: shown for the tick it happens and the next, flickering
    for (const f of sim.fx || []) if (f.k === "spark" && sim.tick - f.t < 2 && Math.floor(time * 12) % 3) drawFx("spark", f.x * tp, f.y * tp - 4);
  }
  function drawItems(sim, selectedId) {
    for (const it of sim.items || []) { if (it.heldBy != null) continue;
      if (it.id === selectedId) { cx.strokeStyle = "#fff6b0"; cx.lineWidth = 1.5; cx.strokeRect(it.x * tp + 0.5, it.y * tp + 0.5, tp - 1, tp - 1); cx.lineWidth = 1; }
      drawItemAt(it, it.x * tp, it.y * tp, 16); }
  }

  // alpha = fraction of the way to the next tick (the main loop's tick accumulator), for smooth movement between ticks.
  // Position, step frame and facing are computed here only; the sim stays tick-based and deterministic.
  R.draw = function (sim, alpha, time, selectedId) {
    R.sim = sim;
    if (R.terrainFor !== sim.world || R.dirty) drawTerrain(sim.world);
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.fillStyle = "#000"; cx.fillRect(0, 0, cv.width, cv.height);
    const s = sc * view.z; cx.setTransform(s, 0, 0, s, -Math.round(view.ox * s), -Math.round(view.oy * s)); cx.imageSmoothingEnabled = false;
    cx.drawImage(terrain, 0, 0); drawWater(sim.world, time);
    drawFire(sim, time);
    for (const b of sim.bushes) drawBush(b);
    R.screen = {};
    drawItems(sim, selectedId);
    for (const b of sim.bodies || []) { R.screen[b.id] = { x: b.x, y: b.y }; drawBody(b, b.id === selectedId); }
    for (const a of sim.animals || []) {
      const p = sim.prev[a.id] || a.pos, x = p.x + (a.pos.x - p.x) * alpha, y = p.y + (a.pos.y - p.y) * alpha, st = animState(sim, a, x, y);
      R.screen[a.id] = { x, y };
      if (a.id === selectedId) { cx.strokeStyle = "#fff6b0"; cx.lineWidth = 1.5; cx.beginPath(); cx.ellipse(x * tp + 8, y * tp + 14, 7, 3, 0, 0, 7); cx.stroke(); cx.lineWidth = 1; }
      drawAnimal(a, x, y, st.frame, st.facing);
    }
    const spt = G.data.config.render.stepsPerTile;
    for (const a of sim.agents) {
      const p = sim.prev[a.id] || a.pos, x = p.x + (a.pos.x - p.x) * alpha, y = p.y + (a.pos.y - p.y) * alpha;
      R.screen[a.id] = { x, y };
      let st = anim[a.id]; if (!st || st.sim !== sim) st = anim[a.id] = { sim, x, y, dist: 0, frame: 0, facing: a.facing };
      const dx = x - st.x, dy = y - st.y, d = Math.hypot(dx, dy), walking = a.act.type === "walk";
      if (d > 2) st.dist = 0;                                  // a jump (load, test fast-forward): don't spin the legs
      else if (walking) st.dist += d;
      if (!walking) { st.dist = 0; st.facing = a.facing; }
      else if (d > 1e-6 && d <= 2) st.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
      st.frame = walking ? Math.floor(st.dist * spt) : 0;     // idle = standing frame
      st.x = x; st.y = y;
      if (a.id === selectedId) {
        const r = G.Agent.sight(a) * tp; cx.strokeStyle = "rgba(255,255,255,0.25)"; cx.setLineDash([4, 4]); cx.beginPath(); cx.arc(x * tp + 8, y * tp + 8, r, 0, 7); cx.stroke(); cx.setLineDash([]);
        cx.strokeStyle = "#fff6b0"; cx.lineWidth = 1.5; cx.beginPath(); cx.ellipse(x * tp + 8, y * tp + 14, 7, 3, 0, 0, 7); cx.stroke(); cx.lineWidth = 1;
        if (walking) { cx.strokeStyle = "rgba(255,246,176,0.45)"; cx.beginPath(); cx.moveTo(x * tp + 8, y * tp + 8); for (let i = a.act.i; i < a.act.path.length; i++) cx.lineTo(a.act.path[i][0] * tp + 8, a.act.path[i][1] * tp + 8); cx.stroke(); }
      }
      // shivering: a 1 px shake while cold and awake (render only)
      const shiver = a.needs.warmth != null && a.needs.warmth < 30 && a.act.type !== "sleep" ? (Math.floor(time * 18 + a.id) % 2 ? 1 : -1) / tp : 0;
      drawPerson(a, x + shiver, y, st.frame, st.facing, time);
      const held = G.Items && G.Items.held(sim, a);
      if (held && a.act.type !== "sleep") drawItemAt(held, Math.round((x + shiver) * tp + (st.facing === "left" ? 0 : 8)), Math.round(y * tp + 5), 8);   // half size over the hand
    }
    drawSparks(sim, time);
    const dk = G.Time.darkness(sim.tick); if (dk > 0) { cx.fillStyle = "rgba(8,14,40," + (dk * 0.55).toFixed(3) + ")"; cx.fillRect(0, 0, mw, mh); }
    cx.setTransform(1, 0, 0, 1, 0, 0);
  };

  // canvas client px -> tile coords (zoom/pan aware), and back (used by tests)
  R.toTile = function (clientX, clientY) { const f = R.frac(clientX, clientY); return { x: (view.ox + f.fx * view.bw / view.z) / tp, y: (view.oy + f.fy * view.bh / view.z) / tp }; };
  R.toClient = function (tx, ty) { const r = cv.getBoundingClientRect(); return { x: r.left + ((tx * tp - view.ox) * view.z / view.bw) * r.width, y: r.top + ((ty * tp - view.oy) * view.z / view.bh) * r.height }; };
  G.Render = R;
})(this.GS = this.GS || {});
