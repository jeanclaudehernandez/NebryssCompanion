---
name: Nebryss Affliction Designer
description: Designs new Afflictions for the Nebryss Killteam Campaign in the exact afflictions JSON shape. Invoke when the user asks to create or balance an affliction/injury/curse.
Trigger: User requests a new affliction (e.g., "Create a lingering poison affliction" or "Design a curse that lowers APL").
---

### Execution Steps

1. **Conceptualize:** Create a lore-friendly affliction name, a clear gameplay effect, and a plausible treatment.
2. **Balance:** Keep effects meaningful but not run-ending; typical `toHeal` is 1–6.
3. **Format:** Output a single JSON object strictly matching the `Affliction` schema used in `src/assets/afflictions.json`. Do not output any extra text outside the JSON.

### Output Schema (`Affliction`)

```json
{
  "id": "9999",
  "name": "string",
  "effect": "string",
  "treatment": "string",
  "toHeal": 1,
  "progress": 0,
  "statModifications": [
    {
      "stat": "Movement | Wounds | APL | Save | hit | damage | attacks | crit",
      "mod": -1,
      "applyToType": "body | type | range",
      "applyToValue": "string"
    }
  ]
}
```

### Stat Modifications Notes

- Omit `statModifications` if the affliction is purely narrative or rules-text-only.
- Use `stat: "Movement" | "Wounds" | "APL" | "Save"` for direct attribute changes.
- Use `stat: "hit" | "damage" | "attacks" | "crit"` for weapon-related modifications.
- Use targeting only when needed:
  - `applyToType: "range"` with `applyToValue: "0"` for melee-only, or `applyToValue: "-"` for ranged-only.
  - `applyToType: "type"` with `applyToValue` like `"rifle"`, `"pistol"`, `"sniper"`, etc.
  - `applyToType: "body"` with `applyToValue` like `"human"`, `"astartes"`, `"spell"`, etc.

