# DRAFT — Living off the land (save v38, starts only after v37 is LIVE)
Status: draft. Commissioner answered the spoilage questions Oct 30. Not locked, nothing built. Build only after v37 is LIVE.

## Already in the game
- Huts (v32): a cold person piles sticks/reeds/optional hide into a crude hut on known ground. Warmer than open air. One footprint, no villages or ownership.
- Caches (v29): a person drops a held item at a known shelter or prayer spot and remembers it. Others can copy the spot by watching. One item in hands, no chest UI.
- Bushes (since step 15): ripe → picked → regrow at a seasonal pace, faster after rain. Wild only; nobody plants.

## New in v1
(a) Better shelter from materials
- Hut quality depends on what went in: sticks < reeds < hide-covered. A hut can be added to over several trips, so it rises from crude to sturdy.
- Sturdy huts keep rain out (no rain chill inside) and hold warmth better. Weather slowly wears a hut down, and people patch it the same way they built it.
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

## Left out of v1
- Plows, fields, irrigation, crop types, or planting anything besides berry bushes.
- Villages, walls, doors, beds, ownership UI, trade.
- Bags or multi-slot inventory, granaries, group warehouses.
- Talking about any of it (no words until language).

## Test proof (minimal)
- Headless: a hut upgrades from sticks to hide and is warmer, and stays dry in heavy rain. At least one planted bush sprouts on 2 of 8 seeds and someone copies planting. A cache holds several items. Food turns rotten after spoilDays, rotten food has twice the sick chance, and dried or sheltered food lasts longer. Someone copies a preservation method. Lightning kills an animal and leaves cooked meat, and a person struck dead also leaves cooked remains with the cooked sick chance. A hungry person retrieves food. Migrate 37→38.
- Chrome/phone smoke test: no errors, hut levels and new bushes visible.
