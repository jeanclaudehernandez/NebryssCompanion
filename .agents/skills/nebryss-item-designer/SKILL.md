---
name: Nebryss Item Designer
description: Designs, balances, and formats game items (consumables, armor, ammunition, modifications, materials, blueprints, mist engines, ship hulls, cannons, cannonballs, and deployables) for the Nebryss Kill Team Campaign adhering to the 11 Item category schemas. Invoke when the user asks to create or balance an item.
---

# Nebryss Item Designer

This skill governs the creation, balance, pricing, and category-specific property structures of Items within the Nebryss campaign ecosystem.

---

## 1. Execution Steps

1. **Select Category (`type`)**: Identify which of the 11 item types matches the requested equipment:
   - `consumable`, `armor`, `ammunition`, `mistEngine`, `shipHull`, `cannon`, `cannonball`, `deployable`, `modification`, `material`, `blueprint`
2. **Balance Costs & Effects**: Assign an appropriate price in Mistrals and clear mechanical rules.
3. **Format & Persist**: Output valid JSON matching the exact schema for the selected type, inserting weapon rule references as `/weaponRule/:ID/` and status references as `/status/:ID/`. Stage in MongoDB via `campaign-session-tool.js`.

---

## 2. Category Output Schemas

### 1. Consumable (Potions, Stimms, Rations, Filters)
```json
{
  "id": 9999,
  "name": "Mist Filter Capsule",
  "price": 10,
  "description": "Purges inhaled toxins. Grants immunity to mist-induced status effects for 1 Turning Point.",
  "type": "consumable"
}
```

### 2. Armor (Combat Suits, Carapace, Power Plates)
```json
{
  "id": 9999,
  "name": "Reinforced Carapace Rig",
  "price": 65,
  "description": "Heavy ceramic plating that deflects shrapnel. Improves Save by 1.",
  "type": "armor",
  "raceReq": "Human",
  "isEquippable": true,
  "statModifications": [
    {
      "stat": "Save",
      "mod": 1
    }
  ]
}
```

### 3. Ammunition (Specialty Rounds, Batteries, Bolts)
```json
{
  "id": 9999,
  "name": "Incendiary Bolter Mag",
  "price": 18,
  "quantity": 10,
  "subtype": "Bolter",
  "description": "Chemical payloads ignited on impact. Applies /status/:3/ (Burning) on critical hits.",
  "type": "ammunition"
}
```

### 4. Mist Engine (Ship Propulsion & Air-Vessel Engines)
```json
{
  "id": 9999,
  "name": "Zephyr-Core Mk IV Engine",
  "price": 450,
  "optimalConditions": "High Altitude / Low Mist Density",
  "maxSpeed": "32 Knots",
  "maxWeight": 1200,
  "description": "A refined steam-and-aether turbine tuned for rapid transit along stable trade lanes.",
  "type": "mistEngine"
}
```

### 5. Ship Hull (Airship / Skiff Vessel Frameworks)
```json
{
  "id": 9999,
  "name": "Corsair Outrunner Hull",
  "price": 850,
  "weight": 850,
  "shipWounds": 28,
  "defense": 4,
  "maxCargo": 150,
  "description": "Lightweight ironwood frame reinforced with salvaged promethium plating.",
  "type": "shipHull"
}
```

### 6. Cannon (Ship-Mounted Heavy Artillery)
```json
{
  "id": 9999,
  "name": "Gilded Twin Macro-Cannon",
  "price": 320,
  "ammoType": "Heavy Cannonball",
  "weight": 240,
  "description": "Long-range broadside cannon designed for aerial bombardment.",
  "type": "cannon"
}
```

### 7. Cannonball (Naval Ordnance)
```json
{
  "id": 9999,
  "name": "Aether-Charged Solid Shot",
  "price": 25,
  "damage": "4D6 + 8",
  "description": "High-density lead sphere filled with volatile mist condensates.",
  "type": "cannonball"
}
```

### 8. Deployable (Turrets, Barricades, Mines, Beacons)
```json
{
  "id": 9999,
  "name": "Deployable Holo-Emitter",
  "price": 35,
  "type": "deployable",
  "description": "Generates a 3″ illusory mist cloud providing light cover to friendly operatives."
}
```

### 9. Modification (Weapon Scopes, Stocks, Barrels)
```json
{
  "id": 9999,
  "name": "Precision Reflex Sight",
  "price": 30,
  "description": "Grants /weaponRule/:44/ (Accurate 1) to attached firearm.",
  "type": "modification",
  "part": "Scope",
  "attachedTo": 23
}
```

### 10. Material (Monster Parts, Refined Alloys, Essences)
```json
{
  "id": 9999,
  "name": "Glistening Leviathan Scale",
  "price": 40,
  "description": "Harvested from the deep mist. Used to craft hardened armor and energy-reflecting shields.",
  "type": "material",
  "bestiaryId": 14
}
```

### 11. Blueprint (Schematics & Crafting Blueprints)
```json
{
  "id": 9999,
  "name": "Blueprint: Masterwork Balefire Blade",
  "price": 75,
  "description": "Complete metallurgical instructions for forging an aether-infused power blade.",
  "type": "blueprint",
  "blueprintFor": 8,
  "buildMaterials": [
    {
      "id": 10,
      "amount": 3
    },
    {
      "id": 15,
      "amount": 2
    }
  ]
}
```

---

## 3. Database Scoping & Reference Tagging

- **Database Collection**: Items are stored globally in the `Nebryss-assets` database inside the `item` collection.
- **Entity Reference Tag**: `@item[<id>]` (e.g. `@item[18]`) for raw database persistence.
- **Chat Display**: When presenting item drafts in chat for user review, use clean text (e.g. `Mist Filter Capsule`), never raw reference tags.

---

## 4. Companion Tool CLI Commands

Execute mutations via `campaign-session-tool.js` (staged for interactive user approval):

```bash
# Create standard item
node scripts/campaign-session-tool.js create-item \
  --name="Aetheric Healing Balm" \
  --type="consumable" \
  --price=15 \
  --description="Restores 1D3+2 lost Wounds and removes the Bleeding status."

# Update existing item
node scripts/campaign-session-tool.js update-item \
  --id=12 \
  --price=22 \
  --description="Updated description and price."
```