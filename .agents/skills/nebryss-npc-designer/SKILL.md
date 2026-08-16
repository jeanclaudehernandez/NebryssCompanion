---
name: Nebryss NPC Designer
description: Designs and edits Non-Player Characters (NPCs), story contacts, faction representatives, merchants, and combat-ready characters for the Nebryss Kill Team Campaign in the exact NPC schema. Invoke when the user asks to create, edit, or manage an NPC.
---

# Nebryss NPC Designer

This skill governs the creation, balancing, editing, and database formatting of Non-Player Characters (NPCs) within the Nebryss universe.

---

## 1. Execution Steps

1. **Conceptualize Character**: Define the NPC's identity, faction alignment, role/occupation, operational methods, personality, and location.
2. **Assign Faction**: Determine the numeric `factionId` based on the 5 core factions:
   - `1`: **Imperium of Man** (Inquisition, Rogue Traders, Administratum, Space Marines, Militarum)
   - `2`: **Gilded Accord** (Merchant League, Zephyria Syndicate, Tech-Guilds, Void-Merchants)
   - `3`: **Abyssal Cabal** (Mist-Weavers, Void Cultists, Deep-Mist Sorcerers, Ancient Covens)
   - `4`: **Nebryssian Liberation Republic** (Rebels, Freedom Fighters, Mist-Guerrillas, Reformists)
   - `5`: **Crimson Corsairs** (Pirates, Marauders, Smugglers, Privateers, Scavengers)
3. **Determine Combat Capability**:
   - For narrative/civilian NPCs: Omit `bestiaryId` or set to `null`.
   - For combatant/boss NPCs: Link to an existing `bestiaryId` or create a linked Bestiary creature via `create-combat-npc`.
4. **Format & Persist**: Output valid JSON matching the `NPC` schema and stage the entity creation in MongoDB via `campaign-session-tool.js`.
5. **Full Object Replacement on Updates (API Overwrite Rule)**: The API updates database records via full document overwrite (`replaceOne` matching the `id` field). When executing `update-npc`, retrieve the existing document first if needed (via `node scripts/campaign-session-tool.js get-entity npc <id> --campaignId=<campaignId>`), merge changes into the full document, and pass the **entire object with all fields** (`campaignId`, `id`, `name`, `factionId`, `subgroup`, `role`, `personality`, `mission`, `methods`, `location`, `bestiaryId`, `reputation`, `backstory`, `description`, `fleetSize`, `flagship`, `tactics`, `motivations`, `discovered`, `imgUrl`, `thumbnail`, `wargear`), NOT only the modified fields.

---

## 2. JSON Schema (`NPC`)

```json
{
  "id": 9999,
  "name": "string",
  "factionId": 2,
  "subgroup": "string (e.g., 'Merchant Syndicate', 'Ordo Hereticus', 'Mist-Weaver', 'Corsair Captain')",
  "role": "string (e.g., 'Master Artificer of the Celestial Exchange')",
  "personality": "string (e.g., 'Shrewd, calculating, polite with an undercurrent of menace')",
  "mission": "string (e.g., 'Secure ancient archeotech mist-engines before the Inquisition intervenes')",
  "methods": "string (e.g., 'Employs stealth agents, black-market contracts, and economic leverage')",
  "location": "string (e.g., 'Zephyria, Grand Bazaar')",
  "bestiaryId": 42,
  "reputation": "string (e.g., 'Known across the archipelago for fair prices and ruthless enforcement')",
  "backstory": "string (e.g., 'A former Imperial void-master who defected to the Gilded Accord...')",
  "description": "string (Detailed visual appearance, apparel, bionics, and demeanor)",
  "fleetSize": "string (Optional, e.g., '3 Gun-Cutters, 1 Ironclad Flagship')",
  "flagship": "string (Optional, e.g., 'The Gilded Talon')",
  "tactics": "string (Optional combat tactics, e.g., 'Fights from cover while directing security automata')",
  "motivations": "string (Optional, e.g., 'Accumulate enough wealth to purchase an independent island charter')",
  "discovered": true,
  "imgUrl": "string (Optional URL to portrait image)",
  "thumbnail": "string (Optional URL to thumbnail image)",
  "wargear": [
    {
      "name": "Master-Crafted Plasma Pistol",
      "description": "Custom heatsink engraved with the Accord crest"
    }
  ]
}
```

---

## 3. Database Scoping & Reference Tagging

- **Database Collection**: NPCs are campaign-scoped entities stored in the `NebryssCampaignAssets` database inside `${prefix}-npc` (e.g. `nebryss-voss-succession-npc`).
- **Entity Reference Tag**: `@npc[<id>]` (e.g. `@npc[12]`) for raw database persistence.
- **Chat Display**: When presenting NPC drafts in chat for user review, use clean text (e.g. `Captain Marcus Valen`), never raw reference tags.

---

## 4. Companion Tool CLI Commands

Execute mutations via `campaign-session-tool.js` (staged for interactive user approval). Always generate and run commands as a **single line** (no bash `\` continuations):

```bash
# Create standard NPC
node scripts/campaign-session-tool.js create-npc --campaignId=1 --name="Inquisitor Vontis Mortis" --factionId=1 --subgroup="Ordo Hereticus" --role="Witch Hunter & High Justiciar" --location="Fortress Sanctus" --personality="Zealous, merciless, analytical" --mission="Purge all Voss claimants consorting with the Mist" --methods="Interrogation, orbital blockades, localized purges" --wargear='[{"name":"Sanctified Power Sword","description":"Blessed against warp corruption"}]' --discovered=true

# Create Dual Combat NPC (creates Bestiary entry + linked NPC in one atomic step)
node scripts/campaign-session-tool.js create-combat-npc --campaignId=1 --name="Varlock the Red" --factionId=5 --subgroup="Crimson Corsairs" --role="Corsair Raidmaster" --location="Brinewake Isle" --weapons="2,52" --attributes='{"Movement":6,"Wounds":14,"Save":4,"APL":3,"body":["human"]}' --abilities='[{"name":"Bloodlust","effect":"+1 Attack when charging","prModifier":10}]'

# Update existing NPC (Send the COMPLETE object with all fields)
node scripts/campaign-session-tool.js update-npc --campaignId=1 --id=5 --name="Master Artificer Locke" --factionId=2 --subgroup="Merchant Syndicate" --role="Master Artificer of the Celestial Exchange" --personality="Shrewd, calculating, polite with an undercurrent of menace" --mission="Secure ancient archeotech mist-engines before the Inquisition intervenes" --methods="Employs stealth agents, black-market contracts, and economic leverage" --location="Zephyria Sky Docks" --bestiaryId=42 --reputation="Known across the archipelago for fair prices and ruthless enforcement" --backstory="A former Imperial void-master who defected to the Gilded Accord..." --description="A tall cybernetically augmented merchant clad in silk robes and brass bionics." --discovered=true --wargear='[{"name":"Master-Crafted Plasma Pistol","description":"Custom heatsink engraved with the Accord crest"}]'
```

