// Tile types. id = index into the map's tile array.
(function (G) {
  G.data = G.data || {};
  G.data.tiles = [
    { id: 0, key: "meadow", walk: true,  water: false, color: "#7fb352", fleck: "#9bcc68" },
    { id: 1, key: "woods",  walk: true,  water: false, color: "#3f7a3a", fleck: "#2c5a2a" },
    { id: 2, key: "sand",   walk: true,  water: false, color: "#d8c98f", fleck: "#c4b37a" },
    { id: 3, key: "river",  walk: false, water: true,  color: "#3f8fcf", fleck: "#7cc0ee" },
    { id: 4, key: "lake",   walk: false, water: true,  color: "#2f6fb0", fleck: "#6aa8e0" }
  ];
  G.data.T = { MEADOW: 0, WOODS: 1, SAND: 2, RIVER: 3, LAKE: 4 };
})(this.GS = this.GS || {});
