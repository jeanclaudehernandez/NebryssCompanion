---
name: Nebryss Creature Designer
description: Generates, balances, and formats new creatures, enemies, combat NPCs, and boss stat cards as Bestiary entries with Kill Team 3E PR calculations, strict weapon compendium validation, and balanced attributes. Invoke when the user asks to create or balance a creature or enemy.
---

# Nebryss Creature Designer

This skill governs the creation, balance formulas, weapon restrictions, and stat blocks of Bestiary entries within the Nebryss skirmish engine.

---

## 1. Execution Steps

1. **Establish Concept & Faction**:
   - `name`: Creature / enemy title (e.g. `"Mist Stalker"`, `"Gilded Enforcer"`, `"Abyssal Leviathan"`).
   - `faction`: The parent faction or alignment (`"The Imperium of Man"`, `"The Gilded Accord"`, `"The Abyssal Cabal"`, `"Nebryssian Liberation Republic"`, `"The Crimson Corsairs"`, `"Forces of Nature"`, `"Neutral"`).
   - `subgroup`: Sub-classification (e.g., `"Construct"`, `"Daemon"`, `"Behemoth"`, `"Apothecary"`, `"Inquisition"`, `"Swarm"`).
2. **Balance Attributes**:
   - `Movement`: `4` (Slow/Construct), `6` (Standard Operative), `8+` (Fast Scout/Beast).
   - `Wounds`: `6-8` (Minion/Swarm), `10-14` (Standard Troop), `16-24` (Elite/Leader), `26-40+` (Boss Behemoth).
   - `Save`: `6+` (Unarmored), `5+` (Light Flak), `4+` (Carapace/Combat Armor), `3+` (Power Armor), `2+` (Relic/Terminator).
   - `APL`: `2` (Standard), `3` (Elite Operative / Leader), `4` (Legendary Boss).
   - `body`: Operative body tags (`["universal"]`, `["human"]`, `["astartes"]`, `["construct"]`, `["daemon"]`, `["behemoth"]`, `["plant"]`, `["spirit"]`).
3. **Equip Weapons (STRICT RULE)**:
   - **Bestiary entries MUST strictly use weapon IDs that already exist in the weapons compendium (`weapons.json` / `weapon` collection)**.
   - Use `node scripts/campaign-session-tool.js list-weapons [search]` to look up valid weapon IDs.
   - Never invent arbitrary weapon IDs on the fly without creating them in the weapons catalog first.
4. **Define Abilities & PR Modifiers**:
   - Add special creature traits/reactions/auras in `abilities`.
   - Assign an appropriate `prModifier` (typically `5` to `20` depending on power level).
5. **Calculate Exact Points Rating (PR)**:
   - Run `calculate-pr` tool or use the mathematical formula to compute exact points.
6. **Format & Persist**: Output valid JSON matching the `BestiaryEntry` schema and stage in MongoDB via `campaign-session-tool.js`.

---

## 2. Kill Team 3E PR Formula Reference

The total creature Points Rating (PR) is calculated as:
$$\text{Total PR} = \text{round}(\text{Base PR} + \text{Weapon Threat} + \text{Ability Score})$$

Where:
- $\text{Base PR} = (\text{Wounds} \times 2.2) + ((6 - \text{Save}) \times 7) + (\text{Movement} \times 4) + (\text{APL} \times 6)$
- For each equipped weapon profile:
  $\text{Profile Threat} = (\text{Attacks} \times \text{Min Damage} \times (7 - \text{WS})) + \sum (\text{Special Rule PR Modifiers})$
- $\text{Weapon Threat} = \max(\text{Profile Threat across all equipped weapons})$
- $\text{Ability Score} = \sum (\text{Ability PR Modifiers})$

---

## 3. JSON Schema (`BestiaryEntry`)

```json
{
  "id": 9999,
  "name": "string",
  "faction": "The Gilded Accord",
  "subgroup": "Automaton",
  "pr": 85,
  "attributes": {
    "Movement": 6,
    "Wounds": 14,
    "Save": 4,
    "APL": 2,
    "body": [
      "construct",
      "human"
    ]
  },
  "weapons": [
    2,
    23
  ],
  "abilities": [
    {
      "name": "Heavy Plating",
      "effect": "Each time a shooting attack is allocated to this operative, you can re-roll one Defense die.",
      "prModifier": 10
    }
  ],
  "deployables": [
    {
      "id": 1,
      "quant": 2
    }
  ],
  "isDiscovered": true,
  "discoveredCampaignIds": [
    1
  ]
}
```

---

## 4. Common Existing Weapon IDs Reference

- **Melee**: `1` (Bayonet), `2` (Chainsword), `8` (Power Sword), `10` (Rusty Spear), `12` (Tidal Trident), `18` (Claws), `19` (Aether Talons), `22` (Stone Fists), `28` (Combat Knife)
- **Ranged**: `23` (Lasgun), `24` (Stub Pistol), `29` (Plasma Rifle), `31` (Boltgun), `33` (Stalker Bolt Rifle), `52` (Bolt Pistol), `55` (Flamer)
- **Spells / Psychic**: `42` (Tidal Bolt), `45` (Psychic Shriek), `49` (Warpflame Blast)

---

## 5. Database Scoping & Reference Tagging

- **Database Collection**: Bestiary entries are stored globally in the `Nebryss-assets` database inside the `bestiary` collection.
- **Entity Reference Tag**: `@bestiary[<id>]` (e.g. `@bestiary[14]`) for raw database persistence.
- **Chat Display**: When presenting creature drafts in chat for user review, use clean text (e.g. `Zephyrian Guard Automaton`), never raw reference tags.

---

## 6. Companion Tool CLI Commands

Execute mutations via `campaign-session-tool.js` (staged for interactive user approval):

```bash
# Search valid weapons
node scripts/campaign-session-tool.js list-weapons "Chainsword"

# Calculate exact PR before creating
node scripts/campaign-session-tool.js calculate-pr \
  --weapons="2,23" \
  --attributes='{"Movement":6,"Wounds":12,"Save":4,"APL":2,"body":["human"]}' \
  --abilities='[{"name":"Vigilance","effect":"Overwatch attacks hit on 4+ instead of 5+","prModifier":8}]'

# Create Bestiary Entry
node scripts/campaign-session-tool.js create-bestiary \
  --name="Zephyrian Guard Automaton" \
  --faction="The Gilded Accord" \
  --subgroup="Construct" \
  --weapons="2,23" \
  --attributes='{"Movement":6,"Wounds":14,"Save":4,"APL":2,"body":["construct","human"]}' \
  --abilities='[{"name":"Reinforced Frame","effect":"Ignore the first mortal wound taken per turning point","prModifier":10}]' \
  --isDiscovered=true

# Create Combined Combat NPC
node scripts/campaign-session-tool.js create-combat-npc \
  --campaignId=1 \
  --name="Captain Vane" \
  --factionId=5 \
  --subgroup="Crimson Corsairs" \
  --role="Pirate Captain" \
  --location="Brinewake Isle" \
  --weapons="8,52" \
  --attributes='{"Movement":6,"Wounds":16,"Save":3,"APL":3,"body":["human"]}' \
  --abilities='[{"name":"Lead from the Front","effect":"Friendly operatives within 6″ gain +1 to hit","prModifier":15}]'
```