# Progress v26 — §29 Tools (Oct 24, 2026)

## Ship
- `saveVersion: 26`, all `index.html` `?v=26`, new `src/tools.js`
- Carried tools when Learn score ≥45 (start is 50):
  - **flake** — sharp rock/bone/flint (strike/cut/rub) → dig×0.7, cut×0.6
  - **crude axe** — stick + sharp head bound by reed (else friction-fit) → dig×0.5, chop trees slow
  - **long stick (spear)** — reach berries (2 tiles) / poke scavengers
- Idle bind (curiosity); durability from hardness; dulls with use → lose bonus, then break
- First craft → Discoveries (`action: craft`)
- Overlays: `data/art/flake_16.png`, `axe_16.png`, `spear_16.png`, `tools_16.png` (wired in `art.js` + `render.js`)
- migrate25→26 adds `toolStats`; disease/Log (v25) unchanged

## Proof (`node tests/headless_tools29.js`)
- Unit: lock flake/spear/axe, Discoveries, digTool+digMult, onTry, dull
- Multi-seed: **8/8** seeds crafted ≥1 tool type (need ≥3/8); Discoveries craft on all
- migrate25→26 + round-trip; `?v=26` everywhere

## Freeze
- Keep `/workspace/godsim-rc-v25` (live was v25)
- Copy `/workspace/godsim` → `/workspace/godsim-rc`
- Do **not** publish
