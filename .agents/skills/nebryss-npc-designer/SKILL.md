---
name: Nebryss NPC Designer
description: Designs and edits Non-Player Characters (NPCs), story contacts, faction representatives, merchants, and combat-ready characters for the Nebryss Kill Team Campaign in the exact NPC schema. Invoke when the user asks to create, edit, or manage an NPC.
---

# Nebryss NPC Designer

## 1. Steps
1. **Concept**: identity, role, personality, mission, methods, location (use an existing location name; check `list-entities location`).
2. **`factionId`**:
   1 Imperium of Man (Inquisition, Rogue Traders, Administratum, Space Marines, Militarum) ·
   2 Gilded Accord (Merchant League, Zephyria Syndicate, Tech-Guilds, Void-Merchants) ·
   3 Abyssal Cabal (Mist-Weavers, Void Cultists, Deep-Mist Sorcerers, Ancient Covens) ·
   4 Nebryssian Liberation Republic (Rebels, Mist-Guerrillas, Reformists) ·
   5 Crimson Corsairs (Pirates, Marauders, Smugglers, Privateers, Scavengers)
3. **Combat**: civilians have no `bestiaryId`. Fighters link an existing `bestiaryId`, or use `create-combat-npc` to create the bestiary entry and the NPC together (see `nebryss-creature-designer` for stats).
4. Draft in chat with clean names; stage `create-npc` / `create-combat-npc` after approval.

**Updates merge**: send `--campaignId`, `--id` plus changed fields; `wargear` replaces the stored list.

## 2. Schema (`NPC`, campaign collection `${prefix}-npc`, tag `@npc[id]`)
Required: `name`, `factionId`. Optional strings: `subgroup`, `role`, `personality`, `mission`, `methods`, `location`, `reputation`, `backstory`, `description` (appearance, apparel, bionics), `tactics`, `motivations`, `fleetSize`, `flagship`, `imgUrl`, `thumbnail`. Also `bestiaryId` (number), `discovered` (bool, default true), `wargear` `[{"name": str, "description": str}]`.

## 3. Commands (single line)
`node scripts/campaign-session-tool.js create-npc --campaignId=1 --name="Inquisitor Vontis Mortis" --factionId=1 --subgroup="Ordo Hereticus" --role="Witch Hunter" --location="Fortress Sanctus" --personality="Zealous, merciless" --mission="Purge Voss claimants consorting with the Mist" --methods="Interrogation, blockades, purges" --wargear='[{"name":"Sanctified Power Sword","description":"Blessed against warp corruption"}]' --discovered=true`
`node scripts/campaign-session-tool.js create-combat-npc --campaignId=1 --name="Varlock the Red" --factionId=5 --subgroup="Crimson Corsairs" --role="Corsair Raidmaster" --location="Brinewake Isle" --weapons="2,52" --attributes='{"Movement":6,"Wounds":14,"Save":4,"APL":3,"body":["human"]}' --abilities='[{"name":"Bloodlust","effect":"+1 Attack when charging","prModifier":10}]'`
`node scripts/campaign-session-tool.js update-npc --campaignId=1 --id=5 --location="Zephyria Sky Docks" --mission="..."`
