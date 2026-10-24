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
    for (const k of ["body", "grazer", "scavenger", "wolves", "items", "fx", "food", "carcass", "smoke", "baby", "child", "pray", "childPray", "gesture", "childGesture", "spot", "shelter", "rain", "rainLight", "rainHeavy", "lightning", "burial", "pyre", "ashBones", "reed", "reedBank", "mountain", "flake", "axe", "spear", "tools", "hide", "hideWorn"]) if (A[k] && A[k].src) loadImg(A[k].src, im => art[k] = im);
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
  // step 21b (People tab): put tile (x, y) in the middle of the view (zooming in to centerZoom first if at the whole-map view)
  // v19: fx / fy = where on the canvas (fractions, default the middle) the tile should land, e.g. the middle of the part a phone card does not cover
  R.centerOn = function (x, y, minZ, fx, fy) { if (minZ && view.z < minZ) view.z = Math.min(ZC().max, minZ); if (fx == null) fx = 0.5; if (fy == null) fy = 0.5;
    view.ox = (x + 0.5) * tp - fx * view.bw / view.z; view.oy = (y + 0.5) * tp - fy * view.bh / view.z; clampView(); };
  // v19 (step 24) Find: follow = a person id the camera keeps centred (until a pan / a tap elsewhere, see ui.js); pulse = { id, t0 (ms), ms }: their group ring
  // pulses brighter and bigger. View only, nothing saved. R.focusFrac (set by ui.js) = where on the canvas the person should sit.
  R.follow = null; R.pulse = null;
  R.pulsing = id => !!R.pulse && R.pulse.id === id && performance.now() - R.pulse.t0 < R.pulse.ms;
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
    // Step 26b: mountain rock-mass overlays (peak / upper_slope / foothill) + reed bank fringe on land beside river
    const MA = G.data.art.mountain, RA = G.data.art.reedBank;
    if (art.mountain && MA && w.mountain) {
      for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
        const lv = +w.mountain[y * w.w + x]; if (!lv) continue;
        const col = lv === 3 ? "peak" : lv === 2 ? "upper_slope" : "foothill", ci = MA.cols.indexOf(col);
        if (ci >= 0) g.drawImage(art.mountain, ci * MA.frame, 0, MA.frame, MA.frame, x * tp, y * tp, tp, tp);
      }
    }
    if (art.reedBank && RA) {
      const T = G.data.T, nearR = (x, y) => {
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if ((dx || dy) && G.World.inb(w, x + dx, y + dy) && G.World.tile(w, x + dx, y + dy) === T.RIVER) return true;
        return false;
      };
      for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
        if (!G.World.walkable(w, x, y) || !nearR(x, y)) continue;
        const ci = Math.abs(H(x, y, 77) * 3 | 0) % RA.cols.length;
        g.globalAlpha = 0.85; g.drawImage(art.reedBank, ci * RA.frame, 0, RA.frame, RA.frame, x * tp, y * tp, tp, tp); g.globalAlpha = 1;
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
    const grp = G.Social && G.Social.group(R.sim, a);   // step 18: a ring in the group colour under her feet (loners: none)
    const P = R.pulse && R.pulse.id === a.id ? Math.max(0, (R.time * 1000 - R.pulse.t0) / R.pulse.ms) : -1;   // (the frame clock can be a hair behind t0)
    if (P >= 0 && P < 1) {   // v19 Find: the same ring, bigger and brighter, pulsing (3 beats) for pulse.ms; a loner gets the selection colour
      const k = 0.5 - 0.5 * Math.cos(P * 6 * Math.PI), sc0 = 1 + (G.data.config.ui.find.ringScale - 1) * (0.4 + 0.6 * k), rx = 7 * sc0, ry = 3 * sc0 + 1, col = grp ? G.Social.color(R.sim, grp) : "#fff6b0";
      cx.strokeStyle = "rgba(0,0,0,.6)"; cx.lineWidth = 4; cx.beginPath(); cx.ellipse(px + 8, py + 14, rx, ry, 0, 0, 7); cx.stroke();
      cx.strokeStyle = col; cx.lineWidth = 3; cx.stroke(); cx.globalAlpha = 0.35 + 0.5 * k; cx.strokeStyle = "#fff"; cx.lineWidth = 1.5; cx.stroke(); cx.globalAlpha = 1; cx.lineWidth = 1;
      R.pulseDrawn = { id: a.id, scale: +sc0.toFixed(2), at: R.time, n: (R.pulseDrawn && R.pulseDrawn.id === a.id ? R.pulseDrawn.n : 0) + 1 };   // what was last drawn (read by the Chrome check)
    } else if (grp) {   // Director (call 7 on 18): dark outline first, then the colour on top, so it reads on any ground
      const rx = asleep ? 8.5 : 7, ry = asleep ? 3.4 : 3;
      cx.strokeStyle = "rgba(0,0,0,.55)"; cx.lineWidth = 3; cx.beginPath(); cx.ellipse(px + 8, py + 14, rx, ry, 0, 0, 7); cx.stroke();
      cx.strokeStyle = G.Social.color(R.sim, grp); cx.lineWidth = 2; cx.beginPath(); cx.ellipse(px + 8, py + 14, rx, ry, 0, 0, 7); cx.stroke(); cx.lineWidth = 1; }
    R.groupDot = grp && view.z === 1 ? G.Social.color(R.sim, grp) : null;   // zoom 1 only: a 3x3 dot above the head (drawn after the sprite)
    drawPersonBody(a, px, py, frame, facing, time, asleep, F, A);
    drawGestureOverlay(a, px, py);   // step 25: transparent gesture on the down-facing frame until the token is group speech
    if (R.groupDot) { const X = px + 6, Y = py - (asleep ? 0 : 6); cx.fillStyle = "rgba(0,0,0,.8)"; cx.fillRect(X, Y, 5, 5); cx.fillStyle = R.groupDot; cx.fillRect(X + 1, Y + 1, 3, 3); }
  }
  // step 25: Artist gesture_16 / child_gesture_16 — same origin as the person, one column per token; skip once group speech locks that token
  function drawGestureOverlay(a, px, py) {
    if (!G.Speech || !R.sim) return;
    const g = G.Speech.gestureNow(R.sim, a); if (!g) return;
    const kid = G.Family && G.Family.isChild(a), GA = G.data.art.gesture, im = kid ? art.childGesture : art.gesture;
    if (!im || !GA) return;
    const c = GA.cols.indexOf(g.col); if (c < 0) return;
    const row = (a.look || 0) % (GA.variants || 8);
    cx.drawImage(im, c * GA.frame, row * GA.frame, GA.frame, GA.frame, px, py - 2, tp, tp);
    R.lastGesture = g.col;
  }
  // step 21: the pose for the prayer action being done now (data/art.js pray.poses); null = not praying
  R.prayPose = function (a, time) {
    const act = a.act, P = G.data.art.pray; if (!act || act.type !== "pray" || !P) return null;
    const acts = act.done || act.acts, i = Math.min(acts.length - 1, Math.floor(act.t / (act.per || 1))), step = acts[Math.max(0, i)] || "still", k = step.split(":")[0];
    let col = (i > 0 && acts[i - 1] === "kneel" && P.afterKneel && P.afterKneel[k]) || P.poses[k] || "walk";
    if (Array.isArray(col)) col = col[Math.floor((time || 0) * 2) % col.length];
    // 'circle' and 'face' use the walk rows: circling turns down/right/up/left with the step frame; facing the fire turns toward it, the sun = away (up)
    let facing = null, frame = 0;
    if (k === "circle") { const q = Math.floor((time || 0) * 2); facing = ["down", "right", "up", "left"][q % 4]; frame = q; }
    else if (k === "face") { facing = "up";
      if (step === "face:fire" && R.sim && G.Learn && G.Learn.nearestFire) { const e = G.Learn.nearestFire(R.sim, a.pos.x, a.pos.y, ["ember", "fire"]);
        if (e && e.x != null) { const dx = e.x - a.pos.x, dy = e.y - a.pos.y; if (dx || dy) facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"); } } }
    return { step, col, item: k === "offer" ? step.slice(6) : null, facing, frame };
  };
  function drawPersonBody(a, px, py, frame, facing, time, asleep, F, A) {
    const kid = G.Family && G.Family.isChild(a), CA = G.data.art.child; R.lastKid = kid ? (art.child && CA ? "sheet" : "scaled") : R.lastKid;
    const pose = R.prayPose(a, time);
    if (pose && pose.col === "walk" && pose.facing) { facing = pose.facing; frame = pose.frame; R.lastPray = pose.step.split(":")[0] + ":" + facing; }
    if (pose && pose.col === "sleep") { asleep = true; R.lastPray = "still"; }   // lie still = the sleep row (no z)
    else if (pose && pose.col !== "walk") {
      const P = G.data.art.pray, im = kid ? art.childPray : art.pray, c = P.cols.indexOf(pose.col);
      if (im && c >= 0) { R.lastPray = pose.col; cx.drawImage(im, c * P.frame, ((a.look || 0) % P.variants) * P.frame, P.frame, P.frame, px, py - 2, tp, tp);
        if (pose.item) drawItemAt({ material: pose.item, form: "whole" }, px + 4, py + 7, 8);   // the offering held out in front
        return; }
    }
    if (pose && asleep) {   // lying still in prayer: the sleep row without the z
      const S = kid && art.child && CA ? [art.child, CA] : art.founders && F ? [art.founders, F] : null;
      if (S) { cx.drawImage(S[0], ((a.look || 0) % S[1].variants) * S[1].blockW, S[1].rows.indexOf("sleep") * S[1].frame, S[1].frame, S[1].frame, px, py - 2, tp, tp); return; }
    }
    if (kid && art.child && CA) {   // step 20: the Artist's child strip (same layout as founders)
      const row = asleep ? CA.rows.indexOf("sleep") : Math.max(0, CA.rows.indexOf(facing)), fr = asleep ? 0 : frame % CA.frames, bx = ((a.look || 0) % CA.variants) * CA.blockW;
      cx.drawImage(art.child, bx + fr * CA.frame, row * CA.frame, CA.frame, CA.frame, px, py - 2, tp, tp);
      if (asleep) drawZ(px, py, time); return;
    }
    if (kid) {   // no child strip: the adult figure at 75%, feet on the same line (bottom-centred)
      const k = 0.75, w = tp * k; cx.save(); cx.translate(px + (tp - w) / 2, py - 2 + (tp - w)); cx.scale(k, k);
      drawPersonBody(Object.assign({}, a, { age: 99 }), 0, 2, frame, facing, time, asleep, F, A); cx.restore(); return;
    }
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
    // step 26: burial / pyre / ash_bones overlays replace the normal body / bones draw
    const fr = G.Corpse && G.Corpse.frame(b);
    if (fr) {
      const A = G.data.art[fr.sheet], im = art[fr.sheet], col = fr.col;
      if (im && A) { const i = Math.max(0, A.cols.indexOf(col)); cx.drawImage(im, i * A.frame, 0, A.frame, A.frame, px, py, tp, tp); }
      else if (fr.sheet === "burial") { cx.fillStyle = col === "dug" ? "#5a4a32" : col === "cairn" ? "#8a8478" : "#6b5a3e"; cx.fillRect(px + 2, py + 8, 12, col === "dug" ? 3 : 5); if (col === "cairn") { cx.fillStyle = "#a8a090"; cx.fillRect(px + 5, py + 5, 6, 4); } }
      else if (fr.sheet === "pyre") { cx.fillStyle = col === "burning" ? "#c45a20" : col === "ash" ? "#8f8a80" : "#7a5230"; cx.fillRect(px + 2, py + 7, 12, 5); }
      else { cx.fillStyle = "#8f8a80"; cx.fillRect(px + 2, py + 8, 12, 4); cx.fillStyle = "#e8e0c8"; cx.fillRect(px + 4, py + 9, 2, 2); cx.fillRect(px + 9, py + 10, 2, 1); }
      cx.globalAlpha = 1; return;
    }
    if (b.stage === "bones") cx.globalAlpha = 0.45 + 0.55 * b.condition / 100;   // weathering fades them slowly over the years
    if (b.species) {   // step 16: a killed grazer: fresh -> picked (meat taken or rotting) -> bones
      const C = G.data.art.carcass, col = G.Body.carcassFrame(b);
      if (art.carcass && C) cx.drawImage(art.carcass, Math.max(0, C.cols.indexOf(col)) * C.frame, 0, C.frame, C.frame, px, py, tp, tp);
      else { cx.fillStyle = col === "bones" ? "#e8e0c8" : col === "fresh" ? "#8a6a44" : "#7a3a2a"; cx.fillRect(px + 3, py + 8, 10, col === "bones" ? 2 : 4); }
      cx.globalAlpha = 1; return; }
    if (b.baby && b.stage !== "bones") { cx.globalAlpha = b.stage === "fresh" ? 0.9 : 0.6; drawBaby(b, px, py, "lying"); cx.globalAlpha = 1; return; }   // step 19: a baby's body
    if (art.body && B) cx.drawImage(art.body, Math.max(0, B.cols.indexOf(b.stage)) * B.frame, 0, B.frame, B.frame, px, py, tp, tp);
    else if (b.stage === "bones") { cx.fillStyle = "#e8e0c8"; cx.fillRect(px + 3, py + 9, 10, 1); cx.fillRect(px + 4, py + 7, 1, 5); cx.fillRect(px + 7, py + 7, 1, 5); cx.fillRect(px + 10, py + 7, 1, 5); cx.fillRect(px + 12, py + 7, 3, 3); }
    else { cx.fillStyle = "rgba(0,0,0,0.3)"; cx.beginPath(); cx.ellipse(px + 8, py + 12, 7, 2.5, 0, 0, 7); cx.fill();
      cx.fillStyle = b.stage === "fresh" ? "hsl(" + ((b.look || 0) * 45) % 360 + ",35%,38%)" : "#5b5a3a"; cx.fillRect(px + 2, py + 8, 10, 4);
      cx.fillStyle = b.stage === "fresh" ? "#b08868" : "#7d7a52"; cx.fillRect(px + 11, py + 7, 4, 4); }
    cx.globalAlpha = 1;
  }
  // Animals: sheet rows by facing, 2 walk frames; code fallback = a small body shape.
  function drawAnimal(a, x, y, frame, facing) {
    const px = x * tp, py = y * tp, A = G.data.art[a.species], im = art[a.species], gz = a.species === "grazer", wk = a.species === "wolves";
    cx.fillStyle = "rgba(0,0,0,0.3)"; cx.beginPath(); cx.ellipse(px + 8, py + 14, gz ? 5.5 : 4, 1.8, 0, 0, 7); cx.fill();
    if (im && A) { cx.drawImage(im, (frame % A.frames) * A.frame, Math.max(0, A.rows.indexOf(facing)) * A.frame, A.frame, A.frame, px, py - 1, tp, tp); return; }
    const bob = frame % 2 ? 1 : 0, side = facing === "left" || facing === "right", dir = facing === "left" ? -1 : 1;
    cx.fillStyle = gz ? "#8a6a44" : wk ? "#4a4a55" : "#5a5550";
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
    if (it.material === "reed") { const c2 = sheetCol("reed", it.form === "shard" ? "reed" : "reed");
      if (c2 >= 0) { cx.drawImage(art.reed, c2 * 16, 0, 16, 16, px, py, size, size); return; }
      const f2 = size / 16; cx.fillStyle = "#5a7a3a"; cx.fillRect(px + 7 * f2, py + 3 * f2, 2 * f2, 11 * f2); cx.fillRect(px + 5 * f2, py + 5 * f2, 2 * f2, 2 * f2); return; }
    if (it.material === "hide") { const c2 = sheetCol("hide", "hide");
      if (c2 >= 0) { cx.drawImage(art.hide, c2 * 16, 0, 16, 16, px, py, size, size); return; }
      const f2 = size / 16; cx.fillStyle = "#8a6a48"; cx.fillRect(px + 3 * f2, py + 5 * f2, 10 * f2, 8 * f2); cx.fillStyle = "#6e5238"; cx.fillRect(px + 4 * f2, py + 6 * f2, 8 * f2, 2 * f2); return; }
    const c = sheetCol("items", G.Items.frame(it)), f = size / 16;
    if (c >= 0) { cx.drawImage(art.items, c * 16, 0, 16, 16, px, py, size, size); return; }
    const m = it.material, sh = it.form === "shard";   // code fallback: small shapes in earthy colours
    cx.fillStyle = { rock: "#7d766b", stick: "#7a5230", flint: "#3f4652", bone: "#e8e0c8", reed: "#5a7a3a", hide: "#8a6a48" }[m] || "#999";
    const R2 = (x, y, w, h) => cx.fillRect(px + x * f, py + y * f, Math.max(1, w * f), Math.max(1, h * f));
    if (m === "stick") { if (sh) R2(5, 9, 6, 2); else { R2(2, 10, 12, 2); R2(9, 8, 2, 2); } }
    else if (m === "bone") { if (sh) { R2(6, 7, 2, 6); R2(7, 5, 1, 2); } else { R2(3, 9, 10, 2); R2(2, 8, 2, 4); R2(12, 8, 2, 4); } }
    else if (sh) { R2(6, 8, 4, 4); R2(7, 6, 2, 2); }
    else { R2(4, 7, 8, 6); R2(5, 6, 6, 1); cx.fillStyle = "rgba(255,255,255,0.25)"; R2(5, 7, 3, 1); }
  }
  R.drawItemAt = drawItemAt;
  // step 29: carried tool hand overlay (flake / axe / spear sheets; fallback tools_16 cols). Returns true if drawn.
  function drawToolOverlay(it, px, py, facing) {
    const typ = it.tool; if (!typ) return false;
    const face = facing || "down";
    const A = G.data.art;
    // prefer dedicated sheet (flake_16 / axe_16 / spear_16)
    if (art[typ] && A[typ] && A[typ].rows) {
      const r = A[typ].rows.indexOf(face); if (r < 0) return false;
      cx.drawImage(art[typ], 0, r * 16, 16, 16, px, py, 8, 8); return true;
    }
    // convenience sheet tools_16: cols flake/axe/spear × rows facing
    if (art.tools && A.tools) {
      const c = A.tools.cols.indexOf(typ), r = A.tools.rows.indexOf(face);
      if (c >= 0 && r >= 0) { cx.drawImage(art.tools, c * 16, r * 16, 16, 16, px, py, 8, 8); return true; }
    }
    return false;
  }
  // v28: worn hide cloak overlay (16×64 facing rows). Returns true if drawn.
  function drawHideWorn(a, px, py, facing) {
    if (!a || a.wearingHide == null || !art.hideWorn) return false;
    const A = G.data.art.hideWorn; if (!A || !A.rows) return false;
    const face = facing || "down", r = A.rows.indexOf(face); if (r < 0) return false;
    cx.drawImage(art.hideWorn, 0, r * 16, 16, 16, px, py, tp, tp); return true;
  }
  // step 19: a burning stick = the stick plus a small flickering flame (the fire fx at half size) at its tip
  function drawBrand(it, px, py, size, time) {
    drawItemAt(it, px, py, size); if (!it.lit) return;
    const s = size / 2, fl = Math.floor(time * 6 + it.id) % 2 ? "fire_1" : "fire_0", c = sheetCol("fx", fl);
    if (c >= 0) cx.drawImage(art.fx, c * 16, 0, 16, 16, px + size * 0.5, py + size * 0.15, s, s);
    else { cx.fillStyle = "#e88a2a"; cx.fillRect(px + size * 0.6, py + size * 0.3, s * 0.6, s * 0.7); cx.fillStyle = "#f6d36a"; cx.fillRect(px + size * 0.7, py + size * 0.45, s * 0.25, s * 0.4); }
  }
  // step 19: a baby - carried (on top of the carrier, her facing), or lying (beside a sleeping carrier, or alone); code fallback = a small bundle
  function drawBaby(b, px, py, pose, k) {
    const c = sheetCol("baby", pose), o = (k || 0) * 3;
    if (c >= 0) { cx.drawImage(art.baby, c * 16, 0, 16, 16, px + o, py, tp, tp); return; }
    const lying = pose === "lying"; cx.fillStyle = "#e9dcc0"; cx.fillRect(px + (lying ? 4 : 9) + o, py + (lying ? 11 : 7), lying ? 7 : 5, lying ? 3 : 5);
    cx.fillStyle = "#c89268"; cx.fillRect(px + (lying ? 10 : 10) + o, py + (lying ? 10 : 6), 3, 3);
  }
  R.drawBaby = drawBaby;
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
  // step 21: prayer spots (few stones / more stones / cairn by spot.n); code fallback = small grey stones
  function drawSpots(sim) {
    const S = G.data.art.spot, spots = (sim.faith && sim.faith.spots) || []; R.spotsDrawn = 0;
    for (const q of spots) { let lv = 0; if (S) for (let i = 0; i < S.at.length; i++) if (q.n >= S.at[i]) lv = i;
      const px = q.x * tp, py = q.y * tp; R.spotsDrawn++;
      if (art.spot && S) { cx.drawImage(art.spot, lv * S.frame, 0, S.frame, S.frame, px, py, tp, tp); continue; }
      cx.fillStyle = "#8a8378"; for (let k = 0; k <= lv + 1; k++) cx.fillRect(px + 3 + k * 3, py + 11 - (k % 2) * 2, 3, 3); }
  }
  // step 21b: natural shelters over the tile beneath (cave / overhang blend into the hill, thicket over the woods); code fallback = dark mouth / brush
  function drawShelters(sim) {
    const S = G.data.art.shelter; R.sheltersDrawn = 0;
    for (const q of sim.shelters || []) for (const [x, y] of q.tiles) { const px = x * tp, py = y * tp, c = S ? S.cols.indexOf(q.type) : -1; R.sheltersDrawn++;
      if (art.shelter && c >= 0 && c !== 2) { cx.drawImage(art.shelter, c * S.frame, 0, S.frame, S.frame, px, py, tp, tp); continue; }
      if (q.type === "thicket") { cx.fillStyle = "rgba(20,50,20,0.55)"; cx.fillRect(px + 1, py + 2, tp - 2, tp - 3); continue; }
      cx.fillStyle = "#6e6558"; cx.fillRect(px + 1, py + 2, tp - 2, tp - 4); cx.fillStyle = "#1c1814"; cx.fillRect(px + 4, py + (q.type === "cave" ? 6 : 9), tp - 8, tp - (q.type === "cave" ? 8 : 11)); }
  }
  function drawItems(sim, selectedId) {
    for (const it of sim.items || []) { if (it.heldBy != null || it.wornBy != null) continue;   // v28: worn hide is person overlay
      if (it.id === selectedId) { cx.strokeStyle = "#fff6b0"; cx.lineWidth = 1.5; cx.strokeRect(it.x * tp + 0.5, it.y * tp + 0.5, tp - 1, tp - 1); cx.lineWidth = 1; }
      drawBrand(it, it.x * tp, it.y * tp, 16, R.time || 0); }
  }

  // alpha = fraction of the way to the next tick (the main loop's tick accumulator), for smooth movement between ticks.
  // Position, step frame and facing are computed here only; the sim stays tick-based and deterministic.
  R.draw = function (sim, alpha, time, selectedId) {
    R.sim = sim; R.time = time;
    if (R.follow != null) { const a = sim.agents.find(q => q.id === R.follow);   // v19 Find: keep them centred (smoothly, at the drawn position)
      if (!a) R.follow = null; else { const p = sim.prev[a.id] || a.pos, f = R.focusFrac ? R.focusFrac() : { fx: 0.5, fy: 0.5 }; R.centerOn(p.x + (a.pos.x - p.x) * alpha, p.y + (a.pos.y - p.y) * alpha, 0, f.fx, f.fy); } }
    if (R.terrainFor !== sim.world || R.dirty) drawTerrain(sim.world);
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.fillStyle = "#000"; cx.fillRect(0, 0, cv.width, cv.height);
    const s = sc * view.z; cx.setTransform(s, 0, 0, s, -Math.round(view.ox * s), -Math.round(view.oy * s)); cx.imageSmoothingEnabled = false;
    cx.drawImage(terrain, 0, 0); drawWater(sim.world, time);
    drawShelters(sim);
    drawFire(sim, time);
    for (const b of sim.bushes) drawBush(b);
    R.screen = {};
    drawSpots(sim); drawItems(sim, selectedId);
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
      if (a.wearingHide != null) drawHideWorn(a, Math.round((x + shiver) * tp), Math.round(y * tp), st.facing);
      const held = G.Items && G.Items.held(sim, a);
      if (held && a.act.type !== "sleep") {
        const hx = Math.round((x + shiver) * tp + (st.facing === "left" ? 0 : 8)), hy = Math.round(y * tp + 5);
        if (held.tool && drawToolOverlay(held, hx, hy, st.facing)) { /* tool sheet replaces item */ }
        else drawBrand(held, hx, hy, 8, time);   // half size over the hand
      }
      let k = 0; for (const b of sim.babies || []) if (b.carrier === a.id && b.orphanAt == null) {   // step 19: her baby (babies) on top of her, or beside her asleep
        if (a.act.type === "sleep") drawBaby(b, Math.round((x + shiver) * tp) + 6, Math.round(y * tp) + 1, "lying", k); else drawBaby(b, Math.round((x + shiver) * tp), Math.round(y * tp) - 2, "carried_" + st.facing, k); k++; }
      if (selectedId != null) for (const b of sim.babies || []) if (b.id === selectedId && b.carrier === a.id && b.orphanAt == null) { cx.strokeStyle = "#fff6b0"; cx.lineWidth = 1.5; cx.beginPath(); cx.ellipse(x * tp + 8, y * tp + 14, 7, 3, 0, 0, 7); cx.stroke(); cx.lineWidth = 1; }
    }
    for (const b of sim.babies || []) if (b.orphanAt != null) { R.screen[b.id] = { x: b.pos.x, y: b.pos.y }; drawBaby(b, Math.round(b.pos.x * tp), Math.round(b.pos.y * tp), "lying");   // left alone on the ground
      if (b.id === selectedId) { cx.strokeStyle = "#fff6b0"; cx.lineWidth = 1.5; cx.strokeRect(b.pos.x * tp + 0.5, b.pos.y * tp + 0.5, tp - 1, tp - 1); cx.lineWidth = 1; } }
    drawSparks(sim, time);
    drawPowers(sim, time);   // step 22: rain falling and warm / cool tint over the circles (view only)
    const dk = G.Time.darkness(sim.tick); if (dk > 0) { cx.fillStyle = "rgba(8,14,40," + (dk * 0.55).toFixed(3) + ")"; cx.fillRect(0, 0, mw, mh); }
    cx.setTransform(1, 0, 0, 1, 0, 0);
  };

  // step 22: active powers - a soft tint over the circle, rain frames tiled over every tile in a Rain circle; R.aim = the circle under the pointer while a power is armed
  R.aim = null;
  function drawPowers(sim, time) {
    const P = G.data.config.powers, list = G.Powers ? G.Powers.active(sim) : [], disc = (x, y, r) => { cx.beginPath(); cx.arc((x + 0.5) * tp, (y + 0.5) * tp, (r + 0.5) * tp, 0, 7); };
    for (const e of list) { const on = e.k === "rain" ? e.on && sim.tick < e.end : sim.tick < e.end; if (!on) continue;
      const fade = e.fade ? Math.min(1, (e.end - sim.tick) / e.fade) : 1; cx.save(); cx.globalAlpha = fade; cx.fillStyle = P.tint[e.k]; disc(e.x, e.y, e.r); cx.fill();
      if (e.k === "rain") { const im = e.str === "light" ? (art.rainLight || art.rain) : e.str === "heavy" ? (art.rainHeavy || art.rain) : art.rain, f = Math.floor(time * 1000 / P.rainFrameMs) % 4;
        for (let y = Math.ceil(e.y - e.r); y <= e.y + e.r; y++) for (let x = Math.ceil(e.x - e.r); x <= e.x + e.r; x++) {
          if (x < 0 || y < 0 || x >= G.data.config.map.w || y >= G.data.config.map.h || (x - e.x) * (x - e.x) + (y - e.y) * (y - e.y) > e.r * e.r) continue;
          if (im) cx.drawImage(im, f * 16, 0, 16, 16, x * tp, y * tp, tp, tp);
          else { cx.strokeStyle = "rgba(190,210,255,0.45)"; cx.beginPath(); for (let i = 0; i < 3; i++) { const sx = x * tp + ((i * 5 + f * 3) % tp), sy = y * tp + ((i * 7 + f * 4) % tp); cx.moveTo(sx, sy); cx.lineTo(sx - 1, sy + 4); } cx.stroke(); } } }
      cx.restore(); }
    drawFlashes(sim);
    if (R.aim && R.aim.r === 0) { cx.save(); cx.strokeStyle = "rgba(255,246,176,0.9)"; cx.setLineDash([3, 2]); cx.strokeRect(R.aim.x * tp + 0.5, R.aim.y * tp + 0.5, tp - 1, tp - 1); cx.restore(); }
    else if (R.aim) { cx.save(); cx.strokeStyle = "rgba(255,246,176,0.8)"; cx.setLineDash([4, 3]); disc(R.aim.x, R.aim.y, R.aim.r); cx.stroke(); cx.restore(); }
  }

  // step 23: a strike (bolt fx) and a new animal (shimmer fx), timed in real ms from when the view first sees them (view only, nothing saved)
  const flashes = []; let seenFx = new WeakSet();
  function drawFlashes(sim) {
    const now = performance.now(), P = G.data.config.powers;
    for (const f of sim.fx) if ((f.k === "bolt" || f.k === "shimmer") && !seenFx.has(f)) { seenFx.add(f); if (sim.tick - f.t <= 2) flashes.push({ k: f.k, x: f.x, y: f.y, t0: now }); }
    for (let i = flashes.length - 1; i >= 0; i--) { const f = flashes[i], ms = now - f.t0;
      if (f.k === "bolt") { const fm = P.lightning.frameMs, tot = fm[0] + fm[1] + fm[2]; if (ms > tot) { flashes.splice(i, 1); continue; }
        const fr = ms < fm[0] ? 0 : ms < fm[0] + fm[1] ? 1 : 2, im = art.lightning, px = f.x * tp, py = (f.y - 2) * tp;
        if (im) cx.drawImage(im, fr * 16, 0, 16, 48, px, py, tp, 3 * tp);
        else { cx.save(); cx.globalAlpha = fr === 2 ? 0.6 : 1; cx.strokeStyle = "#fffbe0"; cx.lineWidth = fr === 1 ? 1 : 2; cx.beginPath(); cx.moveTo(px + 9, py); cx.lineTo(px + 5, py + 18); cx.lineTo(px + 10, py + 24); cx.lineTo(px + 7, py + 3 * tp - 2); cx.stroke();
          if (fr === 2) { cx.fillStyle = "rgba(255,250,210,0.7)"; cx.fillRect(px, py + 2 * tp, tp, tp); } cx.restore(); }
        if (fr === 0) { cx.save(); cx.fillStyle = "rgba(255,255,240,0.12)"; cx.fillRect(view.ox - tp, view.oy - tp, view.bw + 2 * tp, view.bh + 2 * tp); cx.restore(); }   // the whole sky lights for a moment
        }
      else { const tot = P.spawn.shimmerMs; if (ms > tot) { flashes.splice(i, 1); continue; }
        const k = ms / tot, cxp = (f.x + 0.5) * tp, cyp = (f.y + 0.5) * tp; cx.save(); cx.globalAlpha = 1 - k; cx.fillStyle = "#fff6b0";
        for (let j = 0; j < 8; j++) { const a = j / 8 * Math.PI * 2 + k * 3, r = 3 + k * 8; cx.fillRect(Math.round(cxp + Math.cos(a) * r) - 1, Math.round(cyp + Math.sin(a) * r) - 1, 2, 2); }
        cx.strokeStyle = "rgba(255,246,176,0.8)"; cx.beginPath(); cx.arc(cxp, cyp, 2 + k * 9, 0, 7); cx.stroke(); cx.restore(); } }
  }

  // canvas client px -> tile coords (zoom/pan aware), and back (used by tests)
  R.toTile = function (clientX, clientY) { const f = R.frac(clientX, clientY); return { x: (view.ox + f.fx * view.bw / view.z) / tp, y: (view.oy + f.fy * view.bh / view.z) / tp }; };
  R.toClient = function (tx, ty) { const r = cv.getBoundingClientRect(); return { x: r.left + ((tx * tp - view.ox) * view.z / view.bw) * r.width, y: r.top + ((ty * tp - view.oy) * view.z / view.bh) * r.height }; };
  G.Render = R;
})(this.GS = this.GS || {});
