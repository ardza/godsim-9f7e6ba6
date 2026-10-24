# godsim v25 — Disease (step 28) + person-card Log tab

Freeze target: replace `godsim-rc` with this tree. No git / no live publish.

## What’s in
- **saveVersion 25**, every `index.html` script/CSS link `?v=25`
- **Disease** (`src/disease.js`, own stream `drng`): lasting `a.sick` from raw meat / corpse eat
  - Energy drain ×1.5, Fullness drain ×1.25, duration 1–3 days
  - Spread within 2 tiles: chance `(100−curiosity)/800` per hour
  - Scavengers at rotting bodies seed once per day
  - Rare death while sick if Fullness **and** Water both under 20 (`deathChancePerHour` very low)
  - Recover score: sleep while sick, drink, cooked meat, berries, sit by fire → clear at 100; first recovery → Discoveries (“First recovery”)
  - Speech: if group has locked “danger” word, sick people may emit it when Energy under 30
  - Action-only logs (`retches` / `doubles over` / `stands straighter`) — no “I feel sick”
- Hooks: Agent drains + doing “, sick”; Hunt / Corpse infect; drink / berries / Cook.ate / sitFire recover; Sim.step + migrate24→25
- **UI Log tab** (Artist mock `/workspace/godsim-previews/card_tabs/`):
  - Person tabs: **Needs · Mind · Kin · Knows · Log**
  - Personal events in Log pane only (`Name's log`); header + Find outside tabs
  - Removed under-card `#plog` / `#plog-sec` strip
  - Tab labels ≥16px, taps ≥44px (`.pcard-tab`)
  - Needs pane shows Sick line when infected

## Headless
`node tests/headless_disease28.js` — **ALL PASS**
1. Infect → lasting sick, drain ×1.5 / ×1.25, 1–3 days, action-only log
2. Drink / sleep recover; first recovery → Discoveries
3. Danger word emit when locked + Energy &lt; 30
4. ≥1 outbreak + ≥1 recovery on 4 seeds
5. Sickness deaths rare (&lt;2 on 16 seeds; measured 0)
6. migrate24→25 + save round-trip v25
7. UI: personTabs Log; no under-card strip; ≥16px / ≥44px; `Name's log` title

## Soft notes / gaps
- Director may still tweak disease rates (spread / recover / death) — current death rate locked low for rarity proof
- Bodies / babies no longer show a personal log strip (Log tab is person-only)
- Out of scope: magic heal, tools (§29), publishing live

## Backup
- Prior freeze kept at `/workspace/godsim-rc-v24` (saveVersion 24)
