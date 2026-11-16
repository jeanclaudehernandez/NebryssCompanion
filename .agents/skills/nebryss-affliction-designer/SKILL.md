---
name: Nebryss Affliction Designer
description: Designs and balances Afflictions (enduring physical wounds, psychological traumas, mist corruptions, and curses) for the Nebryss Kill Team Campaign in the exact Affliction schema. Invoke when the user asks to create or balance an affliction, injury, or curse.
---

# Nebryss Affliction Designer

## 1. Steps
1. **Concept**: lore-friendly name, narrative + mechanical `effect`, and a plausible `treatment` (medical, herbal, surgical, ritual).
2. **Severity**: `toHeal` = treatments/rests to cure (1–6); `progress` starts at 0. Punishing but never unplayable.
3. **`statModifications`** for direct penalties; omit/empty for purely narrative effects:
   - `stat`: `Movement`, `Wounds`, `Save`, `APL` (attributes) or `hit`, `damage`, `attacks`, `crit` (combat).
   - Optional targeting: `applyToType: "range"` with `applyToValue: "0"` (melee only) or `"-"` (ranged only); `"type"` with a weapon category (`rifle`, `pistol`, `heavy`...); `"body"` with a body tag (`human`, `astartes`, `daemon`...).
4. Draft in chat with clean names; stage `create-affliction` after approval. Players carry afflictions in `progression.afflictions`.

**Updates merge**: send `--id` plus changed fields; `statModifications` replaces the stored list.

## 2. Schema (`Affliction`, global `affliction` collection, tag `@affliction[id]`, ids like `aff-12`)
`{ "id": "aff-n", "name": str, "effect": str, "treatment": str, "toHeal": n, "progress": n, "statModifications": [{"stat": "Movement", "mod": -1}, {"stat": "hit", "mod": -1, "applyToType": "range", "applyToValue": "0"}] }`

## 3. Commands (single line)
`node scripts/campaign-session-tool.js create-affliction --name="Mist Lung" --effect="Breathing burns; -1 inch Movement and -1 Save." --treatment="Purified steam with Silverleaf tincture (3 cycles)." --toHeal=3 --progress=0 --statModifications='[{"stat":"Movement","mod":-1},{"stat":"Save","mod":-1}]'`
`node scripts/campaign-session-tool.js update-affliction --id="aff-2" --progress=1`
