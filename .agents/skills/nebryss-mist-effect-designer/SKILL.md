---
name: Nebryss Mist Effect Designer
description: Designs, balances, and formats environmental Mist Effects, density tiers, hazard anomalies, and combat zones for the Nebryss Kill Team Campaign in the exact MistEffect schema. Invoke when the user asks to create or balance environmental mist effects.
---

# Nebryss Mist Effect Designer

Mist effects are environmental rules per mist density (`mistEffect` collection). See existing ones with `list-entities misteffect`.

## 1. Steps
1. **`effectName`**: short hazard name (Mist Anomaly, Obscuration, Drift, Resonance...).
2. **`densityLevel`** and its intensity:
   - `"Light"`: visibility penalties (Obscured beyond ~10″), slight movement friction.
   - `"Medium"`: action limits (no Dash), random 2″ drifts, Obscured beyond ~6″, worse ranged WS.
   - `"Dense"`: random mortal wounds, Forces of Nature / warp ambushes, psychic resonance, no Silent/Conceal.
   - `""`: universal or dispersal-zone rules.
3. **`description`**: tabletop rules with clear triggers (start of turning point, on activation, on attack); HTML `<strong>` for key numbers.
4. Draft in chat for approval.

**Persistence**: no companion command; saved through `PUT /api/mistEffect`, which replaces the whole document — always send `id`, `effectName`, `densityLevel` and `description` together.

## 2. Schema (`MistEffect`)
`{ "id": n, "effectName": "Aetheric Surge", "densityLevel": "Dense", "description": "At the start of each Turning Point, operatives in the mist roll <strong>1D6</strong>; on a <strong>1</strong> they suffer <strong>1D3 mortal wounds</strong>." }`
