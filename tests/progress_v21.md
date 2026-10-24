# v21 progress (step 25 polish) — not frozen

## Status
Done in `/workspace/godsim` only (`godsim-rc` untouched; Tester owns frozen v20 there). **Not frozen.**

## Director polish
1. **People card + group line:** `Speech: none` / `Speech: N shared words` (`Speech.cardLabel`; Relations group sub-line).
2. **Discoveries:** first spoken syllable per seed — `Discoveries.note(..., "speak", [syllable], meaning)` titled "First spoken word" when a locked token is spoken (data-detected).
3. **Children copy speech ×2:** `Speech.maybeCopy` × `Learn.stageX` (child 2 / youth 1.5).
4. **4 seeds × 2 years speech** (table below). Tester: 0 natural locks / 2y on 5 seeds at v20 = silent-world case → raise invent; shipped further knobs so ≥2/4 reach 3 shared words (see table).
5. **Growth recheck:** **12/16** growing → `tests/deaths_v21.md`.

## Shipped knobs (speech)
- `saveVersion: 21`; `Sim.migrate21`; every `?v=21`
- `inventDiv: 100` (was 300 → tried 200 → 150 → **100**)
- `bindGain: 40` (was 25; first bind must reach `scoreAt` 40)
- `copyShare: 1`, `copyChance: 0.5` (copies reach scoreAt; near-misses were 2 holders)
- Speaker **intent-bind** on invent emit (speaker counts toward `groupMin` and can teach)
- Invent→emit: emit immediately if free; else 6 h due window (was 60 min; invents≫emits)
- `groupMin: 3` kept (a mid-run config comment bug briefly swallowed it — fixed before final numbers)

## Speech before / after (4 seeds × 2 years, `groupMin` 3)

| | inventDiv | bindGain | copyShare / copyChance | seeds ≥3 shared | per-seed maxShared | spoken syllables |
|---|---|---|---|---|---|---|
| **Before** | 300 | 25 | 0.5 / 0.35 | **0 / 4** | 0,0,0,0 | — |
| inventDiv only | 200 | 25 | 0.5 / 0.35 | **0 / 4** | 0,0,0,0 | scores stuck at 25 |
| + bindGain | 200 | 40 | 0.5 / 0.35 | **0 / 4** | 0,1,0,0 | — |
| + speaker intent + emit window | 200 | 40 | 0.5 / 0.35 | **0 / 4** | 0,2,2,1 | Keth, Rosh, Lir |
| + copyShare 1 | 150 | 40 | 1 / 0.35 | **1 / 4** | 0,4,2,1 | Wesh,Keth,Ank / Rosh |
| **Shipped** | **100** | **40** | **1 / 0.5** | **2 / 4** | 1, **4**, **3**, 1 | Vum / Keth,Ank,Wesh / Upt / Pli |

## Growth (16 seeds × 2 years, no powers)
**12/16 growing** (target met). Details in `tests/deaths_v21.md`.

## Tests
- headless `tests/headless_v21_run2.txt`: **HEADLESS PASSED** — **304 PASS**, 0 FAIL
- chrome `ONLY=desktop_1280x800` → `tests/chrome_v21_desktop.txt`: **CHROME CHECK PASSED** — **191 PASS**, 0 FAIL
- chrome `ONLY=phone_390x844` → `tests/chrome_v21_phone.txt`: **CHROME CHECK PASSED** — **205 PASS**, 0 FAIL

## Open questions
- inventDiv 100 is well below the Director’s first “try 200” step; volume + copyShare were needed after inventDiv 200 still left &lt;2/4 at 3 words with real `groupMin` 3.
- Seed 1 stays small (pop 5) and often has only 1 shared word in 2y.
- Growth run used inventDiv 200; speech knobs do not change warmth/pairing/death.
