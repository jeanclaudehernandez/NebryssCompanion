---
name: Nebryss Item Designer
description: **Description:** Designs game items (consumables, armor, ammunition, modifications, materials, or blueprints) strictly adhering to the game's item JSON structures.
**Trigger:** User requests an item (e.g., "Create a healing potion," "Design heavy armor").
---

### Execution Steps

1. **Select Type:** Identify the exact item category from the 6 available schemas.
2. **Balance:** Assign appropriate pricing and mechanical effects.
3. **Format:** Output the required JSON. Insert weapon rules into descriptions using the syntax `/weaponRule/:ID/`.

### Output Schemas (Choose One)

**1. Consumable** (Price: 2-20)

```json
{
  "id": 9999,
  "name": "string",
  "price": "number",
  "description": "string",
  "type": "consumable"
}

```

**2. Armor** (Price: 10-250)

```json
{
  "id": 9999,
  "name": "string",
  "price": "number",
  "description": "string (e.g., Wounds +4, Save +1)",
  "raceReq": "string (Universal, Human, Astartes, etc.)",
  "type": "armor"
}

```

**3. Ammunition** (Price: 2-15)

```json
{
  "id": 9999,
  "name": "string",
  "price": "number",
  "quantity": "number",
  "subtype": "string (Bolter, Plasma, Pistol, Rifle, Sniper)",
  "description": "string (e.g., Grants /weaponRule/:52/)",
  "type": "ammunition"
}

```

**4. Modification** (Price: 20-50)

```json
{
  "id": 9999,
  "name": "string",
  "price": "number",
  "description": "string",
  "type": "modification",
  "part": "string (Barrel, Scope, Pistol, Rifle, Any)"
}

```

**5. Material** (Price: 5-50)

```json
{
  "id": 9999,
  "name": "string",
  "price": "number",
  "description": "string",
  "type": "material",
  "bestiaryId": "number (optional)"
}

```

**6. Blueprint** (Price: 5-15)

```json
{
  "id": 9999,
  "name": "string (Blueprint: [Weapon Name])",
  "price": "number",
  "description": "string",
  "type": "blueprint",
  "blueprintFor": "number (Weapon ID)",
  "buildMaterials": [
    { "id": 9999, "amount": 1 }
  ]
}

```

---