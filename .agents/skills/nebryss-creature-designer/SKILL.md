---
name: Nebryss Creature Designer
description: Generates, balances, and formats new creatures, enemies, combat NPCs, and boss stat cards as Bestiary entries with Kill Team 3E PR calculations, strict weapon compendium validation, and balanced attributes. Invoke when the user asks to create or balance a creature or enemy.
---

# Nebryss Creature Designer

## 1. Steps
1. **Concept**: `name`; `factionId` (1 Imperium of Man, 2 Gilded Accord, 3 Abyssal Cabal, 4 Nebryssian Liberation Republic, 5 Crimson Corsairs); `subgroup` (Construct, Daemon, Behemoth, Inquisition, Swarm...).
2. **Attributes**:
   - `Movement` 4 slow/construct · 6 standard · 8+ fast scout/beast
   - `Wounds` 6–8 minion · 10–14 troop · 16–24 elite/leader · 26–40+ boss
   - `Save` 6 unarmored · 5 flak · 4 carapace · 3 power armor · 2 relic/terminator
   - `APL` 2 standard · 3 elite/leader · 4 legendary boss
   - `body` list of tags (`universal`, `human`, `astartes`, `construct`, `daemon`, `behemoth`, `plant`, `spirit`...)
3. **Weapons (strict)**: only IDs that exist in the weapons table — find them with `list-weapons "<search>"` / `list-entities weapon --search="..."`. Never invent IDs; a missing weapon is created first with `nebryss-weapon-designer`.
4. **Abilities**: traits, reactions, auras as `{name, effect, prModifier}` (prModifier usually 5–20).
5. **PR**: run `calculate-pr` before drafting. The tool also computes PR itself on create/update unless you pass `--pr`.
6. Draft in chat with clean names; stage `create-bestiary` after approval. A creature that is also a named NPC → `create-combat-npc`.

**Updates merge**: send `--id` plus changed fields. `attributes` merges key by key; `weapons` and `abilities` replace the stored list (send the full list). PR is recalculated automatically.

## 2. PR Formula (Kill Team 3E)
Total = round(Base + Weapon Threat + Ability Score)
- Base = Wounds×2.2 + (6−Save)×7 + Movement×4 + APL×6
- Profile Threat = Attacks × Min Damage × (7−WS) + Σ special-rule prModifiers; Weapon Threat = highest profile threat
- Ability Score = Σ ability prModifiers

## 3. Schema (`BestiaryEntry`, global `bestiary` collection, tag `@bestiary[id]`)
`{ "id": n, "name": str, "factionId": n, "subgroup": str, "pr": n, "attributes": {"Movement": n, "Wounds": n, "Save": n, "APL": n, "body": [str]}, "weapons": [weaponId], "abilities": [{"name": str, "effect": str, "prModifier": n}], "deployables": [{"id": itemId, "quant": n}], "isDiscovered": bool, "discoveredCampaignIds": [n] }`

## 4. Commands (single line)
`node scripts/campaign-session-tool.js calculate-pr --weapons="2,23" --attributes='{"Movement":6,"Wounds":12,"Save":4,"APL":2,"body":["human"]}' --abilities='[{"name":"Vigilance","effect":"Overwatch hits on 4+","prModifier":8}]'`
`node scripts/campaign-session-tool.js create-bestiary --name="Zephyrian Guard Automaton" --factionId=2 --subgroup="Construct" --weapons="2,23" --attributes='{"Movement":6,"Wounds":14,"Save":4,"APL":2,"body":["construct"]}' --abilities='[{"name":"Reinforced Frame","effect":"Ignore the first mortal wound each turning point","prModifier":10}]' --isDiscovered=true`
`node scripts/campaign-session-tool.js create-combat-npc --campaignId=1 --name="Captain Vane" --factionId=5 --subgroup="Crimson Corsairs" --role="Pirate Captain" --location="Brinewake Isle" --weapons="8,52" --attributes='{"Movement":6,"Wounds":16,"Save":3,"APL":3,"body":["human"]}' --abilities='[{"name":"Lead from the Front","effect":"Friendly operatives within 6 inches gain +1 to hit","prModifier":15}]'`
`node scripts/campaign-session-tool.js update-bestiary --id=14 --attributes='{"Wounds":16,"Save":3}'`
