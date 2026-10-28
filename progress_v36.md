# Progress — saveVersion 36 / §39 People UI polish

**Not frozen yet** (waiting Tester blockers-only after freeze).  
Live stays v35. `/workspace/godsim-rc` untouched (still 35).

Build time: 2026-10-28 02:23 PDT (America/Los_Angeles).

## Done
- `data/config.js` — `saveVersion: 36`
- `index.html` — all `?v=36` (incl. `theme.css`); live overrides for fluid `people-ui` / `pp-*`
- `data/ui/theme.css` — Artist tokens already present (`.people-ui` / `pp-*`: brown tabs, cyan bars, warn, Hap/Sad/Ang, Mind skills). Used as-is from mock.
- `src/ui.js` — markup aligned to `godsim-previews/card_tabs/mock.html`:
  - People panel: `.people-ui` > `.pp-list` + `.pp-groups` tabs + `.pp-rows` / `.pp-row` + mini cyan bar
  - Inspect card: `.pp-card` + `.pp-cardhead` (← → Find) + `.pp-tabs` + Needs `.pp-meter` + `.pp-mood` + Mind `.pp-skill`
  - `UI.peopleCycleList` / `UI.cyclePerson` (respect `peopleFilter`, oldest→youngest)
  - Find = existing `UI.find` via `data-find` on `.pp-find`
  - **No** portrait strip
- `src/sim.js` — migrate **35→36** (UI-only no-op version bump)
- Headless: `tests/headless_people39.js` — **ALL PASS**
- Out of scope held: rain warmth, animal weather, deer flee, lightning animals, fiber — untouched

## Spec check (§39)
- Scrollable People list + group tabs — yes (pp-list / pp-groups)
- No top portrait strip — yes
- Denser dark inspect; tabs Needs/Mind/Kin/Knows/Log — yes (pp-tabs)
- ← → + Find on card — yes
- Needs horizontal bars + status words; Hap/Sad/Ang mood line — yes
- Mind denser skill-list bars — yes (pp-skill)
- Artist theme (brown tabs, cyan bars) — yes (theme.css people-ui)
- Existing data only — yes
- migrate 35→36 — yes

## Next
- Freeze to godsim-rc when Director/parent says; Tester blockers-only; Judge publish.
- Live stays 35 until publish.

## Paths
- Working: `/workspace/godsim` (v36)
- RC: `/workspace/godsim-rc` (v35, untouched)
- Mock: `/workspace/godsim-previews/card_tabs/`
- Headless: `/workspace/godsim/tests/headless_people39.js`
- This note: `/workspace/godsim/progress_v36.md`

## FROZEN
2026-10-28 02:24 PDT — mirrored to /workspace/godsim-rc (saveVersion 36); headless_people39 ALL PASS in rc; index ?v=36 (37 refs). Backup godsim-rc-v35 untouched. Ready for Tester (blockers-only). Not deployed.
