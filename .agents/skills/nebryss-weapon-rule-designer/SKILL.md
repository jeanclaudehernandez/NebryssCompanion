---
name: Nebryss Weapon Rule Designer
description: Designs and balances special Weapon Rules (combat keywords, critical hit effects, situational modifiers, and PR point adjustments) for the Nebryss Kill Team Campaign in the exact WeaponRule schema. Invoke when the user asks to create or balance a special weapon rule.
---

# Nebryss Weapon Rule Designer

This skill governs the creation, balance, modifier placeholders, and Points Rating (PR) calculation impact of Weapon Rules within the Nebryss skirmish system.

---

## 1. Execution Steps

1. **Conceptualize Rule**: Create a concise keyword name (using placeholder `<x>` where numeric scaling is needed, e.g., `Lethal <x>+`, `Piercing <x>`, `Blast <x>"`).
2. **Write Effect Text**:
   - Write clear, standalone tabletop rules text explaining activation timing (e.g. *Each time a critical hit is retained...*).
   - If applying an Altered State, format the reference token as `/status/:ID/` (e.g. `/status/:3/` for Burning).
3. **Assign Points Rating (`prModifier`)**:
   - Set a positive integer modifier for offensive/defensive advantages (typically `2` to `15`).
   - Use negative numbers for weapon drawbacks (e.g. `Hot`, `Break`).
   - Use `null` if the rule is purely cosmetic or strictly situational.
4. **Format & Persist**: Output valid JSON matching the `WeaponRule` schema and stage the entity in MongoDB via `campaign-session-tool.js`.

---

## 2. JSON Schema (`WeaponRule`)

```json
{
  "id": 9999,
  "name": "Corrosive <x>",
  "effect": "Each time a critical hit is retained with this weapon, the target operative suffers <x> additional mortal wounds and gains the /status/:2/ status condition.",
  "prModifier": 12
}
```

---

## 3. Notation & Rule Conventions

- **Placeholders**: Write numerical variables literally as `<x>` in `name` and `effect` (e.g., `"Devastating <x>"`, `"Accurate <x>"`).
- **Status Condition Linking**: Always link status conditions using the slash token syntax:
  - `/status/:1/` -> Entangled
  - `/status/:2/` -> Bleeding
  - `/status/:3/` -> Burning
  - `/status/:4/` -> Suppressed
  - `/status/:5/` -> Mist-Infused
  - `/status/:6/` -> Electrified
  - `/status/:7/` -> Corrupted
  - `/status/:8/` -> Disoriented
  - `/status/:9/` -> Poisoned
  - `/status/:10/` -> Blinded

---

## 4. Database Scoping & Reference Tagging

- **Database Collection**: Weapon Rules are stored globally in the `Nebryss-assets` database inside the `weaponRule` collection.
- **Entity Reference Tag**: `@weaponrule[<id>]` (e.g. `@weaponrule[21]`) for raw database persistence.
- **Chat Display**: When presenting rule drafts in chat for user review, use clean text (e.g. `Lethal 5+`), never raw reference tags.

---

## 5. Companion Tool CLI Commands

Execute mutations via `campaign-session-tool.js` (staged for interactive user approval):

```bash
# Create standard Weapon Rule
node scripts/campaign-session-tool.js create-weapon-rule \
  --name="Mist Vortex <x>\"" \
  --effect="Creates a dense mist vortex of radius <x> inches around the target. All operatives within treat visibility as Obscured." \
  --prModifier=8

# Update existing Weapon Rule
node scripts/campaign-session-tool.js update-weapon-rule \
  --id=25 \
  --prModifier=10
```
