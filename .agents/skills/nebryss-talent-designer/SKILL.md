---
name: Nebryss Talent Designer
description: Designs, balances, and formats character Talents (combat perks, magic disciplines, support abilities, and passive stat bonuses) and Talent Categories for the Nebryss Kill Team Campaign in the exact Talent schema. Invoke when the user asks to create or balance a talent or perk.
---

# Nebryss Talent Designer

Talents live inside talent categories (`talent` collection). See existing categories and talents with `list-entities talent`.

## 1. Steps
1. **Category & ID**: combat (`c1`, `c2`...), magic/mist-weaving (`m...`), support/medicae/crafting/leadership (`s...`), or a custom category. Next free ID in the series.
2. **Balance**: `cost` 1–5 talent points; `maxStacks` (1, more for tiered ranks); `requirements` = prerequisite talent IDs (`["c1"]`); `prModifier` null or 1–10 when used on combatants.
3. **`effect`**: rules text; HTML like `<strong>+1 die</strong>` renders in the UI.
4. **`statModifications`** for mechanical bonuses — same keys and targeting as afflictions: `stat` in `Movement`, `Wounds`, `Save`, `APL`, `hit`, `damage`, `attacks`, `crit`; optional `applyToType` `"range"` (`"0"` melee / `"-"` ranged), `"type"` (weapon category: `pistol`, `rifle`...), `"body"` (`human`, `astartes`...).
5. Draft in chat for approval. Players hold talent IDs in `progression.talents` (`update-player --talents`).

**Persistence**: no companion command; categories are saved through `PUT /api/talent`, which replaces the whole category — always send `id`, `name`, `description` and the COMPLETE `talents` array.

## 2. Schemas
Talent: `{ "id": "c14", "name": str, "cost": n, "effect": str, "prModifier": n|null, "requirements": [talentId], "maxStacks": n, "statModifications": [{"stat": "crit", "mod": 1, "applyToType": "range", "applyToValue": "0"}] }`
Category: `{ "id": "combat", "name": "Combat Discipline", "description": str, "talents": [Talent] }`
