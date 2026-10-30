# Godsim plan: steps 4-23

Planning only. The current fixes (walking, panels, zoom) come first. Each step is roughly the size of step 1, leaves a playable build you can watch, and tests one thing. Steps 1-3 are done: the map, one walking person, and hunger with berries.

Locked rules apply throughout:
- All scales run 0-100 (50 is average).
- A day is 2 real hours and a season is 7 days.
- Every person is a unique individual.
- Nothing is invented by script.
- Physical things behave realistically. The primitive materials are rock, stick, flint, bone, ore, meat, berry and ember. Any of them can become a tool only through the learning system.
- Agents only score what they experienced or copied. No speech: people don't talk until language is learned (after step 23), so logs describe actions like watching, gesturing and imitating, never words.

## 4. Founders
- Replace the single person with 5-8 founders, each with their own name, age and 0-100 traits.
- They share the bushes and avoid standing on each other.
- **On screen:** a small band moving around the map independently. Clicking any of them opens their own card.

## 5. Thirst and water
- Add thirst. People walk to the river or lake shore to drink.
- They decide between hunger and thirst by whichever need is higher.
- **On screen:** trips to the water, with "drinks at the lake" lines in the log.

## 6. Energy and sleep
- Add an energy need that drains while awake. People lie down to sleep, mostly at night.
- Night shading now matters.
- **On screen:** people bedding down at dusk and waking at dawn. Sleep shows on their cards.

## 7. Aging and death
- Ages tick forward, and lifespan is 60-100 years.
- Long starvation or thirst can now kill, and the death is logged.
- No automatic grave. A death leaves a body that decays the way it would in real life: fresh, then rotting, then bones. The bones stay on the map as a lasting object (they may weather away only over many game years) and become a primitive material that later steps can use.
- What people do with a corpse (eat it, bury it, burn it, use it in ritual, or leave it) must emerge later from primitives and learning. None of it is scripted, and in this step people simply ignore it.
- **On screen:** ages on the cards, a "died of thirst" log line if neglected, and a body on the ground that visibly decays down to bones that stay.

**UI change shipping with steps 7-8:**
- The log is no longer pinned on screen. A bottom tab bar holds a "Log" tab that opens and closes the log panel, and the map takes the freed space when it's closed.
- The log keeps its filter tabs (All, Food, Water, Sleep, Events) exactly as they are.
- The tab bar is built to grow, but new tabs appear only when their feature exists: Discoveries at step 10, Prayers at step 21 and Powers at step 22. There are no empty placeholders.
- It works on PC and on phones.

## 8. Animals
- Add one original grazing animal (up to the 40 cap) with its own hunger, wandering and grazing.
- Animals flee people who get close (approach and flee primitives).
- Add a few small original scavengers that eat a body's flesh, which shortens the rotting stage. They leave the bones, and they also flee people.
- **On screen:** herds drifting through meadows and scattering when people walk near, and scavengers gathering at a body.

## 9. Objects
- Scatter rocks, sticks and flint on the map. Bones from step 7 count as objects too. People can pick up, carry (one item) and drop them, driven by idle curiosity.
- Objects can be inspected.
- **On screen:** items on the ground, people carrying things, and "picks up a stick" log lines.

## 10. Simple physics
- Items get real properties: hardness, sharpness and dryness. Bone is hard and durable, and it turns sharp when broken.
- Strike, rub and cut give outcomes from those properties. Flint struck on rock makes a spark.
- Idle people try random actions on what they hold.
- **On screen:** occasional log lines like "strikes flint on rock: spark". A spark is a brief flash.
- **Also: a Discoveries panel.** The first time anyone produces a new combination of action, materials and outcome, it gets logged with what it was, who did it, their group (blank until step 18), and the game date and time. Firsts are detected from that data, never from a list of inventions. From here on it catches fire, cooking and later tools automatically.

## 11. Temperature and warmth
- Add air temperature by time of day and season, a body-warmth need, and a cold fear on the 0-100 scale.
- Cold people huddle or seek shelter under trees.
- **On screen:** a temperature readout on the clock, plus shivering and huddling on cold nights.

## 12. Fire
- Sparks can light dry grass or sticks and become embers or fire. Fire spreads to dry tiles, gives heat, burns out and leaves ash.
- No one uses fire yet.
- **On screen:** a rare accidental grass fire that spreads, burns out and leaves scorched ground.

## 13. First learning: fire_fear and approaching an ember
- Add a fire_fear trait and personal experience scores.
- Getting close to an ember while cold scores warmth. Touching it scores a burn.
- Each person's behavior shifts only from what they felt.
- **On screen:** some people start sitting near embers on cold nights and others keep away. Each card shows that person's fire score.

## 14. Copying what works
- People who see a nearby success (someone warm by an ember) may copy it, with odds set by traits.
- Copied knowledge is marked as such. Knowledge stays local.
- **On screen:** a "watched Aru and copied" log line, and the habit spreading through the band.

## 15. Seasons affect food
- Bush yield and regrowth change by season, and the cold season is lean.
- Animals thin out or move as well.
- **On screen:** fewer berries in winter, longer walks for food, and hunger rising.

## 15b. Map variety (queued by Commissioner, Oct 23)
Starts as soon as 13-15 and the new UI are frozen to godsim-rc, without waiting for the pass. Only the layout changes per seed. Tile art and rendering stay exactly as live. Per seed, vary the number of lakes (0-4) and their sizes and shapes, add 0-2 rivers that run downhill to a lake or the map edge, add rock and hill clusters, set forest cover from sparse to dense, and set a dry-to-lush moisture level that shifts the grass and bush mix. Founders need fresh water within reach on every seed. Post 3-4 seed screenshots side by side in the room before it ships.

## 16. Meat
- Striking an animal with a rock or stick can wound or kill it, which leaves meat. Raw meat feeds people but carries a small sickness risk.
- Hunting is never scripted. It arises only from strike plus hunger.
- **On screen:** a rare "kills a grazer" line, a carcass and people eating meat.

## 17. Heat and cooking
- Meat dropped near or on an ember becomes cooked. Cooked meat is more filling and carries no sickness.
- That outcome feeds learning, so it can be discovered and copied.
- **On screen:** someday a person cooks meat, and the habit may spread through copying.

## 18. Relations and groups
- People track familiarity and liking of each other from time spent together.
- Groups form from who sticks together, and each group keeps its own knowledge.
- **On screen:** group colors on people, plus a relations list on each card.

## 19. Reproduction and inheritance
- Bonded pairs can have children, up to the 60-person cap.
- Children inherit traits with ±5% drift and rare mutation.
- **On screen:** birth log lines and babies on the map. A child's card shows its parents and inherited traits.

## 20. Childhood
- Children grow through age stages, follow their parents, and copy elders more readily than adults do.
- **On screen:** small people trailing parents, and kids picking up the group's habits.

## 21. Faith and prayer
- Add a faith trait. People with unmet needs may pray.
- Prayer is ritual, not words: kneeling, offerings, dancing and gestures toward the sky. Ritual forms are built from primitive actions, emerge on their own and are copied locally like any other behavior. None are scripted.
- A Prayer feed tab shows these as a feed. It is not a task list.
- **On screen:** a new Prayers tab with prayers shown as actions, such as "Ena kneels and looks skyward, shivering".

## 22. God powers: rain and temperature
- The god can make it rain (which douses fire and boosts bushes) or nudge the temperature up or down for a while.
- **On screen:** a small powers bar, rain over the map, and people reacting to warmth or cold.

## 23. God powers: lightning and spawning animals
- Lightning strikes a tile and may start a fire, but fire is not guaranteed.
- The god can also spawn animals.
- **On screen:** a flash and a possible blaze, plus new animals appearing.
- Spec: bottom of specs/15b-17.md (save v18).

## 24. Polish + power rewrite (save v19)
- Find button, phone Powers row, 23 tweaks, no cooldowns, Rain Light/Medium/Heavy, Lightning Single/Barrage.
- Spec: bottom of specs/15b-17.md.

## 25. Local language (save v20)
- Shared gesture-sounds become group speech. Logs stay action-only until a tongue exists.
- Spec: bottom of specs/15b-17.md.
- Starts as soon as 24 is frozen to godsim-rc, without waiting for the pass.

## 26. Corpse choices (save v22)
- Leave, drag, bury, burn, eat, ritual — from learning. Lightning aim fix in the same freeze.
- Spec: bottom of specs/15b-17.md.
- Starts as soon as 25b is live / next freeze slot; Programmer builds now.

## 27. Moods (save v24)
- Happiness, sadness, anger — push invent, ritual, hunt, banding. Spec: specs/15b-17.md. After 26b.

## 26b. Materials + predators + mild climate + person-card tabs + People tabs + zero-point + prayer feed (save v23)
- Per-piece prop jitter + flex, terrain deposits, a mountain mass, reeds on river banks.
- Spec: bottom of specs/15b-17.md. Starts after 26 freezes; not part of v22.
- Disease draft moves to save v25; tools draft to v26. Person-card tabs fold into 26b/v23 (Commissioner override).


## After step 28 (not ordered yet)
- What people do with the dead — see draft 26
- Giving and curing disease — see draft 27
- Tools from cut and strike — see draft 28
- Farming
- Local language
- Group-to-group contact
- Further god powers

## 28. Disease (save v25) — shipped Oct 24
- Sick state, spread, cure; person-card Log tab. Live commit 1877ae1.

## 29. Tools from cut and strike (save v26) — shipped Oct 24
- Flake / axe / long stick. Live commit 4aed9eb.

## 30. Disease powers (save v27) — shipped Oct 24
- Cure + Plague. Live commit d8c61ff.

## 31. Hides and warmth (save v28) — shipped Oct 24
- Grazer hide wear/sleep-under. Live commit 928049a.

## 32–33 shipped Oct 24
- v29 Cache + rain fix (1e04256); v30 Sacred places (9b90cbe).

## This week finish line (Commissioner Oct 24)
1. §34 / v31 Group identity — syllable names (Story list). Build now.
2. §35 / v32 Built shelters — crude huts from sticks/reeds/hides.
3. §36 / v33 Ore finds — ore near hills/mountain; no smelting.
4. §37 / v34 Hard points — ore/flint tip on stick/bone ≥45.
5. §38 / v35 Hard seasons — ramp harshness; mild start stays.
Skip Meeting strangers. Specs: specs/15b-17.md §34–38.

## 39. People UI polish (save v36) — built in godsim (Oct 28; not frozen)
- RimWorld-denser People menus; prev/next + Find; no portrait strip. Spec §39.
- §40 / save v37: ONE update with 9 items (rain/wolves+chill, wolf fear, sex dot, Bless, body-part injuries+health, Resurrect, Heal, Powers menu, raw-meat source in logs). Spec §40. One freeze, one Tester pass, Judge publishes after PASS.
- Five held sim notes stay deferred.

## v37 LIVE Oct 30 (0bf402c). v38 Living off the land: APPROVED, building (order a-f)
- Living off the land (save v38): better huts from materials, berry planting by copying, multi-item caches, spoilage (1 week, config) into rotten food (2x raw-meat sick chance), preservation (dried by fire, sheltered stash), lightning kills animals and leaves cooked meat (people too), two-person history view (filter of existing per-person log), wolves apex (hunt wild dogs; all animals flee wolves; dogs never share kills). Draft spec: specs/living_off_the_land_DRAFT.md.
- Reed fiber (future, after Living off the land; order to be confirmed by the Commissioner; no spec or build yet): reeds processed into fiber, used for clothes (more warmth) and bowstrings, leading to bows and arrows for hunting. Emergent, learned by copying and need.
