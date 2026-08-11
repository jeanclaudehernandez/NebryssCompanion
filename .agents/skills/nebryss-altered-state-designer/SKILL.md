---
name: Nebryss Altered State Designer
description: Designs new Altered States (status effects) for the Nebryss Killteam Campaign in the exact alteredStates JSON shape. Invoke when the user asks to add a new status condition or alter states.
---

### Execution Steps

1. **Conceptualize:** Create a short condition name and a rules-complete effect description.
2. **Balance:** Status effects should be impactful but removable; include a clear removal condition or duration when appropriate.
3. **Format:** Output a single JSON object strictly matching the `AlteredState` schema used in `src/assets/alteredStates.json`. Do not output any extra text outside the JSON.

### Output Schema (`AlteredState`)

```json
{
  "id": 9999,
  "name": "string",
  "effect": "string"
}
```

