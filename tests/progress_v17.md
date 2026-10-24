# v17 progress (step 22: Rain/Warm/Cool powers)
- 1:49 PM start: read spec 22, v16 state (headless 257, chrome 152/154).
- 1:51 PM steering: pairs man+woman only (same-sex = friendship, never removes from mating pool) + headless test; births per seed in deaths_v17 (target 14/16). Fire-fear step-in, shelter cap, thicket routing approved.
- 1:52 PM mixedOnly pairing in (config family.bond.mixedOnly); 16-seed run of pairing-only snapshot -> /tmp/v17a (snapshot /tmp/gs_pairs)
- 1:56 PM config powers block, src/powers.js, hooks (sim/climate/agent/fire/world), migrate17, ?v=17 done; next: headless run
- 2:06 PM pairing-only 16-seed run: births on 14/16 (42 births), 3 cold deaths, 13/16 grew (v16: 31 on 11/16, 4 deaths, 10/16). Headless version checks moved to 17; headless rerun in bg -> /tmp/h2.txt

## Step: UI, render, tests (in progress)
- Powers bar `#powers` (inside #mapbox, bottom-left, above the tab bar): Rain / Warm / Cool buttons (icon + label + cooldown, >= 48px tall, 16px text).
  Tap to arm (aria-pressed, crosshair cursor, dashed circle preview under the mouse on desktop), tap again or Escape cancels; armed + tap on the map -> `app.castPower` -> `Powers.cast`, toast.
  A tap while cooling only toasts "Rain is ready in 42 min".
- render.js `drawPowers` (before darkness): tint disc per active effect (warm/cool fade over the last 2 h), rain_16.png frame floor(t*1000/150)%4 tiled on every tile in a raining circle (fallback: streaks).
- data/art.js: `rain` entry. Puddles: tiles within 2 of open water skipped (a hollow beside the lake added nothing; the person drank at the lake instead).
- tests/headless_powers.js (required by headless.js, also runnable alone): 16 checks, all PASS standalone.
- chrome_check: step 22 block (bar sizes/hit/overlap, arm/cancel/cast/cooldown refusal, art loaded).

### Update (Fri Oct 23, 2:50 PM PDT)
- Phone http arm/cast check failed: headless Chrome stops delivering emulated touch to a tab after http navigations (same harness issue the rcfix block handles). The step 22 block now opens a fresh tab first on phones. Phone run: 160 PASS, 0 FAIL.
- Parent call: the People tab's first meter label is now "Fullness" (it was "Food"), matching the card. The chrome check now looks for Fullness and not Food.
- Parent call: `shelterStats.learned` is wired to `Shelter.learnedCount` in `Shelter.step` and refreshed hourly. It is read-only and uses no rng, so runs are unchanged. New headless check added.
- The final headless run (/tmp/h4.txt) and the 16-seed table (/tmp/v17b) are running.

### Final (Fri Oct 23, 3:40 PM PDT)
- Headless (/tmp/h4.txt): 273 PASS, 1 FAIL. The one fail was the UI-kit icon sync check: someone else added data/ui/icons/lightning.svg and spawn.svg at 2:41 PM PDT. I re-ran `node tools/sync_icons.js` (src/icons.js now has 20 icons) and that check passes on its own. Expected 274/274.
- Chrome desktop_1280x800: 157 PASS, 0 FAIL. phone_390x844: 159 PASS, 0 FAIL. Both runs are after the Fullness label and the icon sync.
- 16 seeds x 2 years with no powers: tests/deaths_v17.md. 3 deaths (all cold), 13/16 grew, 42 births, births on 14/16 seeds (target met), population 97 / 105 / 136. v16: 4 deaths, 10/16 grew, 31 births on 11/16, 97 / 105 / 124.
