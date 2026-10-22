// Seeded RNG (mulberry32). State is one uint32 so it saves as a number.
(function (G) {
  function RNG(seed) { this.s = seed >>> 0; }
  RNG.prototype.next = function () { // uint32
    let t = (this.s = (this.s + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  RNG.prototype.float = function () { return this.next() / 4294967296; };
  RNG.prototype.range = function (a, b) { return a + (b - a) * this.float(); };
  RNG.prototype.int = function (a, b) { return a + Math.floor(this.float() * (b - a + 1)); }; // inclusive
  RNG.prototype.chance = function (p) { return this.float() < p; };
  RNG.prototype.pick = function (arr) { return arr[Math.floor(this.float() * arr.length)]; };
  RNG.prototype.gauss = function () { return (this.float() + this.float() + this.float() - 1.5) * 2; }; // ~N(0,1), bounded ±3
  RNG.prototype.shuffle = function (arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.float() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  // Text or number -> uint32 seed. Pure digits are used as-is so "12345" is seed 12345.
  RNG.seedFrom = function (v) {
    const s = String(v).trim();
    if (/^\d+$/.test(s)) return Number(s) >>> 0;
    let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0;
  };
  // Stable per-coordinate hash in [0,1) (render detail, no RNG state used).
  RNG.hash2 = function (x, y, s) { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  G.RNG = RNG;
})(this.GS = this.GS || {});
