---
name: Nebryss Mist Effect Designer
description: Designs, balances, and formats environmental Mist Effects, density tiers, hazard anomalies, and combat zones for the Nebryss Kill Team Campaign in the exact MistEffect schema. Invoke when the user asks to create or balance environmental mist effects.
---

# Nebryss Mist Effect Designer

This skill governs the creation, density scaling, and tactical combat rules of environmental Mist Effects within the Nebryss skirmish game.

---

## 1. Execution Steps

1. **Establish Effect Concept & Density Level**:
   - `effectName`: Clear, punchy hazard name (e.g., *"Mist Anomaly"*, *"Obscuration"*, *"Drift"*, *"Resonance"*, *"Mist Echoes"*).
   - `densityLevel`: Select the environmental tier:
     - `"Light"`: Subtle visibility penalties, minor movement adjustments.
     - `"Medium"`: Action restrictions (e.g. no dash), positioning shifts, moderate WS penalties.
     - `"Dense"`: Severe mortal wound triggers, creature spawning, ability suppression, heavy targeting limits.
     - `""` (Empty): Universal or dispersal zone rules.
2. **Draft Rules Text (`description`)**:
   - Write clear tabletop rules for turning point triggers, activation checks, or combat dice modifications.
   - Use HTML formatting tags (`<strong>4+</strong>`, `<strong>1D3 wound</strong>`, `10″`) for bold highlighting in table cards.
3. **Format & Persist**: Output valid JSON matching the `MistEffect` schema.
4. **Full Object Replacement on Updates (API Overwrite Rule)**: The API updates database records via full document overwrite (`replaceOne` matching the `id` field). When updating a Mist Effect (`PUT /api/mistEffect`), always pass the **entire object with all fields** (`id`, `effectName`, `densityLevel`, `description`), NOT only the modified fields.

---

## 2. JSON Schema (`MistEffect`)

```json
{
  "id": 9999,
  "effectName": "Aetheric Surge",
  "densityLevel": "Dense",
  "description": "At the start of each Turning Point, all operatives in the mist zone roll <strong>1D6</strong>. On a <strong>1</strong>, that operative suffers <strong>1D3 mortal wounds</strong> from arcing mist electricity."
}
```

---

## 3. Canonical Density Tiers Reference

- **Light Mist**: Operatives treat line of sight beyond 10″ as Obscured; slight movement friction.
- **Medium Mist**: Dash actions prohibited or restricted; random 2″ drifts; line of sight beyond 6″ obscured; worsening of ballistic WS.
- **Dense Mist**: Random lethal wounds; warp entities / Forces of Nature ambushes; psychic resonance (+1 to hit but risk of self-wounding); inability to use Silent or Conceal abilities.

---

## 4. Database Scoping & API Operations

- **Database Collection**: Mist Effects are stored globally in the `Nebryss-assets` database inside the `mistEffect` collection.
- **Update Rule (`PUT /api/mistEffect`)**: When updating existing mist effects, always send the full object (`id`, `effectName`, `densityLevel`, `description`) to avoid wiping out properties during `replaceOne` document replacement.

