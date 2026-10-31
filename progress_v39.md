# v39 progress — Reed fiber + melee/ranged skills + wolf memory (spec: specs/reed_fiber_DRAFT.md, FINAL)
One line per piece once green (times PT). Earlier pieces were smoke-tested before this file was created; logged here retroactively at 5:36 PM PT Oct 30.
- reeds regrow (src/reeds.js beds, rbrng): green (smoke seed 2, 60 days; beds regrow, burn, return)
- fiber / cord (soak, beat, twist): green (smoke; First soaked reed, First fiber)
- wrap (fiber wrap, wear, patch): green (smoke; First fiber wrap)
- rope uses (hut / cache lash, binder): green (smoke)
- bow / arrows (src/bow.js: string, cut arrows, load, shoot, recover, snap): green (loads; G.Bow 19 keys)
- melee / ranged + group strength (src/fight39.js: G.Skills, R judgment, archers, desperate defence): green (smoke seed 2, 60 days: 5 desperate rolls, 2 wounds, round-trip equal)
- wolf memory (src/wolfmem.js + animal.js hooks): green (smoke: wounded wolves remember, keep distance, caution; round-trip equal)
- gesture sparring (src/spar.js): loads; covered by headless tests 17-18
- migration 38 -> 39 (Reeds.migrate seed rerun, skills seeding, wolves): green (fixture tests/fixtures/save_v38.1.json from tests/make_save_v38.1.js: beds "seed" 47, melee 38 / 60 / 20)
- headless_v39 (tests/headless_v39.js, all 26 spec cases + Director member-overlap i/ii): green, 118 passed / 0 failed
  - fixes found by tests: spar.js finish no longer depends on agent order; wolfmem keepAway hardened (path probes, closer-tile trimming, config wolfMemory.keepMargin 0.5)
- Artist art wiring (6:00 PM PT): reed_soaked, bed_0-3, fiber bundle/cord/coil, wrap layer_1-3 + worn, bow unstrung/strung/draw, 4 arrow frames, arrow_fly rotated (drawFlights centre fix), hut lashed overlay, wolfWounded, spar mirrored + 75% kid, child play_stance, disc_* icons; data.artVersion 39, R.artUrl adds ?v=39: green
- UI: Skills person tab (ui.skillsTab, gear chips), wolf inspect memory/caution/wounded (ui.wolfCard), Discoveries icons (ui.discIcons): green
- URL fixtures ?fixture=v39&kind=fiber|bow|spar|wolf|hut|beds (Spar.fixture + G.debug.v39Fixture, test-only, paused): green
- chrome_v39 (1366x768 + 390x844, node --experimental-websocket): green, 63 PASS / 0 FAIL; 0 JS errors, 0 missing files, every js/css/png request ?v=39; min text 16px, min tap 44px. Shots in /workspace/godsim-previews/v39/
- headless_v39 re-run 6:10 PM PT: the "startBout only from stepStance" source scan counted the 2 calls in the test-only Spar.fixture (117/1); the scan now stops at Spar.fixture -> 118 / 0
- regressions: headless_v38 232 / 6 (5 version pins + "(e) still 5 person tabs", broken on purpose by the Skills tab); headless_v38_1 12 / 0
- eco_v39 (8 seeds x 1 year): green, deer and wolves alive at every season end on 8 of 8 (tests/eco_v39_output.txt)
- 6:13 / 6:14 PM PT Judge round (finished ~6:55 PM PT):
  - Keep-away slope WolfMem.keepDist = 2 + 5 x (s - 30) / 70, clamped to 2-7, 0 below 30. 5 headless checks: green.
  - Natural-year tune by rates and preconditions only: eco_v39 all PASS (cord 5 seeds, wrap 6, bow 4, shots on 1 seed (13 shots, seed 3), spar 5, wolf deaths 24 vs baseline 25, wound deaths 7 vs 5).
  - Fix: a generic try no longer turns a cord, bundle, wrap or arrow into a shard (objects.js).
  - New bow.keepReady and bow.fetchHungryTiles; wrap.tryBelowWarmth 70 -> 75.
  - Desktop CSS: the card stops above the Powers menu and its body scrolls.
  - Reruns: headless_v39 127 / 0, headless_v38_1 12 / 0, headless_v38 232 / 6 (the expected 6), chrome_v39 63 / 0.

## v39.3 (Oct 30 2026, ~8:50 PM PT): People-card clicks fix (v39.2 ships as-is)
- Bug: desktop People cards were rebuilt (innerHTML) about once a second, even while paused, so a press could land on a card that was replaced before release; 4/40 human-speed clicks selected nobody (v39.2 code, 1920x1080 and 1366x768).
- Fix (src/ui.js UI.panelRender.people): cards are updated in place (name, sub line, bar width, warn class, selected); the list is rebuilt only when its structure changes (who / order / group tabs / dead list); never while a pointer is down on it (deferred to pointerup); paused with nothing changed = no DOM writes at all; clicks are delegated on the panel.
- Every ?v= ref is now 39.3 (index.html 47, console.css fonts 5); G.data.artVersion "39.3"; saveVersion stays 39.
- Tests: tests/chrome_v39_3.js (chrome_v39_2 at ?v=39.3 + paused no-mutation check + 40 clicks paused and running, both desktop sizes), tests/p393_clicks.js (self-contained repro), tests/p392c_repro.js (Tester's original, drives localhost:8787).
- Results: p393_clicks 40/40 at both sizes (v39.2 code: 36/40); chrome_v39_3 89/89 x3; headless_v39_1 33/33; headless_v39 127/127.
