---
name: Nebryss Altered State Designer
description: Designs and balances Altered States (temporary combat status conditions, elemental debuffs, and psychological effects) for the Nebryss Kill Team Campaign in the exact AlteredState schema. Invoke when the user asks to create, modify, or balance status effects.
---

# Nebryss Altered State Designer

This skill governs the creation, duration rules, and mechanical definitions of Altered States (status conditions) within the Nebryss combat engine.

---

## 1. Execution Steps

1. **Establish Name & Triggers**: Create a clear condition name (e.g., *Entangled*, *Bleeding*, *Burning*, *Mist-Infused*) and establish trigger conditions (e.g. on crit, on entering hazardous terrain).
2. **Define Rules & Duration**:
   - Specify the exact mechanical effect (damage over time, movement reduction, AP loss, or visibility penalty).
   - Specify clear removal / recovery conditions (e.g., spending 1 AP to extinguish, rolling at start of turn, taking medicae action).
3. **Format & Persist**: Output valid JSON matching the `AlteredState` schema and stage the entity creation in MongoDB via `campaign-session-tool.js`.
4. **Full Object Replacement on Updates (API Overwrite Rule)**: The API updates database records via full document overwrite (`replaceOne` matching the `id` field). When executing `update-altered-state`, retrieve the existing document first if needed (via `node scripts/campaign-session-tool.js get-entity alteredstate <id>`), merge changes into the full document, and pass the **entire object with all fields** (`id`, `name`, `effect`), NOT only the modified fields.

---

## 2. JSON Schema (`AlteredState`)

```json
{
  "id": 9999,
  "name": "string",
  "effect": "string (Rules-complete text describing ongoing penalty and removal criteria)"
}
```

---

## 3. Canonical Altered States Reference

When designing weapons, spells, or abilities, reference these core existing states via `/status/:ID/`:

| ID | Status Condition | Core Mechanical Effect & Removal |
|---|---|---|
| 1 | **Entangled** | Cannot perform Dash or Charge actions. Removed by spending 1 AP to break free. |
| 2 | **Bleeding** | Suffers 1 mortal wound at the end of each activation. Removed with Medicae action. |
| 3 | **Burning** | Suffers 2 mortal wounds at start of activation. Removed by spending 1 AP to extinguish flames. |
| 4 | **Suppressed** | -1 APL on next activation. Removed at end of operative's turn. |
| 5 | **Mist-Infused** | Attacks gain +1 Crit Damage, but operative suffers 1 wound if rolling a 1 on defense. |
| 6 | **Electrified** | Worsens Weapon Skill (WS) by 1 and cannot use reaction abilities for 1 Turning Point. |
| 7 | **Corrupted** | Loses 1 wound whenever psychic powers or mist abilities are activated nearby. |
| 8 | **Disoriented** | Maximum line of sight reduced to 6″ and cannot receive command rerolls. |
| 9 | **Poisoned** | Suffers 1 mortal wound per action performed during activation until treated. |
| 10 | **Blinded** | Cannot perform shooting actions; melee WS worsened by 2 for 1 Turning Point. |

---

## 4. Database Scoping & Reference Tagging

- **Database Collection**: Altered States are stored globally in the `Nebryss-assets` database inside the `status` collection.
- **Entity Reference Tag**: `@alteredstate[<id>]` (e.g. `@alteredstate[3]`) for raw database persistence.
- **Chat Display**: When presenting status drafts in chat for user review, use clean text (e.g. `Burning`), never raw reference tags.

---

## 5. Companion Tool CLI Commands

Execute mutations via `campaign-session-tool.js` (staged for interactive user approval). Always generate and run commands as a **single line** (no bash `\` continuations):

```bash
# Create standard Altered State
node scripts/campaign-session-tool.js create-altered-state --name="Chilled" --effect="Movement is reduced by 2″ and operative cannot perform Dash actions until the end of next activation."

# Update existing Altered State (Send the COMPLETE object with all fields)
node scripts/campaign-session-tool.js update-altered-state --id=8 --name="Disoriented" --effect="Maximum line of sight reduced to 6″ and operative cannot receive command rerolls until spending 1 AP to recover focus."
```

