// Map generation, queries and A* pathfinding. A world is {w, h, tiles: number[], seed, attempt, spawn, hills ('0'/'1' per tile), info}.
(function (G) {
  const C = () => G.data.config.map, T = G.data.T, TILES = G.data.tiles;
  const World = {};

  World.idx = (w, x, y) => y * w.w + x;
  World.inb = (w, x, y) => x >= 0 && y >= 0 && x < w.w && y < w.h;
  World.tile = (w, x, y) => w.tiles[y * w.w + x];
  World.walkable = (w, x, y) => World.inb(w, x, y) && TILES[w.tiles[y * w.w + x]].walk;
  World.isWater = (w, x, y) => World.inb(w, x, y) && TILES[w.tiles[y * w.w + x]].water;

  // smooth value noise, 0..1. octaves: [[scale multiplier, amplitude], ...] (amplitudes sum to 1)
  function valueNoise(rng, W, H, scale, octaves) {
    const out = new Float64Array(W * H);
    for (const [mul, amp] of octaves || [[1, 0.7], [0.4, 0.3]]) { const sc = Math.max(1.5, scale * mul);
      const gw = Math.ceil(W / sc) + 2, gh = Math.ceil(H / sc) + 2, g = [];
      for (let i = 0; i < gw * gh; i++) g.push(rng.float());
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const fx = x / sc, fy = y / sc, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), v = (a, b) => g[(iy + b) * gw + ix + a];
        out[y * W + x] += amp * ((v(0, 0) * (1 - sx) + v(1, 0) * sx) * (1 - sy) + (v(0, 1) * (1 - sx) + v(1, 1) * sx) * sy);
      }
    }
    return out;
  }
  const quantile = (arr, q) => { const a = Array.from(arr).sort((p, r) => p - r); return a[Math.min(a.length - 1, Math.max(0, Math.floor(a.length * q)))]; };
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // Step 15b: one map attempt. Every choice comes from the seed through its own stream (seed ^ salt, + attempt), so a seed always gives the same map.
  function attempt(seed, n) {
    const c = C(), W = c.w, H = c.h, m = c.margin, N = W * H;
    const S = salt => new G.RNG(((seed ^ salt) + Math.imul(n, 0x9E3779B1)) >>> 0);
    const pr = S(0x5EEDC0DE), hr = S(0x4E16A7), mr = S(0x3015757), lr = S(0x1A4E5), rr = S(0x417E25), fr = S(0xF02E57);
    const w = { w: W, h: H, tiles: new Array(N).fill(T.MEADOW), seed, attempt: n };
    const inner = (x, y) => x >= m && y >= m && x < W - m && y < H - m;
    // per-seed setting
    const moistBias = pr.range(c.moisture.bias[0], c.moisture.bias[1]);
    const F = c.forest, forestDensity = Math.min(F.density[1], Math.max(F.density[0], (F.density[0] + F.density[1]) / 2 + moistBias * F.biasPull + pr.range(-F.jitter, F.jitter)));
    const hillFrac = pr.range(c.hills.fraction[0], c.hills.fraction[1]);
    let nLakes = pr.int(c.lakes.count[0], c.lakes.count[1]); const nRivers = pr.int(c.rivers.count[0], c.rivers.count[1]);
    if (!nLakes && !nRivers) nLakes = 1;   // a map with no water at all can't give the founders water: at least one pond
    const waterTarget = pr.range(c.lakes.target[0], c.lakes.target[1]);
    // fields
    const height = valueNoise(hr, W, H, c.noise.heightScale, c.noise.octaves);
    const moist = valueNoise(mr, W, H, c.noise.moistScale, c.noise.octaves).map(v => v + moistBias);
    const woodsN = valueNoise(fr, W, H, c.noise.woodsScale);
    const hillT = quantile(height, 1 - hillFrac), hill = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (height[i] >= hillT) hill[i] = 1;
    // lakes: flood low basins (lowest frontier tile first, a little wobble) up to each lake's share of the water budget
    const lakeId = new Int16Array(N).fill(-1), lakes = [];
    const lows = []; for (let y = m; y < H - m; y++) for (let x = m; x < W - m; x++) { const i = y * W + x; let min = true;
      for (let dy = -2; dy <= 2 && min; dy++) for (let dx = -2; dx <= 2; dx++) { const j = (y + dy) * W + x + dx; if ((dx || dy) && inner(x + dx, y + dy) && height[j] < height[i]) { min = false; break; } }
      if (min && !hill[i]) lows.push(i); }
    lows.sort((a, b) => height[a] - height[b]);
    const lowQ = quantile(height, 0.35), lowRest = []; for (let y = m; y < H - m; y++) for (let x = m; x < W - m; x++) if (height[y * W + x] < lowQ) lowRest.push(y * W + x);
    lr.shuffle(lowRest);
    const shares = Array.from({ length: nLakes }, () => lr.range(0.35, 1.65)), shareSum = shares.reduce((a, b) => a + b, 0) || 1;
    const lakeBudget = Math.round(N * waterTarget * (nRivers ? 0.75 : 1));
    const wob = valueNoise(lr, W, H, 4);
    for (let k = 0; k < nLakes; k++) {
      const far = i => lakes.every(L => Math.hypot(i % W - L.cx, ((i / W) | 0) - L.cy) >= c.lakes.spacing);
      const seedTile = lows.find(far) ?? lowRest.find(far); if (seedTile == null) break;
      const size = Math.max(c.lakes.minSize, Math.round(lakeBudget * shares[k] / shareSum));
      const L = { id: k, cx: seedTile % W, cy: (seedTile / W) | 0, size: 0 }, front = [seedTile], inF = new Uint8Array(N); inF[seedTile] = 1;
      while (L.size < size && front.length) {
        let bi = 0; for (let q = 1; q < front.length; q++) if (height[front[q]] + wob[front[q]] * c.lakes.wobble < height[front[bi]] + wob[front[bi]] * c.lakes.wobble) bi = q;
        const i = front.splice(bi, 1)[0], x = i % W, y = (i / W) | 0; lakeId[i] = k; w.tiles[i] = T.LAKE; L.size++;
        for (const [a, b] of N4) { const nx = x + a, ny = y + b, j = ny * W + nx; if (!inner(nx, ny) || inF[j] || lakeId[j] >= 0) continue;
          let near = false; for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) { const q = (ny + dy) * W + nx + dx; if (W > nx + dx && nx + dx >= 0 && ny + dy >= 0 && ny + dy < H && lakeId[q] >= 0 && lakeId[q] !== k) { near = true; break; } }
          if (!near) { inF[j] = 1; front.push(j); } }
      }
      lakes.push(L);
    }
    // rivers: spring on high ground, then mostly downhill (plus a pull toward the nearest lake or edge so it can't stall), 1 tile wide, 2 near the end
    const rivers = [], isRiver = new Uint8Array(N);
    const distOut = (x, y) => { let d = Math.min(x, y, W - 1 - x, H - 1 - y); for (const L of lakes) d = Math.min(d, Math.hypot(x - L.cx, y - L.cy) - Math.sqrt(L.size / Math.PI)); return d; };
    const highT = quantile(height, 1 - c.rivers.sourceTop);
    for (let k = 0; k < nRivers; k++) {
      const cand = []; for (let y = m + 2; y < H - m - 2; y++) for (let x = m + 2; x < W - m - 2; x++) { const i = y * W + x;
        if (height[i] >= highT && w.tiles[i] === T.MEADOW && !isRiver[i] && distOut(x, y) >= c.rivers.minLength && rivers.every(R => Math.hypot(R.src.x - x, R.src.y - y) >= 10)) cand.push(i); }
      let path, end, s0;
      for (let tryS = 0; tryS < 6 && cand.length; tryS++) {   // a spring whose walk ends higher than it started is dropped; try another
      s0 = cand.splice(rr.int(0, cand.length - 1), 1)[0]; path = []; end = null; const seen = new Set([s0]); let x = s0 % W, y = (s0 / W) | 0;
      for (let st = 0; st < c.rivers.maxSteps; st++) {
        path.push([x, y]);
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) { end = "edge"; break; }
        let best = null;
        for (const [a, b] of N4) { const nx = x + a, ny = y + b, j = ny * W + nx; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (w.tiles[j] === T.LAKE) { best = { nx, ny, lake: true }; break; }
          if (seen.has(j) || isRiver[j]) continue;
          const sc = height[j] + c.rivers.pull * distOut(nx, ny) + rr.float() * c.rivers.jitter; if (!best || sc < best.sc) best = { nx, ny, sc }; }
        if (!best) break;
        if (best.lake) { end = "lake"; break; }
        x = best.nx; y = best.ny; seen.add(y * W + x);
      }
        if (end && height[path[path.length - 1][1] * W + path[path.length - 1][0]] < height[s0]) break; end = null; }
      if (!end) continue;
      const wideFrom = Math.floor(path.length * (1 - c.rivers.widenLast));
      path.forEach(([px, py], q) => { const i = py * W + px; isRiver[i] = 1; w.tiles[i] = T.RIVER;
        if (q >= wideFrom && q > 0) { const [ox, oy] = path[q - 1], dx = px - ox, dy = py - oy, sx = px + (dy ? 1 : 0), sy = py + (dx ? 1 : 0);
          if (sx < W && sy < H && w.tiles[sy * W + sx] !== T.LAKE) { isRiver[sy * W + sx] = 1; w.tiles[sy * W + sx] = T.RIVER; } } });
      rivers.push({ id: k, src: { x: s0 % W, y: (s0 / W) | 0 }, end, length: path.length, h0: +height[s0].toFixed(3), h1: +height[path[path.length - 1][1] * W + path[path.length - 1][0]].toFixed(3) });
    }
    // forest by moisture (+ a little patchiness, fewer on hills); very dry open ground shows as sand
    const land = []; for (let i = 0; i < N; i++) if (!TILES[w.tiles[i]].water) land.push(i);
    const fscore = i => moist[i] + F.patch * woodsN[i] - (hill[i] ? F.hillPenalty : 0);
    const fs = land.map(fscore).sort((a, b) => b - a), fT = fs[Math.max(0, Math.floor(land.length * forestDensity) - 1)];
    for (const i of land) { if (fscore(i) >= fT) w.tiles[i] = T.WOODS; else if (moist[i] < c.moisture.dryGround) w.tiles[i] = T.SAND; }
    // shore sand: land touching a lake
    for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) { const i = yy * W + xx; if (TILES[w.tiles[i]].water) continue;
      if (N4.some(([a, b]) => World.inb(w, xx + a, yy + b) && w.tiles[(yy + b) * W + xx + a] === T.LAKE)) w.tiles[i] = T.SAND; }
    // no stranded land: small pockets cut off by water become water; a big cut-off area means another attempt
    const comp = World.landComponents(w); if (comp.length > 1) { const rest = comp.slice(1).reduce((a, q) => a + q.length, 0); if (rest > c.maxPocket) return null;
      for (const q of comp.slice(1)) for (const i of q) w.tiles[i] = T.LAKE; }   // a small cut-off pocket becomes a pond
    let water = 0; for (let i = 0; i < N; i++) if (TILES[w.tiles[i]].water) water++;
    const waterPct = 100 * water / N; if (waterPct < c.waterPct[0] || waterPct > c.waterPct[1]) return null;
    // founders' spot: walkable meadow near the middle with water within spawnWaterTiles (the cluster stays inside founderWater)
    const wl = []; for (let i = 0; i < N; i++) if (TILES[w.tiles[i]].water) wl.push([i % W, (i / W) | 0]);
    let spawn = null; for (let y = m; y < H - m; y++) for (let x = m; x < W - m; x++) if (w.tiles[y * W + x] === T.MEADOW) {
      const dw = Math.min(...wl.map(([a, b]) => Math.hypot(a - x, b - y))); if (dw > c.spawnWaterTiles) continue;
      const d = Math.hypot(x - W / 2, y - H / 2) + pr.float() * 6; if (!spawn || d < spawn.d) spawn = { x, y, d }; }
    if (!spawn) return null;
    w.spawn = { x: spawn.x, y: spawn.y };
    Object.defineProperty(w, "moist", { value: moist, enumerable: false });   // used once for bush placement, not saved
    w.hills = Array.from(hill).join("");
    w.info = { lakes: lakes.length, lakeSizes: lakes.map(L => L.size), rivers: rivers.length, riverInfo: rivers, waterPct: +waterPct.toFixed(1), forestDensity: +forestDensity.toFixed(2),
      moistureBias: +moistBias.toFixed(2), hillPct: +(100 * hillFrac).toFixed(1), woodsPct: +(100 * w.tiles.filter(t => t === T.WOODS).length / N).toFixed(1), attempt: n };
    return w;
  }

  World.generate = function (seed) {
    seed = seed >>> 0;
    for (let n = 0; n < C().maxTries; n++) { const w = attempt(seed, n); if (w && World.landConnected(w)) return w; }
    throw new Error("world generation failed for seed " + seed);
  };
  // walkable components (same moves as A*), largest first: arrays of tile indices
  World.landComponents = function (w) {
    const seen = new Uint8Array(w.w * w.h), out = [];
    for (let s = 0; s < w.tiles.length; s++) { if (seen[s] || !TILES[w.tiles[s]].walk) continue;
      const st = [s], comp = []; seen[s] = 1;
      while (st.length) { const i = st.pop(), x = i % w.w, y = (i / w.w) | 0; comp.push(i);
        for (const [nx, ny] of World.neighbors(w, x, y)) { const j = ny * w.w + nx; if (!seen[j]) { seen[j] = 1; st.push(j); } } }
      out.push(comp); }
    return out.sort((a, b) => b.length - a.length);
  };
  World.seedInfo = sim => Object.assign({ seed: sim.seed, bushes: sim.bushes.length }, sim.world.info);
  World.hillAt = (w, x, y) => !!w.hills && w.hills[y * w.w + x] === "1";

  // all walkable tiles in one component, using the same moves as A* (8-dir, no corner cutting)
  World.landConnected = function (w) {
    let start = -1, total = 0; for (let i = 0; i < w.tiles.length; i++) if (TILES[w.tiles[i]].walk) { total++; if (start < 0) start = i; }
    const seen = new Uint8Array(w.w * w.h), st = [start]; seen[start] = 1; let n = 0;
    while (st.length) { const i = st.pop(), x = i % w.w, y = (i / w.w) | 0; n++;
      for (const [nx, ny] of World.neighbors(w, x, y)) { const j = ny * w.w + nx; if (!seen[j]) { seen[j] = 1; st.push(j); } } }
    return n === total;
  };

  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  World.neighbors = function (w, x, y) {
    const out = [];
    for (const [a, b] of DIRS) { const nx = x + a, ny = y + b; if (!World.walkable(w, nx, ny)) continue;
      if (a && b && (!World.walkable(w, x + a, y) || !World.walkable(w, x, y + b))) continue; // no corner cutting past water
      out.push([nx, ny]); }
    return out;
  };

  // A* on the tile grid. Returns [[x,y],...] excluding the start, [] if already there, null if unreachable.
  World.findPath = function (w, sx, sy, tx, ty) {
    if (!World.walkable(w, tx, ty) || !World.walkable(w, sx, sy)) return null;
    if (sx === tx && sy === ty) return [];
    const N = w.w * w.h, g = new Float64Array(N).fill(Infinity), f = new Float64Array(N), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const hz = (x, y) => { const dx = Math.abs(x - tx), dy = Math.abs(y - ty); return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy); };
    const heap = [], push = i => { heap.push(i); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (f[heap[p]] <= f[heap[k]]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l; if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    const s = sy * w.w + sx, t = ty * w.w + tx; g[s] = 0; f[s] = hz(sx, sy); push(s);
    while (heap.length) {
      const i = pop(); if (closed[i]) continue; closed[i] = 1;
      if (i === t) { const path = []; for (let k = t; k !== s; k = came[k]) path.push([k % w.w, (k / w.w) | 0]); return path.reverse(); }
      const x = i % w.w, y = (i / w.w) | 0;
      for (const [nx, ny] of World.neighbors(w, x, y)) { const j = ny * w.w + nx; if (closed[j]) continue;
        const ng = g[i] + (nx !== x && ny !== y ? Math.SQRT2 : 1);
        if (ng < g[j]) { g[j] = ng; came[j] = i; f[j] = ng + hz(nx, ny); push(j); } }
    }
    return null;
  };
  World.pathLength = p => { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; };

  // Bushes: weighted toward meadow/woods edges, spaced apart.
  World.placeBushes = function (w, rng) {
    const B = G.data.config.bushes, cand = [];
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
      const t = World.tile(w, x, y); if (t !== T.MEADOW && t !== T.WOODS) continue;
      const other = t === T.MEADOW ? T.WOODS : T.MEADOW;
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => World.inb(w, x + a, y + b) && World.tile(w, x + a, y + b) === other);
      const mo = w.moist ? Math.max(0, w.moist[y * w.w + x]) : 0.5;   // step 15b: moist ground grows more bushes
      cand.push({ x, y, wt: (edge ? B.weights.edge : t === T.MEADOW ? B.weights.meadow : B.weights.woods) * (B.moistBase + mo) });
    }
    // dry seeds get 30-50% fewer bushes (more the drier), never fewer than minCount
    const bias = w.info ? w.info.moistureBias : 0, D = B.dry, cut = bias > D.below ? 0 : D.fewer[0] + (D.fewer[1] - D.fewer[0]) * Math.min(1, (D.below - bias) / (D.below - D.at));
    const count = Math.max(B.minCount, Math.round(B.count * (1 - cut)));
    const out = [];
    for (let k = 0; k < count && cand.length; k++) {
      let r = rng.float() * cand.reduce((a, c) => a + c.wt, 0), ci = cand.length - 1;
      for (let i = 0; i < cand.length; i++) { r -= cand[i].wt; if (r <= 0) { ci = i; break; } }
      const c = cand[ci];
      out.push({ id: "b" + (k + 1), x: c.x, y: c.y, ripe: rng.chance(B.startRipe), regrow: 0 });
      for (let i = cand.length - 1; i >= 0; i--) if (Math.max(Math.abs(cand[i].x - c.x), Math.abs(cand[i].y - c.y)) < B.minSpacing) cand.splice(i, 1);
    }
    return out;
  };

  G.World = World;
})(this.GS = this.GS || {});
