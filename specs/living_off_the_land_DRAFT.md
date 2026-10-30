# DRAFT — Living off the land (save v38, starts only after v37 is LIVE)
Status: LOCKED, approved by the Commissioner Oct 30 after v37 went live (0bf402c). Build order: a, b, c, d, e, f. One build, one freeze, one Tester pass (new features, migration 37→38, errors only, no long sim runs), Judge publishes after PASS.

## Already in the game
- Huts (v32): a cold person piles sticks/reeds/optional hide into a crude hut on known ground. Warmer than open air. One footprint, no villages or ownership.
- Caches (v29): a person drops a held item at a known shelter or prayer spot and remembers it. Others can copy the spot by watching. One item in hands, no chest UI.
- Bushes (since step 15): ripe → picked → regrow at a seasonal pace, faster after rain. Wild only; nobody plants.

## New in v1
(a) Better shelter from materials
- Hut quality depends on what went in: sticks < reeds < hide-covered. A hut can be added to over several trips, so it rises from crude to sturdy.
- Sturdy huts keep rain out (no rain chill inside) and hold warmth better. Weather slowly wears a hut down, and people patch it the same way they built it.
- Durability (Commissioner, Oct 30): each hut has `dur` from 0 to 100 (saved; existing huts migrate in at 100).
  - It decays slowly over time (`hut.decayPerDay`). Rain, storms and cold multiply the decay (`hut.weatherX`). Lightning, fire and trampling knock off a set amount (`hut.damage.*`). All of these are config values.
  - Patching uses the same action as adding materials: it restores `hut.patchGain` per material. People patch a hut they notice is worn (dur under 50) when they're at it or it's one of their known shelters.
  - At 0 the hut collapses: it's removed, and its materials drop as scattered items on and around the tile. It gets one action-only log line.
  - Seeing it: tapping a hut shows a small inspect card with its material tier and a durability bar. Below 50 it draws in a worn version (@Game Artist: one worn variant per tier, sticks, reeds and hide).
  - Tests: decay in rain is faster than in clear weather over the same span, a lightning or fire hit lowers dur, a patch raises it, and at 0 the hut collapses into materials.
- Learned by copying: a person who watches someone add a hide and then sleep warmer is more likely to do it too.
(b) Farming
- Eaten or dropped berries sometimes leave a seed. A seed on soft ground (grass near water, not rock/sand/water) can sprout into a new bush after a while; most don't.
- Learning: someone who ate near a spot and later finds a new bush there gets a small "drop here" urge. Others copy it by seeing the bush appear where that person dropped berries. Nothing scripted, no plow, no farm UI.
- First deliberate planting → Discoveries. Logs are actions only ("Ena presses berries into the wet ground").
(c) Food storage, spoilage, preservation (Commissioner answers Oct 30)
- Caches can hold a small pile (about 3-5 food items) instead of 1. Each person still carries one item at a time.
- Spoilage is IN v1. Stored or carried food lasts about one game week before it spoils. Set it in config as `food.spoilDays` (default 7). Today's raw-meat rot timer gets folded into this rule.
- Spoiled food becomes a new item, "rotten food". Eating it doubles the chance of getting sick compared with raw meat (`food.rottenSickX` = 2 x the raw-meat sickChance). The sickness itself is the same as raw meat's, no worse.
- Hungry people go back to a known cache before searching. Taking from someone else's pile lowers liking a little. No fighting.
- Preservation, emergent: learned from need (losing food to rot) and spread by copying. First set:
  1. Drying or smoking by a fire: food left near a burning fire for a while becomes "dried" and lasts about 3x longer (`food.driedX`).
  2. Cool or sheltered stash: food cached inside a hut, cave or thicket spoils slower (`food.shelteredX`, about 1.5x).
  Each method gets one Discoveries entry the first time it's used. Logs show actions only.
  Not in this first set: salt, ice or snow pits, pottery, jars.

(d) Lightning kills animals and cooks the dead (Commissioner, Oct 30)
- Lightning now kills animals too (deer, wolves, wild dogs), using the same strike radius and rules it already uses on people. This folds in the held note "lightning kills animals".
- Any person or animal killed by a lightning bolt leaves COOKED meat or a cooked body instead of raw. Eating it uses the cooked-meat sick chance and runs on the normal spoilage clock (food.spoilDays).
- Meat source tag (from v37 item 9) reads "lightning-struck" plus the animal, so the logs show where it came from. Logs show actions only.
- First time someone eats lightning-cooked meat gets a Discoveries entry.

(e) Two-person history (Commissioner, Oct 30)
- On a person's card, tapping a name in their Kin or Log opens "A & B": every log entry the two share, newest first, styled like the per-person Log tab.
- Reuses the existing log, with no new system. It filters A's personal log (`sim.plog[A]`) down to the entries whose `ids` include B. It covers whatever is already logged with both people (fights, food sharing, teaching or copying, kin events, burials and so on). Lines are actions only until language is learned.
- Limits: it only reaches back as far as each person's log keeps, currently `log.personMax` = 200 entries. Events logged with only one person tagged won't show. The Programmer adds the second id where the other person is named in the line.
- UI: a back button and the two names in the header. No new tab and no filters.
- Test: a fixture where A and B share a fight, a food share and a kin event while A also logs unrelated events. A & B shows exactly those 3, newest first, and B & A shows the same 3.

(f) Wolves as the apex predator (Commissioner, Oct 30). Builds on the 26b pack, den and territory and the v37 rain knob. Heavy rain still cuts hunting.
- Already in: wolves hunt deer. Deer only run after a missed strike. Wild dogs hunt deer, flee people, and scavenge bodies.
- Wolves also hunt and kill wild dogs, with the same stalk and strike as for deer and a separate config chance (`wolves.huntDog.killChance`, lower than for deer). Prey is deer first and dogs when deer are scarce or a dog is close. Kills leave a body, and the meat is tagged with its source ("killed by Wolves").
- Every animal fears wolves. Deer and wild dogs flee any wolf within `fleeWolfWithin` tiles (default 5), using the same flee move they use for people, and not only after a missed strike.
- Wild dogs keep away from wolves. They never come within that range of a wolf, and they won't go to a body while a wolf is within `fleeWolfWithin` of it, so they never share a kill with wolves.
- People (Commissioner, Oct 30): everyone starts with a small innate fear of wolves, `wolfFear.baseline` (default 10, well under the cap), given to founders and given to existing people on migrating 37→38 if they're below it. Fear runs in families: a newborn starts at baseline + `wolfFear.inheritShare` (default 0.3) × (parents' average fear − baseline), with that inherited part capped at `wolfFear.inheritMax` (default 30, well under the cap). It's measured above the baseline so that baseline parents have a baseline child. The v37 knowledge build-up adds on top of it unchanged: the usual step per witnessed attack, kill or found evidence, and nothing without a witness or evidence. Fear never drops below the baseline.
- Fear doesn't always win (Commissioner, Oct 30): each person has a readiness score worked out on the spot (not stored or shown).
  - It adds up: what's in hand (spear, axe, flake, set in config under `wolfFight.held`), wearing a hide (`wolfFight.hide`), and each able adult within 3 tiles (`wolfFight.perAlly`; children, the injured and the exhausted don't count).
  - When a wolf comes near or threatens and readiness is above wolf fear, the person stands their ground (no flee) or attacks with the usual strike. Otherwise they run as today. A lone person with nothing in hand still runs.
  - Hunting wolves: an armed person with readiness above fear and at least 2 armed allies nearby may go after a wolf in its territory. Each strike uses the existing hunt kill roll scaled by the number of attackers. A wolf can hurt attackers through the v37 body-part injuries. A dead wolf leaves a body with meat ("killed by people" source tag) and a hide.
  - It spreads by copying like hunting does: a successful wolf kill raises the wolf_hunt score, and people who watch it copy that score. The first wolf kill gets a Discoveries entry, and logs show actions only.
  - Watching a wolf killed within `wolves.watchTiles` lowers the watchers' fear by `wolfFight.killWatchDrop` (default 5), never below the baseline.
  - No respawn (Commissioner, Oct 30): a wiped-out pack stays gone, and no new pack moves in by itself. Wolves only come back through the existing Spawn power (Wolves kind, capped at 5 alive). Pack joining: membership is all-or-nothing. A spawned wolf within `wolves.spawnJoinTiles` (default 12) of any wolf joins that wolf's whole existing pack, with the same pack id and den, never a new pair or sub-pack. If several packs are in range, it joins the pack of the nearest wolf. This works the same way `Powers.spawn` already gives deer a herd. If no wolf is in range, it starts a new pack with its own den and territory at the spawn spot, and later spawns near it join that pack. So several packs can exist when he spawns them. The Spawn cap changes from 5 wolves in total to 5 per pack (`packSize` max), so a far spawn can always start a new pack. They follow every (f) rule: hunting, rain, scaring off animals, threatening people, and being fought.
- Tests: (1) a fixture with a wolf next to a dog, with no deer around, gets a dog kill in N tries, and the body's source tag reads Wolves. (2) A deer and a dog each flee a wolf that comes within range, before any strike. (3) A wolf eating at a body keeps a hungry dog from coming within range until the wolf leaves. (4) Heavy rain still cuts hunt starts (the v37 test still passes). (5) Founders start at the baseline. A child of baseline parents starts at the baseline. A child of high-fear parents starts above it and stays within inheritMax. One witnessed attack adds exactly one step. A no-evidence run stays at the baseline. A migrated v37 save brings everyone up to at least the baseline. (6) A lone unarmed person runs from a wolf. Three or more armed adults stand and can kill a wolf in N tries, and the body gives meat and a hide. Watchers' fear drops after a kill but not below the baseline. (7) A wiped-out pack stays at 0 wolves for 2 game years with no powers used. Spawning 3 Wolves afterwards gives a working pack with a den that hunts and that deer flee from. A wolf spawned within 12 tiles of a pack wolf joins that pack. With a pack of 3 and a spawn next to only one member, the pack becomes 4 with one pack id and the same den. With two packs in range, it joins the nearer wolf's pack. A wolf spawned more than 12 tiles from every wolf starts a new pack with its own den. (8) Animal populations over 2 years on 8 seeds don't wipe out deer or dogs on more than 1 seed.

- **(g) Fire burn limit (APPROVED by the Commissioner Oct 30, 12:11 PT; built after f).** Base settings come from the v37.2 hotfix: fire.minDryness 30, spreadScale 0.016, climate.dryness.nearWater -45. Add one new config knob, a burn limit, so a fire runs out after a set number of tiles or a set time (e.g. `fire.burnBudget` or `fire.maxAgeHours`; the Programmer picks the simplest one). This lets spreadScale go up so fires reach 8+ tiles more often without running away. Config only, with no change to the save format. Targets on about 100 High Sun meadow seeds: at least 80% of fires reach 8+ tiles, the median burn stays in the tens of tiles, and no fire burns most of the map. Wet ground, rain, near-water, sand and Deep Cold must still stop fire (0-2 tiles). Test: a fixture sweep on about 100 seeds that posts reach-8+ %, the median and the max burn, plus a stops table. This is a short fixture, not a long sim.

## Left out of v1
- Plows, fields, irrigation, crop types, or planting anything besides berry bushes.
- Villages, walls, doors, beds, ownership UI, trade.
- Bags or multi-slot inventory, granaries, group warehouses.
- Talking about any of it (no words until language).

## Test proof (minimal)
- Headless: a hut upgrades from sticks to hide and is warmer, and stays dry in heavy rain. At least one planted bush sprouts on 2 of 8 seeds and someone copies planting. A cache holds several items. Food turns rotten after spoilDays, rotten food has twice the sick chance, and dried or sheltered food lasts longer. Someone copies a preservation method. Lightning kills an animal and leaves cooked meat, and a person struck dead also leaves cooked remains with the cooked sick chance. A hungry person retrieves food. Two-person history shows only shared entries, newest first, both ways. Migrate 37→38.
- Chrome/phone smoke test: no errors, hut levels and new bushes visible.
