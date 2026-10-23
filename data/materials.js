// Material property table (step 10). Every physical outcome (spark, break, sharp edge, scrape, cut, burning) is computed from these numbers
// by the rules in config.physics / config.fire - there is no list of recipes or inventions anywhere.
// All properties are 0-100:
//   hardness   how hard the surface is (resists dents and scratches; a harder thing chips or breaks a softer one)
//   sharpness  how keen its edge or point is
//   dryness    how dry it is (dry and soft = burns; wet/green = does not)
//   durability how tough it is against breaking (100 = practically unbreakable)
//   burns      true if it is fuel (organic); stone and flint never burn
// A broken piece keeps its material, takes form "shard", and its new edge comes from its hardness (config.physics.break.edgeFromHardness).
(function (G) {
  G.data = G.data || {};
  G.data.materials = {
    rock:  { label: "rock",  hardness: 70, sharpness: 10, dryness: 100, durability: 95, burns: false },
    stick: { label: "stick", hardness: 25, sharpness: 15, dryness: 70,  durability: 30, burns: true },
    flint: { label: "flint", hardness: 80, sharpness: 45, dryness: 100, durability: 60, burns: false },
    bone:  { label: "bone",  hardness: 55, sharpness: 10, dryness: 85,  durability: 75, burns: false },  // bone chars but does not burn away
    meat:  { label: "meat",  hardness: 5,  sharpness: 0,  dryness: 10,  durability: 20, burns: false }   // step 16: raw flesh taken from a fresh carcass (wet: does not catch)
  };
})(this.GS = this.GS || {});
