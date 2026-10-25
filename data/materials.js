// Material property table (step 10 / 26b). Every physical outcome (spark, break, sharp edge, scrape, cut, burning) is computed from these numbers
// by the rules in config.physics / config.fire - there is no list of recipes or inventions anywhere.
// All properties are 0-100:
//   hardness   how hard the surface is (resists dents and scratches; a harder thing chips or breaks a softer one)
//   sharpness  how keen its edge or point is
//   dryness    how dry it is (dry and soft = burns; wet/green = does not)
//   durability how tough it is against breaking (100 = practically unbreakable)
//   flex       how much it bends (step 26b; sticks/reeds high, rocks/flint near 0)
//   burns      true if it is fuel (organic); stone and flint never burn
// Bases below; Items.create applies per-piece jitter (±10–20% of base for hardness/sharpness/dryness/durability;
// flex uses wider ranges so sticks/reeds vary a lot). Clamp 0–100. A broken piece keeps its material,
// takes form "shard", and its new edge comes from its hardness (config.physics.break.edgeFromHardness).
(function (G) {
  G.data = G.data || {};
  G.data.materials = {
    rock:  { label: "rock",  hardness: 70, sharpness: 10, dryness: 100, durability: 95, flex: 5,  burns: false },
    stick: { label: "stick", hardness: 25, sharpness: 15, dryness: 70,  durability: 30, flex: 55, burns: true },
    flint: { label: "flint", hardness: 80, sharpness: 45, dryness: 100, durability: 60, flex: 5,  burns: false },
    bone:  { label: "bone",  hardness: 55, sharpness: 10, dryness: 85,  durability: 75, flex: 15, burns: false },  // bone chars but does not burn away
    reed:  { label: "reed",  hardness: 15, sharpness: 5,  dryness: 35,  durability: 35, flex: 70, burns: true },   // step 26b: river-bank only
    meat:  { label: "meat",  hardness: 5,  sharpness: 0,  dryness: 10,  durability: 20, flex: 30, burns: false },  // step 16: raw flesh (wet: does not catch)
    hide:  { label: "hide",  hardness: 8,  sharpness: 0,  dryness: 40,  durability: 45, flex: 65, burns: false },  // §31 / v28: soft grazer skin; wear / sleep-under for warmth
    ore:   { label: "ore",   hardness: 88, sharpness: 15, dryness: 100, durability: 85, flex: 3,  burns: false }   // §36 / v33: harder than rock; hill/mountain deposits; pickup/strike only
  };
})(this.GS = this.GS || {});
