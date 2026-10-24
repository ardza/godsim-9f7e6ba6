# godsim v24 — Moods (step 27)

Freeze target: replace `godsim-rc` with this tree. No git / no live publish.

## What’s in
- **saveVersion 24**, every `index.html` script/CSS link `?v=24`
- **Moods** per person: Hap / Sad / Ang 0–100, float toward baseline ∼40 when needs fine
- **Dominant** = highest of three if ≥60 (else none) → multipliers on existing rolls only:
  - Invent: hap ×1.35; sad ×0.7; ang ×1.1 strike/cut
  - Bind: hap ×1.25; sad ×1.2 ritual; ang ×1.2 useful break/sharpness
  - Prayer: sad ×1.5 start; hap ×0.85
  - Hunt/contest: ang ×1.4; hap prefer share/copy
  - Banding: ang avoid non-group; sad seek group ≤15; hap ×1.2 copy from group
- Rise/fall: needs, liked nearby, alone at night, liked death ≤10 tiles, hunger day, liking hits, contested take, Wolf chase; falls via time / hunt-share / ritual / hap rising
- **UI:** Mind tab Hap / Sad / Ang numbers only (≥16px), no icons
- Action-only mood logs (never “feels sad”); fear traits unchanged
- `src/moods.js`; migrate23→24; hooks in Faith / Speech / Items / Learn / Hunt / Social / Animal / Corpse / Sim / Agent / Family / UI

## Headless
`node tests/headless_moods27.js` — **PASS**
1. Liked death → sadness up + head-down log; more prayer starts when sad dominant
2. Prosperity invent/try total > stressed (30d)
3. Wolf chase → anger up + flee / seek group
4. migrate23→24 + save round-trip v24

## Soft notes
- Hap ×1.25 discover reinforce is on Speech.bind; material try success has no separate score reinforce (invent attempt rate already ×1.35)
- Speech invent still needs a low need, so happy-prosper invent shows mainly as material tries
- Out of scope: permanent personality, romance, scripted beats

## Backup
- Prior freeze kept at `/workspace/godsim-rc-v23` (saveVersion 23)
