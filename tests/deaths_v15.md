# v15 (step 20 fixes + step 21 faith + Director 21 calls), deaths and populations

Final run (r4, after the step 21 stick work), 2 years (56 days), seeds 1-16, cause x stage (adult 16+, youth 12-16, child 3-12, baby 0-3):

| cause | adult | youth | child | baby | total |
|---|---|---|---|---|---|
| cold | 4 | 0 | 0 | 0 | 4 |
| thirst | 0 | 0 | 0 | 0 | 0 |
| hunger | 0 | 0 | 0 | 0 | 0 |
| old age | 0 | 0 | 0 | 0 | 0 |
| other | 0 | 0 | 0 | 1 | 1 |
| all | 4 | 0 | 0 | 1 | 5 |

"other" = being left alone. By season: Deep Cold 5.

| seed | start | y1 | y2 | grew | births | deaths | stick rolls | stick pickups | drawn to a stick | brands | caught (sticks) | gathers |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 5 | 5 | 5 | no | 0 | 0 | 0 | 0 | 1 | 10 | 10 | 2 |
| 2 | 7 | 8 | 9 | yes | 2 | 0 | 0 | 0 | 0 | 4 | 4 | 16 |
| 3 | 5 | 6 | 7 | yes | 2 | 0 | 0 | 0 | 1 | 5 | 5 | 14 |
| 4 | 5 | 4 | 4 | no | 0 | 1 | 0 | 0 | 0 | 1 | 0 | 5 |
| 5 | 5 | 5 | 7 | yes | 2 | 0 | 0 | 0 | 2 | 6 | 5 | 11 |
| 6 | 8 | 9 | 12 | yes | 4 | 0 | 0 | 0 | 0 | 1 | 1 | 21 |
| 7 | 5 | 6 | 8 | yes | 3 | 0 | 0 | 0 | 0 | 4 | 4 | 7 |
| 8 | 6 | 6 | 6 | no | 0 | 0 | 0 | 0 | 0 | 2 | 1 | 4 |
| 9 | 8 | 8 | 9 | yes | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 5 |
| 10 | 7 | 6 | 8 | yes | 2 | 1 | 0 | 0 | 1 | 1 | 1 | 10 |
| 11 | 6 | 5 | 5 | no | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 7 |
| 12 | 8 | 9 | 8 | no | 2 | 2 | 0 | 0 | 0 | 1 | 0 | 23 |
| 13 | 7 | 7 | 9 | yes | 2 | 0 | 0 | 0 | 0 | 15 | 14 | 18 |
| 14 | 5 | 6 | 6 | yes | 1 | 0 | 0 | 0 | 0 | 3 | 0 | 27 |
| 15 | 5 | 5 | 6 | yes | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 18 |
| 16 | 5 | 5 | 5 | no | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 |

Grew (y2 > start): 10 of 16. Totals: start 97, y1 100, y2 114; births 22; stick rolls 0, pickups 0, draws 5; sticks caught by flames 45; brands 53; gathers 193.

Seeds 1, 4, 8, 11 and 16 have 0 births in 2 years, so they cannot grow even with no deaths: growth is capped at 11/16 by births, not by cold. 12/16 needs more births (not one of the allowed levers).

## Before / after

| run | deaths | cold adult (Deep Cold) | babies left alone | grew | start / y1 / y2 |
|---|---|---|---|---|---|
| v14 | 25 | 24 | 1 | 8/16 | 97 / 92 / 95 |
| v15 step 20 fixes only | 17 | 14 | 3 | 8/16 | 97 / 94 / 100 |
| v15 + Director 21 rules (sleep warmth, warmth <= 20, orphans, sticks) | 14 | 14 | 0 | 8/16 | 97 / 93 / 101 |
| v15 + data tune (urgentRetry 30 -> 10 min, nightFirstBelow 40 -> 60) | 7 | 6 | 1 | 9/16 | 97 / 100 / 112 |
| v15 final (+ step 21 stick draw / reach code) | 5 | 4 | 1 | 10/16 | 97 / 100 / 114 |

Target was growth on 12/16; it lands at 10/16 (Judge: stop tuning here). The climate is unchanged.

## What changed (Director's calls on 21)

- Sleeping warmth: 3+ people asleep within 1 tile of each other get a fire's 25 C; 2 get 12.5 C (`person.warmth.sleepHeat`). It replaces the night bond warmth for sleepers.
- Warmth <= 20: she heads for the nearest group member (or partner / guardian) or fire before anything else (`urgentBelow` 20, retried every `urgentRetry` min). 6817 such trips over the 16 runs.
- Orphans: the group member who likes the dead carrier most walks over from up to 15 tiles; with no group member that close, any adult within 10 tiles rolls hourly at curiosity - fear. A baby survives 2 days alone. In these runs 1 baby was orphaned and nobody was in range (0 rescues).
- Data tune (one try, within the 30 min): `urgentRetry` 30 -> 10 and `nightFirstBelow` 40 -> 60 (warmth-first nights start sooner). Cold deaths 14 -> 6.

## Why the rest still die

The adults who still freeze are mostly loners (group null). Seeds 1, 4, 5, 7, 8 and 16 traced. Warmth sits at 0 for days, they walk for food all day, and they collapse or sleep 12+ tiles from anyone. The warmth <= 20 rule only sends people toward a group member, partner, guardian or fire, so a loner has nowhere to go. Groups need familiarity and liking >= 60 (step 18 spec), and on these seeds nobody reaches that before the first Deep Cold (day 22-28).

Possible next calls for the Director (not done): let warmth <= 20 head for anyone nearby, or let a loner join others' sleep pile.

## Sticks (pickups 0, dropped from step 21 by the Judge)

Diagnosis: burning sticks on the ground exist only during lightning fires in warm seasons (everyone at warmth 100, so no one seeks warmth there), they lie 1 tile from the flames (so the flee rule blocks every seat and grab), and they burn out about 2 h after the flames die, while walking is 8 min/tile. Over 16 x 2 years no adult came within 1 tile.

Code added (harmless, kept, headless-tested): `fire.brand.sitTiles/reachFlameTiles/draw*` - a cold seeker treats a lying burning stick like an ember; someone warming at a fire may reach for a stick 1 tile from the flames (her short walk is not cut by the flee rule); someone who knows fire (score >= 40) may walk over to sit by a lying burning stick if it will still burn 30 min when she arrives, and rolls on sitting down. Final run: 5 draws, 0 rolls, 0 pickups. `tests/sticks_play.js` (2-year play test) would FAIL and is not part of the suite.

'caught' counts sticks lit by nearby flames, never people (headless test).
