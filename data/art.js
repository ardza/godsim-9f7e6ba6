// Optional art manifest. Only files listed here are requested (a missing entry = drawn in code,
// so nothing 404s). Paths are relative to index.html. Artist delivery 16:05 is in data/art/.
//   tiles: { meadow: "...png", woods, sand, river, lake }  (16x16 each, optional)
//   person: { src, frame, rows: [dir...], frames }  sprite sheet, frames across, one row per facing
//   bush / bushEmpty: 16x16 (ripe / bare)
//   body: { src, frame, cols: [stage...] }  one column per body stage
//   grazer / scavenger: { src, frame, frames, rows: [dir...] }  like person
(function (G) {
  G.data = G.data || {};
  G.data.art = {
    tiles: {},
    person: { src: "data/art/person_16.png", frame: 16, frames: 2, rows: ["down", "left", "right", "up"] },
    // founders: 8 looks, each a 32x80 block at x = 32*i (2 frames x 5 rows); founder i uses look i mod 8. Falls back to person + code tint.
    founders: { src: "data/art/founders_16.png", frame: 16, frames: 2, variants: 8, blockW: 32, rows: ["down", "left", "right", "up", "sleep"] },
    bush: "data/art/bush_full.png",
    bushEmpty: "data/art/bush_empty.png",
    body: { src: "data/art/body_stages_16.png", frame: 16, cols: ["fresh", "rotting", "bones"] },   // 48x16
    grazer: { src: "data/art/grazer_16.png", frame: 16, frames: 2, rows: ["down", "left", "right", "up"] },   // 32x64
    scavenger: { src: "data/art/scavenger_16.png", frame: 16, frames: 2, rows: ["down", "left", "right", "up"] }   // 32x64
  };
})(this.GS = this.GS || {});
