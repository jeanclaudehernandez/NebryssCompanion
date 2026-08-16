---
name: Nebryss Item Category Designer
description: Designs, configures, and structures dynamic Item Categories and table column mappings for the Nebryss Kill Team Campaign in the exact ItemCategory schema. Invoke when the user asks to create or configure an item category or table definition.
---

# Nebryss Item Category Designer

This skill governs the creation and column binding of Item Categories (`itemCategories.json` / `itemCategory` collection), which define how items in the catalog are grouped, filtered, and dynamically rendered in generic table views.

---

## 1. Execution Steps

1. **Establish Category Name & Key**:
   - `name`: Display label for tab headers and menus (e.g., `"Armor"`, `"Mist Engines"`, `"Cannons"`).
   - `key`: Lowercase/camelCase identifier that matches `Item.type` (e.g., `"armor"`, `"mistEngine"`, `"cannon"`).
2. **Map Headers & Keys**:
   - `headers`: Array of human-readable column titles (e.g. `["Name", "Price", "Optimal Conditions", "Max Speed", "Max Weight"]`).
   - `keys`: Array of exact `Item` property keys corresponding 1:1 with each header in order (e.g. `["name", "price", "optimalConditions", "maxSpeed", "maxWeight"]`).
3. **Format & Persist**: Output valid JSON matching the `ItemCategory` schema.
4. **Full Object Replacement on Updates (API Overwrite Rule)**: The API updates database records via full document overwrite (`replaceOne` matching the `id` field). When updating an Item Category (`PUT /api/itemCategory`), always pass the **entire object with all fields** (`id`, `name`, `key`, `headers`, `keys`), NOT only the modified fields.

---

## 2. JSON Schema (`ItemCategory`)

```json
{
  "id": 9999,
  "name": "Mist Engines",
  "key": "mistEngine",
  "headers": [
    "Name",
    "Price",
    "Optimal Conditions",
    "Max Speed",
    "Max Weight"
  ],
  "keys": [
    "name",
    "price",
    "optimalConditions",
    "maxSpeed",
    "maxWeight"
  ]
}
```

---

## 3. Existing Item Categories Reference

| ID | Name | Key | Configured Headers / Keys |
|---|---|---|---|
| 1 | **Armor** | `armor` | `name`, `price`, `description`, `raceReq` (Body) |
| 2 | **Consumables** | `consumable` | `name`, `price`, `description` |
| 3 | **Ammunition** | `ammunition` | `name`, `price`, `quantity`, `subtype`, `description` |
| 4 | **Mist Engines** | `mistEngine` | `name`, `price`, `optimalConditions`, `maxSpeed`, `maxWeight` |
| 5 | **Ship Hulls** | `shipHull` | `name`, `price`, `weight`, `shipWounds`, `defense`, `maxCargo` |
| 6 | **Cannons** | `cannon` | `name`, `price`, `ammoType`, `weight` |
| 7 | **Cannonballs** | `cannonball` | `name`, `price`, `damage` |
| 8 | **Deployables** | `deployable` | `name`, `type`, `description` |
| 9 | **Modification** | `modification` | `name`, `price`, `description`, `part` |
| 10 | **Material** | `material` | `name`, `price`, `description`, `bestiaryId` (Dropped From) |
| 11 | **Blueprint** | `blueprint` | `name`, `price`, `description`, `blueprintFor` (Weapon) |

---

## 4. Database Scoping & API Operations

- **Database Collection**: Item Categories are stored globally in the `Nebryss-assets` database inside the `itemCategory` collection.
- **Update Rule (`PUT /api/itemCategory`)**: Always send the entire category object (`id`, `name`, `key`, `headers`, `keys`) to prevent losing column configurations during `replaceOne` overwrite.

