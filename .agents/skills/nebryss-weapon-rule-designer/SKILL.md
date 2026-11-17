---
name: Nebryss Weapon Rule Designer
description: Designs and balances special Weapon Rules (combat keywords, critical hit effects, situational modifiers, and PR point adjustments) for the Nebryss Kill Team Campaign in the exact WeaponRule schema. Invoke when the user asks to create or balance a special weapon rule.
---

# Nebryss Weapon Rule Designer

## 1. Steps
1. Check `list-entities weaponrule --search="..."` first; reuse an existing rule instead of duplicating it.
2. **Name**: short keyword; write numeric scaling literally as `<x>` (`Lethal <x>+`, `Piercing <x>`, `Blast <x>"`). The weapon's `modValue` fills it.
3. **Effect**: standalone tabletop text with clear timing ("Each time a critical hit is retained...").
4. **Status links**: write altered states as `/status/:ID/` (e.g. `/status/:3/`). Look IDs up with `list-entities alteredstate` — never from memory.
5. **`prModifier`**: positive integer for advantages (usually 2–15), negative for drawbacks (`Hot`, `Break`), `null` if cosmetic or purely situational. It feeds creature PR.
6. Draft in chat with clean names; stage `create-weapon-rule` after approval.

**Updates merge**: send `--id` plus the changed fields only.

## 2. Schema (`WeaponRule`, global `weaponRule` collection, tag `@weaponrule[id]`)
`{ "id": n, "name": "Corrosive <x>", "effect": "Each time a critical hit is retained, the target suffers <x> mortal wounds and gains /status/:2/.", "prModifier": n|null }`

## 3. Commands (single line)
`node scripts/campaign-session-tool.js create-weapon-rule --name="Mist Vortex <x>\"" --effect="Creates a mist vortex of radius <x> inches around the target; operatives within are Obscured." --prModifier=8`
`node scripts/campaign-session-tool.js update-weapon-rule --id=25 --prModifier=10`
