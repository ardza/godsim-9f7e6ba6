// Map generation, queries and A* pathfinding. A world is {w, h, tiles: number[], seed, attempt, lake, source}.
(function (G) {
  const C = () => G.data.config.map, T = G.data.T, TILES = G.data.tiles;
  const World = {};

  World.idx = (w, x, y) => y * w.w + x;
  World.inb = (w, x, y) => x >= 0 && y >= 0 && x < w.w && y < w.h;
  World.tile = (w, x, y) => w.tiles[y * w.w + x];
  World.walkable = (w, x, y) => World.inb(w, x, y) && TILES[w.tiles[y * w.w + x]].walk;
  World.isWater = (w, x, y) => World.inb(w, x, y) && TILES[w.tiles[y * w.w + x]].water;

  function valueNoise(rng, W, H, scale) { // smooth value noise, 2 octaves, 0..1
    const out = new Float64Array(W * H);
    for (const [sc, amp] of [[scale, 0.7], [scale / 2.5, 0.3]]) {
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

  function attempt(seed, n) {
    const c = C(), W = c.w, H = c.h, m = c.margin, rng = new G.RNG((seed + Math.imul(n, 0x9E3779B1)) >>> 0);
    const w = { w: W, h: H, tiles: new Array(W * H).fill(T.MEADOW), seed, attempt: n };
    const inner = (x, y) => x >= m && y >= m && x < W - m && y < H - m;
    const woods = valueNoise(rng, W, H, c.woodsNoiseScale), wob = valueNoise(rng, W, H, 5);
    const thr = Array.from(woods).sort((p, q) => p - q)[Math.floor(W * H * (1 - c.woodsFraction))];
    for (let i = 0; i < W * H; i++) if (woods[i] > thr) w.tiles[i] = T.WOODS;
    // lake: wobbly ellipse
    const L = c.lake, lk = { cx: rng.int(L.cx[0], L.cx[1]), cy: rng.int(L.cy[0], L.cy[1]), rx: rng.range(L.rx[0], L.rx[1]), ry: rng.range(L.ry[0], L.ry[1]) };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = ((x - lk.cx) / lk.rx) ** 2 + ((y - lk.cy) / lk.ry) ** 2 + (wob[y * W + x] - 0.5) * L.wobble;
      if (d < 1 && inner(x, y)) w.tiles[y * W + x] = T.LAKE;
    }
    w.tiles[lk.cy * W + lk.cx] = T.LAKE;
    // river: 4-connected walk from an inland spring to the lake (4-connected so nobody slips through a diagonal gap)
    const R = c.river, src = { x: rng.int(R.sourceX[0], R.sourceX[1]), y: rng.int(R.sourceY[0], R.sourceY[1]) };
    let x = src.x, y = src.y, reached = false;
    const setRiver = (a, b) => { if (inner(a, b) && w.tiles[b * W + a] !== T.LAKE) w.tiles[b * W + a] = T.RIVER; };
    for (let s = 0; s < R.maxSteps; s++) {
      if (w.tiles[y * W + x] === T.LAKE) { reached = true; break; }
      setRiver(x, y);
      const dx = lk.cx - x, dy = lk.cy - y, opts = [];
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + ox, ny = y + oy; if (!inner(nx, ny) || w.tiles[ny * W + nx] === T.RIVER) continue;
        const toward = (ox * Math.sign(dx) > 0 ? Math.abs(dx) : 0) + (oy * Math.sign(dy) > 0 ? Math.abs(dy) : 0);
        opts.push({ nx, ny, wgt: (toward > 0 ? R.toward * (0.5 + toward / (Math.abs(dx) + Math.abs(dy) + 1)) : 1 - R.toward) + 0.01 });
      }
      if (!opts.length) break;
      let r = rng.float() * opts.reduce((a, o) => a + o.wgt, 0), o = opts[opts.length - 1];
      for (const q of opts) { r -= q.wgt; if (r <= 0) { o = q; break; } }
      if (rng.chance(R.widenChance)) { if (o.nx !== x) setRiver(x, y + 1); else setRiver(x + 1, y); }
      x = o.nx; y = o.ny;
    }
    // shore sand: land touching the lake
    for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
      if (TILES[w.tiles[yy * W + xx]].water) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => World.inb(w, xx + a, yy + b) && w.tiles[(yy + b) * W + xx + a] === T.LAKE)) w.tiles[yy * W + xx] = T.SAND;
    }
    w.lake = lk; w.source = src; w.riverReached = reached;
    return w;
  }

  World.generate = function (seed) {
    seed = seed >>> 0;
    for (let n = 0; n < C().maxTries; n++) { const w = attempt(seed, n); if (World.riverReachesLake(w) && World.landConnected(w)) return w; }
    throw new Error("world generation failed for seed " + seed);
  };

  // flood fill over water from the spring: must touch a lake tile
  World.riverReachesLake = function (w) {
    const s = w.source; if (!s || w.tiles[s.y * w.w + s.x] !== T.RIVER) return false;
    const seen = new Uint8Array(w.w * w.h), st = [s.y * w.w + s.x]; seen[st[0]] = 1;
    while (st.length) { const i = st.pop(), x = i % w.w, y = (i / w.w) | 0;
      if (w.tiles[i] === T.LAKE) return true;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + a, ny = y + b, j = ny * w.w + nx; if (World.isWater(w, nx, ny) && !seen[j]) { seen[j] = 1; st.push(j); } } }
    return false;
  };
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
      cand.push({ x, y, wt: edge ? B.weights.edge : t === T.MEADOW ? B.weights.meadow : B.weights.woods });
    }
    const out = [];
    for (let k = 0; k < B.count && cand.length; k++) {
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
