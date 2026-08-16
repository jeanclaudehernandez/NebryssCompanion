---
name: Nebryss Talent Designer
description: Designs, balances, and formats character Talents (combat perks, magic disciplines, support abilities, and passive stat bonuses) and Talent Categories for the Nebryss Kill Team Campaign in the exact Talent schema. Invoke when the user asks to create or balance a talent or perk.
---

# Nebryss Talent Designer

This skill governs the creation, balance, stat modifications, prerequisite trees, and category structures of character Talents within the Nebryss progression system.

---

## 1. Execution Steps

1. **Select / Create Category**:
   - Determine which category the talent belongs to: `combat` (prefix `c`), `magic` (prefix `m`), `support` (prefix `s`), or custom category.
2. **Balance Talent Costs & Stacks**:
   - `cost`: Talent point cost (typically `1` to `5`).
   - `maxStacks`: Maximum number of times a player can purchase this talent (usually `1`, or higher for tiered ranks).
   - `requirements`: Array of prerequisite talent IDs (e.g. `["c1", "c3"]`).
   - `prModifier`: Optional Points Rating modifier when equipping onto combatants (typically `null` or `1` to `10`).
3. **Configure Stat Modifications**:
   - If the talent mechanically alters operative attributes, add structured `statModifications` objects.
   - Use HTML formatting (e.g., `<strong>+1 die</strong>`) in `effect` for readable rendering in the UI.
4. **Format Output**: Output valid JSON matching the `Talent` or `TalentCategory` schema.

---

## 2. JSON Schemas

### Format A: Single Talent Object (Inside a Category's `talents` array)

```json
{
  "id": "c14",
  "name": "Duelist's Riposte",
  "cost": 2,
  "effect": "Each time an enemy operative resolves a normal strike against you in melee combat, you can spend 1 focus to immediately resolve one of your retained parries as a strike instead.",
  "prModifier": 6,
  "requirements": [
    "c1"
  ],
  "maxStacks": 1,
  "statModifications": [
    {
      "stat": "crit",
      "mod": 1,
      "applyToType": "range",
      "applyToValue": "0"
    }
  ]
}
```

### Format B: Full Talent Category Object

```json
{
  "id": "combat",
  "name": "Combat Discipline",
  "description": "Martial prowess, blade mastery, and firearm efficiency.",
  "talents": [
    {
      "id": "c1",
      "name": "Blade Precision",
      "cost": 1,
      "effect": "Improves melee Weapon Skill (WS) by 1 (e.g. 4+ becomes 3+).",
      "prModifier": 4,
      "requirements": [],
      "maxStacks": 1,
      "statModifications": [
        {
          "stat": "hit",
          "mod": 1,
          "applyToType": "range",
          "applyToValue": "0"
        }
      ]
    }
  ]
}
```

---

## 3. ID Prefix Conventions

- `c...`: Combat talents (e.g. `c1`, `c2`, `c14`)
- `m...`: Magic / Aether / Mist-Weaving talents (e.g. `m1`, `m2`)
- `s...`: Support, Medicae, Crafting, and Leadership talents (e.g. `s1`, `s2`)

---

## 4. Stat Modification Rules

- **Allowed `stat` keys**:
  - Direct attributes: `"Movement"`, `"Wounds"`, `"Save"`, `"APL"`
  - Combat / Weapon mods: `"hit"`, `"damage"`, `"attacks"`, `"crit"`
- **Targeting Modifiers (`applyToType` & `applyToValue`)**:
  - `applyToType: "range"`: Use `"0"` for melee weapons only, `"-"` for ranged weapons only.
  - `applyToType: "type"`: Use with weapon types (e.g. `"pistol"`, `"rifle"`, `"blade"`).
  - `applyToType: "body"`: Use with body types (e.g. `"human"`, `"astartes"`).

---

## 5. Database Scoping

- **Database Collection**: Talents and Talent Categories are stored globally in the `Nebryss-assets` database inside the `talent` collection.
