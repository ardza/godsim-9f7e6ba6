// Optional art manifest. Only files listed here are requested (a missing entry = drawn in code,
// so nothing 404s). Paths are relative to index.html. Artist delivery 16:05 is in data/art/.
//   tiles: { meadow: "...png", woods, sand, river, lake }  (16x16 each, optional)
//   person: { src, frame, rows: [dir...], frames }  sprite sheet, frames across, one row per facing
//   bush / bushEmpty: 16x16 (ripe / bare)
//   body: { src, frame, cols: [stage...] }  one column per body stage
//   grazer / scavenger: { src, frame, frames, rows: [dir...] }  like person
//   items / fx: { src, frame, cols: [name...] }  one column per item / effect
(function (G) {
  G.data = G.data || {};
  G.data.art = {
    tiles: {},
    person: { src: "data/art/person_16.png", frame: 16, frames: 2, rows: ["down", "left", "right", "up"] },
    // founders: 8 looks, each a 32x80 block at x = 32*i (2 frames x 5 rows); founder i uses look i mod 8. Falls back to person + code tint.
    founders: { src: "data/art/founders_16.png", frame: 16, frames: 2, variants: 8, blockW: 32, rows: ["down", "left", "right", "up", "sleep"] },
    // step 20: children (3-12), the same layout as founders (figure ~75%, feet on the same line), look = the parent's. Missing: founders scaled 75% in code.
    child: { src: "data/art/child_16.png", frame: 16, frames: 2, variants: 8, blockW: 32, rows: ["down", "left", "right", "up", "sleep"] },
    bush: "data/art/bush_full.png",
    bushEmpty: "data/art/bush_empty.png",
    body: { src: "data/art/body_stages_16.png", frame: 16, cols: ["fresh", "rotting", "bones"] },   // 48x16
    grazer: { src: "data/art/grazer_16.png", frame: 16, frames: 2, rows: ["down", "left", "right", "up"] },   // 32x64
    scavenger: { src: "data/art/scavenger_16.png", frame: 16, frames: 2, rows: ["down", "left", "right", "up"] },   // 32x64
    // steps 9-12: things on the ground (half size over the hand when carried) and fire effects; column order from data/art/index.json
    items: { src: "data/art/items_16.png", frame: 16, cols: ["rock", "stick", "flint", "bone", "bone_shard"] },   // 80x16
    fx: { src: "data/art/fx_16.png", frame: 16, cols: ["spark", "fire_0", "fire_1", "ember", "ash", "scorched_tile"] },   // 96x16
    // step 16-17: meat by cooking state (raw, cooked, charred = the burnt frame) and a killed grazer's carcass
    food: { src: "data/art/food_16.png", frame: 16, cols: ["raw", "cooked", "burnt"] },   // 48x16
    carcass: { src: "data/art/grazer_carcass_16.png", frame: 16, cols: ["fresh", "picked", "bones"] },   // 48x16
    // Artist 03:16 (godsim-previews/next/smoke_16.png): overlays drawn over the tile like the fire fx, base tile art unchanged.
    // smoulder_0/1 on a lightning-struck tree that smoulders (an ember holding in the woods); wisp_0/1 rising one tile above it and above burning woods.
    smoke: { src: "data/art/smoke_16.png", frame: 16, cols: ["wisp_0", "wisp_1", "smoulder_0", "smoulder_1"] },   // 64x16
    // Artist 03:55 (step 19): carried_* drawn on top of the carrier at the same origin, matching her facing; lying = a baby on the ground
    // (beside a sleeping carrier, or left alone). Code fallback in render.js when the sheet is missing.
    // step 21 (Artist): prayer poses, one row per founder look (same order as founders_16), front-facing, feet on the founder line.
    // poses: which column each prayer action shows. "sleep" = the founders/child sleep row; "walk" = the normal walk rows (facing);
    // [a, b] = alternate a/b every half second; afterKneel = the column for that action straight after a kneel. offer = kneel + the item in front.
    pray: { src: "data/art/pray_16.png", frame: 16, variants: 8, cols: ["kneel", "arms_up", "kneel_arms_up", "sway_left", "sway_right"],
      poses: { kneel: "kneel", raise: "arms_up", sway: ["sway_left", "sway_right"], offer: "kneel", still: "sleep", face: "walk", circle: "walk" }, afterKneel: { raise: "kneel_arms_up" } },   // 80x128
    childPray: { src: "data/art/child_pray_16.png", frame: 16, variants: 8 },   // 80x128, same columns and poses as pray, 75% figure
    // prayer spots on the map: few stones / more stones / a cairn, by how many prayers were made there (spot.n >= at[i])
    spot: { src: "data/art/prayer_spot_16.png", frame: 16, cols: ["few", "more", "many"], at: [0, 6, 12] },   // 48x16
    baby: { src: "data/art/baby_16.png", frame: 16, cols: ["carried_down", "carried_left", "carried_right", "carried_up", "lying"] }   // 80x16
  };
  G.data.artItems = G.data.art.items.cols;   // which item frames exist (a sharp bone uses bone_shard; other shards use their material)
})(this.GS = this.GS || {});
