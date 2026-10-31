# FREEZE NOTES v39.1 (rain warmth fix + Powers as desktop tab)
Frozen 2026-10-30 into godsim-rc (identical to godsim, diff -rq clean).
Backup of v39 rc: /workspace/godsim-rc-v39.

- Spec: specs/fix_rain_warmth_DRAFT.md
- All 46 index.html refs at ?v=39.1. saveVersion stays 39 (no schema bump), so v39 saves should load as-is.
- Tests rerun inside rc: headless_v39_1 33/33 PASS, headless_v39 127/127 PASS.
- Browser test: tests/chrome_v39_1.js (for Tester).
- No v39 save fixture exists in tests/fixtures (only save_v37.2, save_v38.1). Tester: make one from godsim-rc-v39 to check v39 -> v39.1 load.
- Carried-over deferred items from v39: fragile wrap trigger at 75, seed 1 has no reeds, wound deaths 5 -> 7.
Not published.
