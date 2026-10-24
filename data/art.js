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
    scavenger: { src: "data/art/scavenger_16.png", frame: 16, frames: 2, rows: ["down", "left", "right", "up"] },   // 32x64 wild dog (label only)
    wolves: { src: "data/art/wolves_16.png", frame: 16, frames: 2, rows: ["down", "left", "right", "up"] },   // 32x64 pack predator
    // steps 9-12: things on the ground (half size over the hand when carried) and fire effects; column order from data/art/index.json
    items: { src: "data/art/items_16.png", frame: 16, cols: ["rock", "stick", "flint", "bone", "bone_shard"] },   // 80x16
    // step 26b: reed pickup + bank overlay; mountain rock mass overlays (peak / upper_slope / foothill)
    reed: { src: "data/art/reed_16.png", frame: 16, cols: ["reed", "reed_clump"] },
    reedBank: { src: "data/art/reed_bank_16.png", frame: 16, cols: ["bank_0", "bank_1", "bank_2"] },
    mountain: { src: "data/art/mountain_16.png", frame: 16, cols: ["peak", "upper_slope", "foothill"] },
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
    // step 21b (Artist): natural shelters, transparent overlays on the tile beneath (slot 2 is blank: the hollow was dropped, never drawn)
    shelter: { src: "data/art/shelter_16.png", frame: 16, cols: ["cave", "overhang", "", "thicket"] },   // 64x16
    // step 22 (Artist): rain over every tile in a Rain circle, 4 frames ~150 ms each (tileable, semi-transparent; no base tile changes)
    rain: { src: "data/art/rain_16.png", frame: 16, cols: ["fall_0", "fall_1", "fall_2", "fall_3"] },   // 64x16 Medium
    rainLight: { src: "data/art/rain_light_16.png", frame: 16, cols: ["fall_0", "fall_1", "fall_2", "fall_3"] },   // v19 Light
    rainHeavy: { src: "data/art/rain_heavy_16.png", frame: 16, cols: ["fall_0", "fall_1", "fall_2", "fall_3"] },   // v19 Heavy
    // step 23 (Artist): a Lightning strike, 3 frames 16x48 (strike, fade, ground flash); the bottom 16px sits on the struck tile, the bolt reaches 2 tiles up.
    // Shown ~80 / 80 / 150 ms (powers.lightning.frameMs), then the normal fire / scorch fx. Missing: a code-drawn bolt.
    lightning: { src: "data/art/lightning_16.png", frame: 16, frameH: 48, cols: ["strike", "strike_fade", "ground_flash"] },   // 48x48
    // step 26 (Artist): burial overlays (dug briefly, then mound/cairn replace the body); pyre unlit→burning→ash; ash_bones after a pyre
    burial: { src: "data/art/burial_16.png", frame: 16, cols: ["mound_fresh", "mound_settled", "cairn", "dug"] },   // 64x16
    pyre: { src: "data/art/pyre_16.png", frame: 16, cols: ["unlit", "burning", "ash"] },   // 48x16
    ashBones: { src: "data/art/ash_bones_16.png", frame: 16, cols: ["ash_over_bones", "ash_with_bone_flecks"] },   // 32x16
    baby: { src: "data/art/baby_16.png", frame: 16, cols: ["carried_down", "carried_left", "carried_right", "carried_up", "lying"] },   // 80x16
    // step 25 (Artist): speech gesture overlays on the down-facing frame (same origin), until the token is group speech for her group
    gesture: { src: "data/art/gesture_16.png", frame: 16, variants: 8, cols: ["point_right", "point_left", "pat_chest", "stop_hand", "beckon"] },   // 80x128
    childGesture: { src: "data/art/child_gesture_16.png", frame: 16, variants: 8 },   // 80x128, same columns, 75% figure
    // §29 / v26 (Artist): carried tool hand overlays at person origin; rows down/left/right/up
    flake: { src: "data/art/flake_16.png", frame: 16, rows: ["down", "left", "right", "up"] },   // 16x64
    axe: { src: "data/art/axe_16.png", frame: 16, rows: ["down", "left", "right", "up"] },   // 16x64
    spear: { src: "data/art/spear_16.png", frame: 16, rows: ["down", "left", "right", "up"] },   // 16x64 long-stick reach/poke
    tools: { src: "data/art/tools_16.png", frame: 16, cols: ["flake", "axe", "spear"], rows: ["down", "left", "right", "up"] },   // 48x64 convenience sheet
    // §31 / v28 (Artist): grazer hide item + worn cloak overlay
    hide: { src: "data/art/hide_16.png", frame: 16, cols: ["hide"] },   // 16x16 ground/carried
    hideWorn: { src: "data/art/hide_worn_16.png", frame: 16, rows: ["down", "left", "right", "up"] },   // 16x64 worn drape
    // §32 / v29 optional cache tile tint; §33 / v30 sacred spot marker (prayer_spot_16 still used for stone piles)
    cache: { src: "data/art/cache_16.png", frame: 16, cols: ["cache"] },
    sacred: { src: "data/art/sacred_16.png", frame: 16, cols: ["sacred"] },
    // §35 / v32 (Artist): crude piled hut overlay (pile = in-progress, hut = done lean-to)
    hut: { src: "data/art/hut_16.png", frame: 16, cols: ["pile", "hut"] },   // 32x16
    // §36 / v33 (Artist): ore ground material + struck shard (ochre veins; distinct from rock/flint)
    ore: { src: "data/art/ore_16.png", frame: 16, cols: ["ore", "ore_shard"] },   // 32x16
    // §37 / v34 (Artist): hard tip on stick/bone — hand overlays at person origin; bigger tip than spear_16 poke
    tipStick: { src: "data/art/tip_stick_16.png", frame: 16, rows: ["down", "left", "right", "up"] },   // 16x64
    tipBone: { src: "data/art/tip_bone_16.png", frame: 16, rows: ["down", "left", "right", "up"] },   // 16x64
    tip: { src: "data/art/tip_16.png", frame: 16, cols: ["tip_stick", "tip_bone"], rows: ["down", "left", "right", "up"] }   // 32x64 convenience
  };
  G.data.artItems = G.data.art.items.cols;   // which item frames exist (a sharp bone uses bone_shard; other shards use their material)
})(this.GS = this.GS || {});
