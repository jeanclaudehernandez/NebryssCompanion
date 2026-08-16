---
name: Nebryss Affliction Designer
description: Designs and balances Afflictions (enduring physical wounds, psychological traumas, mist corruptions, and curses) for the Nebryss Kill Team Campaign in the exact Affliction schema. Invoke when the user asks to create or balance an affliction, injury, or curse.
---

# Nebryss Affliction Designer

This skill governs the creation, balance, and stat modification structures of Afflictions within the Nebryss universe.

---

## 1. Execution Steps

1. **Conceptualize Affliction**: Create a lore-friendly name, immersive rules/narrative effect, and a plausible treatment method.
2. **Balance Severity & Recovery**:
   - `toHeal`: Set the number of successful treatments or rested periods required to cure (typically `1` to `6`).
   - `progress`: Initialized to `0`.
   - Effects should be punishing and distinct without making characters unplayable.
3. **Configure Stat Modifications**:
   - For direct mechanical penalties, use structured `statModifications` objects.
   - For purely narrative or situational rules, omit `statModifications` or keep it empty.
4. **Format & Persist**: Output valid JSON matching the `Affliction` schema and stage the affliction creation in MongoDB via `campaign-session-tool.js`.
5. **Full Object Replacement on Updates (API Overwrite Rule)**: The API updates database records via full document overwrite (`replaceOne` matching the `id` field). When executing `update-affliction`, retrieve the existing document first if needed (via `node scripts/campaign-session-tool.js get-entity affliction <id>`), merge changes into the full document, and pass the **entire object with all fields** (`id`, `name`, `effect`, `treatment`, `toHeal`, `progress`, `statModifications`), NOT only the modified fields.

---

## 2. JSON Schema (`Affliction`)

```json
{
  "id": "aff-9999",
  "name": "string",
  "effect": "string (Narrative & mechanical explanation of the debuff)",
  "treatment": "string (Specific medical, herbal, surgical, or ritual cure)",
  "toHeal": 3,
  "progress": 0,
  "statModifications": [
    {
      "stat": "Movement",
      "mod": -1
    },
    {
      "stat": "hit",
      "mod": -1,
      "applyToType": "range",
      "applyToValue": "0"
    }
  ]
}
```

---

## 3. Stat Modification Rules

- **Allowed `stat` keys**:
  - Direct attributes: `"Movement"`, `"Wounds"`, `"Save"`, `"APL"`
  - Combat / Weapon mods: `"hit"`, `"damage"`, `"attacks"`, `"crit"`
- **Targeting Modifiers (`applyToType` & `applyToValue`)**:
  - `applyToType: "range"`: Use `applyToValue: "0"` for melee weapons only, or `applyToValue: "-"` for ranged weapons only.
  - `applyToType: "type"`: Use `applyToValue` with weapon category (e.g. `"rifle"`, `"pistol"`, `"heavy"`).
  - `applyToType: "body"`: Use `applyToValue` with operative body type (e.g. `"human"`, `"astartes"`, `"daemon"`).

---

## 4. Database Scoping & Reference Tagging

- **Database Collection**: Afflictions are stored globally in the `Nebryss-assets` database inside the `affliction` collection.
- **Entity Reference Tag**: `@affliction[<id>]` (e.g. `@affliction[aff-1]`) for raw database persistence.
- **Chat Display**: When presenting affliction drafts in chat for user review, use clean text (e.g. `Mist Rot`), never raw reference tags.

---

## 5. Companion Tool CLI Commands

Execute mutations via `campaign-session-tool.js` (staged for interactive user approval). Always generate and run commands as a **single line** (no bash `\` continuations):

```bash
# Create standard Affliction
node scripts/campaign-session-tool.js create-affliction --name="Mist Lung" --effect="Breathing causes intense burning spasms. Operative loses 1″ Movement and suffers -1 to Save." --treatment="Inhale purified steam mixed with Silverleaf tincture (3 treatment cycles)." --toHeal=3 --progress=0 --statModifications='[{"stat":"Movement","mod":-1},{"stat":"Save","mod":-1}]'

# Update existing Affliction (Send the COMPLETE object with all fields)
node scripts/campaign-session-tool.js update-affliction --id="aff-2" --name="Mist Rot" --effect="Deep cellular necrosis caused by prolonged exposure to high-density mist. Operative loses 1″ Movement and suffers -1 to Save." --treatment="Surgical extraction of corrupted flesh at an Imperial medicae facility (4 treatment cycles)." --toHeal=4 --progress=1 --statModifications='[{"stat":"Movement","mod":-1},{"stat":"Save","mod":-1}]'
```

