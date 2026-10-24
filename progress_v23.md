# godsim v23 / step 26b — progress (freeze)

**Save:** v23 (`?v=23`). **Scope:** materials + predators + mild climate + person-card tabs + People tabs + zero-point (hypothermia + energy) + prayer why banks + rain cover.

## Locked numbers (Director)

| Item | Value |
|---|---|
| `climate.seasonMeanC` | `[18, 23, 19, 15]` |
| `climate.dayAmpC` | `4` |
| Hypo stages (min at warmth 0) | shiver / confusion **30** / clumsiness **120** (move ×0.6) / drowsiness **240** / unconscious **480** |
| `person.death.warmthZeroMinutes` | **4320** (3 days) — after full hypo ladder |
| `person.death.energyZeroMinutes` | **7200** (5 days) — after sleep-dep ladder |
| Energy drain / refill | **960** min awake → 0 / **480** min sleep refill |
| Rain cover | raise ≥30 min; force ≥2 h; urgent ≥4 h; headless ≥4/5 under cover by 3 h |
| Prayer why cool | `WHY_COOL_H = 2` |

## Story lines (action-only; no shiver overlays)

**Hypothermia stages:** shivering → stumbling / looking lost → moving slow / dropping things → nodding off / slowing further → collapsed / not getting up.

**Death (after full ladder only):**
- Warmth → cause `cold`; log “froze” / “didn't wake from the cold”
- Energy → cause `exhaustion`; log “never woke” / “worn down to nothing”

## What's in

1. **Hypothermia** — stages + logs; death only at 4320; rescue when warmth > 10 while unconscious.
2. **Rain cover** — progressive seek; Medium rain headless 4/5 covered by 3 h.
3. **Energy zero-point** — collapse → forced sleep; confusion @1d; hallucinations @2d; death @7200; panel word `sleep-deprived`; food never fills Energy; drainMinutes 960 so founders sleep by night 1.
4. **People tabs** — All + one tab per group; oldest → youngest; Energy meters; no name/age sort picker.
5. **Prayer why tags** — Story banks all needs; skip `, why` if same person+need within ~2 h; death lines unchanged.
6. **Climate** — mild means + dayAmp 4.
7. **Materials / predators / card tabs** — deer / wild dog / Wolves labels; jitter±flex; deposits; mountain art; reeds banks-only; Wolves pack territory; person-card Needs·Mind·Kin·Knows.

## Verify (pre-freeze) — ALL GREEN

| Check | Result |
|---|---|
| `node tests/headless_26b.js` | **PASSED** (materials, predators, climate, tabs, prayers, hypo 30/120/240/480, rain **4/5** covered by 3 h, timers 4320/7200, drainMinutes 960) |
| Focused deathCause | warmth @4320 → `cold` + Story line; energy @7200 → `exhaustion` + Story line; alive at 10 h / 8 h unconscious |
| `node tests/headless_powers.js` | **POWERS PASSED** (rain cover 5/5 went for cover) |
| Chrome `ONLY=desktop_1280x800_http` | **CHROME CHECK PASSED** (save agents=4 v23; by 22:00 founders asleep 4/4) |

## Freeze

- `godsim-rc-v22` already present (prior v22 backup) — not overwritten.
- Copy `/workspace/godsim` → `/workspace/godsim-rc` (replace). **No live publish.**

## Out of scope (unchanged)

Moods / disease / tools / bows. Live publish untouched.
