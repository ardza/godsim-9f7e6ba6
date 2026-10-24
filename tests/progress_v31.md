# Progress v31 — Group identity (§34)

**Save:** 31 (`?v=31`)  
**Spec:** `specs/15b-17.md` §34 — LOCKED  
**Date:** 2026-10-24 (America/Los_Angeles)  
**Status:** FROZEN to `godsim-rc` for Tester blockers-only. Live stays 30 until Judge publishes.

## §34 Group identity

- Replace “Group N” with short syllable display names from Story’s list (`data/group_names.json` → `data/group_names.js`, 32 names).
- Gate unchanged: **3+ shared speech words** AND (**prayer spot** on `g.sacred` OR **shelter cluster** = 2+ members know the same natural shelter id).
- Seeded pick (`RNG.hash2(groupId, 34, seed)`), unused names preferred; persisted as `g.name`; preserved across `Social.daily`.
- People tab + person cards use `Social.groupName` (syllable once set, else “Group N”).
- Discoveries group field uses the syllable name once set.
- Names are UI labels only — no naming log lines, no speech quotes for outsiders.
- Migrate 30→31: qualifying groups get a name; unqualified stay “Group N”.

## Files
- `data/group_names.json` / `data/group_names.js` / `tools/sync_group_names.js`
- `src/social.js` (qualifies / pick / maybeName / refreshNames / preserve name)
- `src/speech.js`, `src/faith.js`, `src/shelter.js` (refresh on qualify path)
- `src/sim.js` (migrate31), `data/config.js` (saveVersion 31), `index.html` (`?v=31` + script)
- `tests/headless_group34.js`, `tests/progress_v31.md`

## Headless
`node tests/headless_group34.js` — **ALL PASS**
- qualify → name from list; People/card not “Group N”
- shelter-path qualify; uniqueness across groups
- name survives daily; Discoveries field
- migrate 30→31

## Standing
- Action-only logs; data-driven; outsiders still hear noise only.
- Out of scope: player rename UI, flags, heraldry, Meeting strangers.
- Art hut/ore/tip is for v32–v34 — not used here.

## FREEZE
- Backup `godsim-rc-v30` left intact.
- `godsim-rc` replaced with working copy (v31).
