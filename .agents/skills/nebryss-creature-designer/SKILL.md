---
name: Nebryss Creature Designer
description: Generates new creatures, enemies, and NPCs as Bestiary entries with balanced stats, abilities, and weapons. Invoke when user asks for a creature (e.g., "Create a fast scout for the rebels," "Make a tanky swamp beast").
---

### Execution Steps

1. **Conceptualize:** Create a thematic name, assign a faction (e.g., Imperium, Forces of nature), and define the subgroup (e.g., Construct, Daemon).
2. **Balance Attributes:**
* **PR (Points Rating):** 50 (Weak) to 200 (Boss).
* **Movement:** 4 (Slow), 6 (Standard), 8+ (Fast).
* **Wounds:** 6-8 (Weak), 10-14 (Average), 18+ (Tank).
* **Save:** 2-6 (Lower is better).
* **APL:** 2 (Standard), 3 (Elite), 4 (Boss).


3. **Format:** Output the JSON object matching the `BestiaryEntry` schema.

### Output Schema

```json
{
  "id": 9999,
  "name": "string",
  "faction": "string",
  "subgroup": "string",
  "pr": "number",
  "attributes": {
    "Movement": "number",
    "Wounds": "number",
    "Save": "number",
    "APL": "number",
    "body": ["string (universal, human, astartes, daemon, etc.)"]
  },
  "weapons": ["number (Weapon IDs)"],
  "abilities": [
    {
      "name": "string",
      "effect": "string",
      "prModifier": "number (optional, usually 5-15)"
    }
  ],
  "isDiscovered": true,
  "discoveredCampaignIds": [1]
}

```

### Reference: Common Creature Weapon IDs

* **Melee:** 1 (Bayonet), 2 (Chainsword), 8 (Power Sword), 10 (Rusty Spear), 12 (Tidal Trident)
* **Ranged:** 23 (Lasgun), 24 (Stub Pistol), 31 (Boltgun), 29 (Plasma Rifle), 52 (Bolt Pistol), 33 (Stalker Bolt Rifle)
* **Spells:** 42 (Tidal Bolt), 45 (Psychic Shriek), 49 (Warpflame Blast)
* **Monster Parts:** 18 (Claws), 19 (Aether Talons), 22 (Stone Fists)
-----------