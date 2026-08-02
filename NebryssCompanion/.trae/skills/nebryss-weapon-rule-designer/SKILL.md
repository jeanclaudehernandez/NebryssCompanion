---
name: Nebryss Weapon Rule Designer
description: Designs new Weapon Rules for the Nebryss Killteam Campaign in the exact weaponRules JSON shape. Invoke when the user asks to add a special weapon rule keyword and its effect/prModifier.
Trigger: User requests a new weapon rule (e.g., "Create a rule for corrosive damage" or "Add a mobility rule for mist weapons").
---

### Execution Steps

1. **Conceptualize:** Create a short rule name (optionally with placeholders like `<x>`), plus an unambiguous rules-text `effect`.
2. **Balance:** Set `prModifier` (often 1–7), or `null` when the rule is situational/minor. Negative modifiers are allowed for drawbacks.
3. **Format:** Output a single JSON object strictly matching the `WeaponRule` schema used in `src/assets/weaponRules.json`. Do not output any extra text outside the JSON.

### Output Schema (`WeaponRule`)

```json
{
  "id": 9999,
  "name": "string",
  "effect": "string",
  "prModifier": null
}
```

### Notation Rules (Match Existing Data)

- Placeholders are written literally as `<x>` in `name` and/or `effect` (e.g., `"Lethal <x>+"`, `"Blast <x> inches"`).
- Status references use the token format `/status/:ID/` inside `effect` (e.g., `"/status/:3/"` for Burning).
- Keep the effect text complete enough that it can stand alone in a reference table.

