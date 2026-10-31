# v39.1 DRAFT: rain chills people (awake or asleep), wetness, Powers as a desktop tab

Status: prepared in /workspace/godsim only. Not published. godsim-rc not touched. Cache tags are ?v=39.1 (art too). saveVersion stays 39, and there is no migration because `a.wet` is optional and absent means dry.

## 1. Rain and warmth

### Commissioner report
"The rain still doesn't effect colonist warmth. They don't even register it's raining especially if they are sleeping."

### Root cause (v39 refs are godsim-rc)
1. **Trees blocked all rain.** `Powers.exposure` (powers.js:170) returned 0 on any woods tile. People like to sleep and shelter under trees, so most of the colony was "dry" in any rain. The spec value was half.
2. **There was no wetness.** The rain effect only applied while a person stood in rain on an exposed tile. One step under a tree switched it off at once, and nothing carried over after the rain stopped.
3. **Sleepers never noticed.**
   - The first-drop reaction skipped sleepers (powers.js:240).
   - The "too long in the rain" clock only counted awake people.
   - Sleep only woke someone at warmth < wakeBelow (10), and never at a "good spot" such as under trees (agent.js:197).
   - Result: a sleeper in the rain just lay there, and the only sign was a slightly faster drain.
4. **Fire cancelled the rain.** Any fire heat skipped the climb block and the drain entirely (agent.js:503-505).
5. **The climb block was all-or-nothing.** It applied fully even in a hut (exposure 0.15).
6. **Nothing in the UI showed it.** The card gave no hint of rain or wetness.

### Fix (/workspace/godsim)
- **config.js**
  - New in `powers.rain`: `woodsKeepOff: 0.5` (trees keep half the rain off) and `coverAbove: 0.5`.
    - Someone counts as "out in the rain" only when exposure > 0.5.
    - So trees, huts and shelters count as cover for seeking and waking, but trees still let half the rain through.
  - New `person.warmth.wet` knobs:
    - soakPerHour light/medium/heavy: 30/60/120
    - dryPerHour 6, shelterX 1.5, fireX 5, fireKeep 0.5
    - chillC 4
    - gear: hide 0.35, sleepHide 0.35, wrap 0.2; gearMax 0.5
    - seekAdd 10
    - wakeWetAt 70, wakeColdBelow 25
    - soakedAt 60, driedBelow 10
- **powers.js**
  - Woods exposure is now 0.5.
  - Added `Powers.outInRain` and `Powers.coverAbove`.
  - `seekCover(sim, a, act, wake)` can be called on waking and logs "X gets up and heads for the fire / the hut / the trees".
  - Awake people log "X feels the rain start", or "X hears the rain overhead" when under cover.
- **climate.js**
  - Rain chill is reduced by rain gear (`Climate.rainGear`: a worn hide, or a sleeping hide while asleep, plus a wrap, capped at 0.5).
  - Wet skin feels `chillC × wet/100` °C colder (shown as `felt.wetC`), including after the rain has stopped.
- **agent.js**
  - `stepWet`: wetness (0-100) rises toward `100 × exposure × (1 − gear)` (× (1 − fireKeep) by a fire) at the soak rate.
    - Above that target it dries at dryPerHour: ×1.5 under cover, ×5 by a fire.
    - Logs "X is soaked through" and "X has dried off (by the fire)".
  - Wet people seek warmth sooner (seekAdd × wet).
  - The climb block now scales with exposure instead of being all-or-nothing.
  - `rainWake` runs at the top of sleep. A sleeper out in the rain who is soaked (≥70) or cold (warmth ≤ 25, adjusted by coldFear) wakes at most once per rain.
    - Logs "X wakes up soaked / cold in the rain".
    - She then heads for cover, then for warmth. If she finds neither, she logs "finds no cover and curls up again".
    - Unconscious and hypothermic sleepers are skipped.
  - The exposure clock uses `outInRain`.
- **ui.js**: the card's "feels like" line adds ", in the rain" and ", damp / wet / soaked".
- **No-rain runs are RNG-identical to v39.** The new fields (`wet`, `rainWoke`, `soakLogged`, `stats.rainWakes`) are only written when it rains.

### Spot numbers (/tmp repro, warmth after the run, dry vs medium rain)
| Case | Dry | Rain |
|---|---|---|
| Idle in the open | 81.9 | 66.7 (logs feels / soaked / heads for cover) |
| Asleep in the open | 74.4 | 63.9 (woke, moved under the trees) |

headless_v39_1 fixtures:
| Fixture | Dry / without | Rain / with |
|---|---|---|
| Pinned sleeper (open) | 56.3 | 35.5, wet 100 |
| Hut sleeper | loss 0 (wet ≤ 15) | open sleeper loss 20.8 |
| By a fire | wet 50, warmth 100 | open: wet 100, warmth 58.2 |
| Worn hide | wet 65, chill −9.5 | without: wet 100, chill −13 |
| Woods sleeper | 68.8 | 56.3 (damp ≤ 50, not woken). In v39 rain had no effect under trees. |

## 2. Powers as a bottom tab on desktop
- **Before:** on desktop / landscape (≥701px) `#ptab-powers` was hidden and the Powers menu was always shown.
- **Now:** every layout uses the phone mechanism (`body.pw-open`, `UI.powerRow`).
  - The Powers tab sits in the bottom bar with the other tabs, and the menu is closed by default.
  - Tapping the tab opens the menu. Tapping it again, picking a power, or pressing Esc closes it.
  - Powers behaviour is unchanged.
- **index.html**
  - `#panelbar #ptab-powers { display: flex }`.
  - `@media (min-width:701px),(orientation:landscape) { body:not(.pw-open) #powers { display:none } }`.
  - The desktop info card reserves the 236px menu gap only while `pw-open` (`--pw-h`).
  - Phone: the open menu sets the person card aside (`body.pw-open #info { display:none }`), and the card comes back when the menu closes. In v39 the two overlapped.
- Screenshots are in /workspace/godsim-previews/v39_1/. desktop.png shows the desktop with the menu open beside the card. Closed, open and rain-card shots are included for 1366x768 and 390x844.

## Tests
| Test | Result |
|---|---|
| tests/headless_v39.js | 127 / 0 |
| tests/headless_v38_1.js | 12 / 0 |
| **new** tests/headless_v39_1.js: awake, pinned, asleep, once per rain, hut, fire, hide, woods, drying, save/load, no-rain | 33 / 0 |
| tests/chrome_v39.js (version regex accepts 39.x) | 63 / 0 |
| **new** tests/chrome_v39_1.js: 1366x768 + 390x844, Powers hidden until tab, no overlap with card or tab bar, tab closes it, Rain → picker → armed, card shows "in the rain, soaked", 0 JS errors, 0 404s, all ?v=39.1 | 28 / 0 |
| **new** tests/eco_v39_1.js: 8 seeds × 1 year, v39 vs v39.1 | see below |

### Eco / pop, 8 seeds × 1 year, deaths by cause (summed)
| Run | Version | Deaths | Alive at end | Person-hours below 25 warmth | Other |
|---|---|---|---|---|---|
| (a) no rain | v39 | wolves 24, wounds 7 | 15 | 0 | |
| (a) no rain | v39.1 | wolves 24, wounds 7 | 15 | 0 | identical on every seed (state hash) |
| (b) rain every 4th day | v39 | wolves 23, wounds 7 | 16 | 25 | |
| (b) rain every 4th day | v39.1 | wolves 24, wounds 6 | 16 | 30 | 113 notices, 45 rain wakes, 2706 wet person-hours, max wet 100 |

- **Cold deaths:** 0 in both versions. The effect is modest, as requested.
- **Unrelated:** wolves are the main killer in v39 itself, which is worth a separate look.
