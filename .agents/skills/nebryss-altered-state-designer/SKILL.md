---
name: Nebryss Altered State Designer
description: Designs and balances Altered States (temporary combat status conditions, elemental debuffs, and psychological effects) for the Nebryss Kill Team Campaign in the exact AlteredState schema. Invoke when the user asks to create, modify, or balance status effects.
---

# Nebryss Altered State Designer

## 1. Steps
1. Check existing states with `list-entities alteredstate` (they already cover Entangled, Bleeding, Burning, Suppressed, Electrified, Corrupted, Poisoned, Blinded and more); reuse instead of duplicating.
2. **Name & trigger**: clear condition name and what applies it (on crit, hazardous terrain...).
3. **Effect**: exact mechanics (damage over time, movement or AP loss, visibility, WS penalty) AND how it ends (spend 1 AP, roll at end of activation, Medicae action, after N turning points).
4. Weapons and rules reference a state as `/status/:ID/`.
5. Draft in chat; stage `create-altered-state` after approval.

**Updates merge**: send `--id` plus the changed fields only.

## 2. Schema (`AlteredState`, global `status` collection, tag `@alteredstate[id]`)
`{ "id": n, "name": str, "effect": "rules-complete penalty and removal criteria" }`

## 3. Commands (single line)
`node scripts/campaign-session-tool.js create-altered-state --name="Chilled" --effect="Movement reduced by 2 inches and cannot Dash until the end of its next activation."`
`node scripts/campaign-session-tool.js update-altered-state --id=8 --effect="..."`
