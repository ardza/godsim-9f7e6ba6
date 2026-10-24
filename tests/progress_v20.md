# v20 progress (step 25 local language) — not frozen

## Status
Done in /workspace/godsim only (godsim-rc untouched).

## Delivered
- `data/words.js` synced from Story Writer `words.json` (6 meanings × 8 syllables)
- Artist `gesture_16.png` / `child_gesture_16.png` registered in `data/art.js`
- `src/speech.js`: invent, emit, bind, group lock, copy, gestureNow, outcome hooks (`onEat`/`onDrink`/`onWarm`/…)
- `config.speech` + `saveVersion: 20`; `Sim.migrate20`; own `wrng` stream; serialize/deserialize
- UI person card: Speech: none / N shared words (+ chips)
- Render: transparent gesture overlay on down-facing frame until group speech locks that token
- `index.html`: `words.js` + `speech.js`, every `?v=20`
- `tests/headless_speech25.js`: invent, bind, group threshold, migration, pickWord
- Fixed pre-existing powers23 loadArt regex (rainLight/rainHeavy broke `"rain", "lightning"]`)

## Tests
- headless: PASS (see `tests/headless_v20_run2.txt`)
- chrome `ONLY=desktop_1280x800`: PASSED (`tests/chrome_v20_desktop.txt`)
- chrome `ONLY=phone_390x844`: PASSED (`tests/chrome_v20_phone.txt`)
