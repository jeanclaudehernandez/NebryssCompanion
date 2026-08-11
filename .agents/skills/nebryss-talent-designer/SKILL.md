---
name: Nebryss Talent Designer
description: Designs new Talents for the Nebryss Killteam Campaign in the exact talents JSON shape. Invoke when the user asks to create a talent/perk/upgrade (including requirements and stat modifications, e.g., "Create a support talent for healing" or "Design a combat perk that improves melee crits").
---

### Execution Steps

1. **Select Category:** Determine which existing Talent Category the talent belongs to (e.g., combat, magic, support), or create a new category only if requested.
2. **Balance:** Set `cost` (typical 1–5) and optionally `prModifier` (often 1–7, or `null`).
3. **Format:** Output JSON only (no extra text) in one of the two accepted formats below.

### Output Format A: Talent Object (Recommended)

Use this when adding a talent into a category’s `talents` array inside `src/assets/talents.json`.

```json
{
  "id": "c9999",
  "name": "string",
  "cost": 1,
  "effect": "string",
  "prModifier": null,
  "requirements": [],
  "maxStacks": 1,
  "statModifications": [
    {
      "stat": "Movement | Wounds | APL | Save | hit | damage | attacks | crit",
      "mod": 1,
      "applyToType": "body | type | range",
      "applyToValue": "string"
    }
  ]
}
```

### Output Format B: Add A Category (Only If Requested)

```json
{
  "id": "new-category-id",
  "name": "Category Name",
  "description": "string",
  "talents": [
    {
      "id": "t9999",
      "name": "string",
      "cost": 1,
      "effect": "string",
      "prModifier": null,
      "requirements": [],
      "maxStacks": 1
    }
  ]
}
```

### Talent ID Conventions

- Match the category’s existing prefix if possible:
  - `combat` talents typically use `c...` (e.g., `c1`)
  - `magic` talents typically use `m...` (e.g., `m1`)
  - `support` talents typically use `s...` (e.g., `s1`)
- If uncertain, use `"t9999"` and let the user provide the final ID.

### Effect Text Guidelines

- Keep effects concise and rules-focused.
- HTML tags like `<strong>...</strong>` are allowed (and commonly used in the existing file).
- If the talent modifies stats mechanically, prefer adding `statModifications` rather than encoding everything only in `effect`.
