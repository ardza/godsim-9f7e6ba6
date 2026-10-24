# v19 → v20 progress (power rewrite + Artist icons) — ready to freeze when headless green

Tree note: while this pass ran, save bumped to **v20** (local language / speech). Power rewrite and Artist icons remain; `?v=20` / `saveVersion: 20`. Not frozen; no deploy; `godsim-rc*` / `rpg` / git untouched.

## Power rewrite (Director / Commissioner)
- No cooldowns on Rain / Warm / Cool / Lightning / Spawn.
- Rain: Light / Medium / Heavy picker → tap (r8). Medium = prior rain. Light = short/mild (`douse: small`). Heavy = long/hard (`douse: all`, wet 2 days).
- Lightning: Single bolt / Barrage picker → tap. Barrage = 2–3 land bolts in scatter 8.
- Warm / Cool / Spawn unchanged except no cooldown. Phone: shared `#spawnpick` slide-up; opening Powers row closes an open picker.

## Artist icons + overlays (Judge)
- Synced: `node tools/sync_icons.js` → `src/icons.js` (26 icons).
- Picker: `rain_light` / `rain_medium` / `rain_heavy`, `bolt_single` / `bolt_barrage` (24px, currentColor) on Rain/Lightning buttons (≥44px).
- Overlays: Light → `rain_light_16.png`, Medium → `rain_16.png`, Heavy → `rain_heavy_16.png`.

## Chrome
- `ONLY=desktop_1280x800` → **PASSED** (`tests/chrome_v19_desktop4.txt`) — rain/lightning pickers show Artist icons.
- `ONLY=phone_390x844` → **PASSED** (`tests/chrome_v19_phone4.txt`) — including lightning picker + phone row cast.

## Headless
- Mid-run fail on v19→v20 bump (`tests/headless_v19_run5.txt`, 288 PASS / 5 FAIL, version skew).
- Re-run in flight: `tests/headless_v19_run6.txt` (expect ~293+ with speech25).

## Open questions
- Light `douse: "small"` = sticks + non-hold embers out; burning tiles + hold embers left.
- Shared picker id stays `#spawnpick`.
