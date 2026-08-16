---
name: Nebryss Weapon Designer
description: Conceptualizes, balances, and formats new weapons and firing profiles for the Nebryss Kill Team Campaign based on thematic descriptions or tactical roles. Invoke when the user asks to create or balance a weapon.
---

# Nebryss Weapon Designer

This skill governs the creation, balance, profile configuration, and special rule linking of Weapons within the Nebryss skirmish combat system.

---

## 1. Execution Steps

1. **Conceptualize Weapon**: Create an evocative name, determine whether it is Melee, Ranged, Heavy, or Spell, and design its firing/striking profiles (e.g. Standard, Overcharge, Burst, Melee).
2. **Balance Profiles**:
   - `rng`: Range in inches (`0` for Melee, `null` for Unlimited Ranged, or explicit range like `6`, `8`, `12`, `18`, `24`).
   - `attacks`: Attack dice pool (typically `3` to `5`).
   - `ws`: Weapon Skill / Ballistic Skill required roll (`2+`, `3+`, `4+`, `5+`).
   - `damage`: Base damage and critical damage (`{ "min": 3, "max": 5 }`).
   - `body`: Body compatibility tags (`"human"`, `"astartes"`, `"universal"`, `"plant"`, `"construct"`, `"spirit"`, `"behemoth"`, `"daemon"`, `"spell"`).
   - `price`: Cost in Mistrals (typically `0` to `250`).
3. **Assign Special Rules**: Select valid rule IDs from the Weapon Rules compendium table below.
4. **Format & Persist**: Output valid JSON matching the `Weapon` schema and stage the entity in MongoDB via `campaign-session-tool.js`.

---

## 2. JSON Schema (`Weapon`)

```json
{
  "id": 9999,
  "name": "string",
  "price": 45,
  "profiles": [
    {
      "profileName": "Standard",
      "rng": null,
      "attacks": 4,
      "ws": 3,
      "damage": {
        "min": 3,
        "max": 4
      },
      "specialRules": [
        {
          "ruleId": 21,
          "modValue": 5
        },
        {
          "ruleId": 18,
          "modValue": null
        }
      ],
      "body": "human",
      "type": "Ranged"
    }
  ]
}
```

---

## 3. Weapon Rules Reference Table

| ID | Rule Name | Description & Modifier Details |
|---|---|---|
| 1 | **Shockwave** | Blast on critical hit `<x>"` |
| 2 | **Agile** | Resolve 1 die faster in close combat |
| 3 | **Fixed Result** | Cannot re-roll attack dice |
| 4 | **Mist-Accuracy** | Ignore obscuration penalties from mist |
| 5 | **Drag** | Pull target toward operative on crit `<x>"` |
| 6 | **Burning** | Inflicts /status/:3/ (Burning) |
| 7 | **Bleeding** | Inflicts /status/:2/ (Bleeding) |
| 8 | **Electrify** | Inflicts /status/:6/ (Electrified) |
| 10 | **Suppressing** | Inflicts /status/:4/ (Suppressed) |
| 11 | **Mist Dispersal** | Clears mist in a 3″ radius around point of impact |
| 12 | **Psychic Push** | Push target 2″ directly away |
| 13 | **Life Siphon** | Heal wounds equal to damage dealt |
| 14 | **Quick Assault** | Gain charge bonus on activation |
| 15 | **Rending** | Retaining a critical hit promotes one normal hit to a critical hit |
| 16 | **Balanced** | Re-roll one attack die |
| 17 | **Stun** | Subtract 1 AP from target on critical hit |
| 18 | **Ceaseless** | Re-roll attack dice showing a result of 1 |
| 19 | **Brutal** | Opponent can only parry with critical successes |
| 20 | **Punishing** | Critical hit promotes one failed die to a normal hit |
| 21 | **Lethal `<x>+`** | Score critical hits on rolls of `<x>+` instead of only 6 |
| 22 | **Shock** | First critical hit cancels one of target's retained successes |
| 23 | **Saturate** | Target operative cannot retain cover saves |
| 24 | **Relentless** | Re-roll any or all attack dice |
| 25 | **Devastating `<x>`** | Inflicts `<x>` mortal wounds on a critical hit |
| 26 | **Heavy** | Operative cannot Move and Shoot in the same activation |
| 27 | **Piercing Crits `<x>`** | Target loses `<x>` defense dice on critical hit |
| 28 | **Silent** | Can perform shooting attacks while in Conceal order |
| 29 | **Entangle** | Inflicts /status/:1/ (Entangled) |
| 30 | **Blast `<x>"`** | Area of effect damage within `<x>"` of target |
| 31 | **Push `<x>"`** | Push target operative `<x>"` on hit |
| 32 | **Psychic** | Spell weapon requiring psychic discipline / spell body |
| 33 | **Break** | Fragile weapon with chance to break on critical failure |
| 34 | **Piercing `<x>`** | Target loses `<x>` defense dice against this attack |
| 35 | **Hot** | Operative suffers mortal wounds if any attack dice roll 1 |
| 36 | **Plague Bite** | Inflicts /status/:2/ (Bleeding), or /status/:3/ if already bleeding |
| 37 | **Noxious Cloud** | Area of effect toxic mist around target |
| 38 | **Shadow Claws** | Bonus attack success while in mist or heavy terrain |
| 39 | **Soulrender** | Heal operative on critical hit |
| 40 | **Mist Resonance** | +1 Damage while inside mist zones |
| 41 | **Phase Shift** | Teleport / mobility bonus through mist |
| 42 | **Vorpal Strike** | Gain 1 AP upon incapacitating an enemy operative |
| 43 | **Mistcloak Sync** | +1 Save bonus while inside mist zones |
| 44 | **Accurate `<x>`** | Automatically retain `<x>` normal hits before rolling |
| 45 | **Torrent `<x>"`** | Can target additional enemies within `<x>"` of primary target |
| 46 | **Severe** | If no crits are rolled, promote one normal hit to a crit |
| 47 | **Seek** | Ignore light and heavy cover |
| 48 | **Seek Light** | Ignore light cover |
| 49 | **Assassinate** | Can perform charge actions from Conceal order |
| 50 | **Witchhunt** | Piercing bonus against psychic/spell operatives |
| 51 | **Corrupt** | Inflicts /status/:7/ (Corrupted) on critical hit |
| 52 | **Poisonous** | Inflicts /status/:9/ (Poisoned) on critical hit |
| 53 | **Penetrating `<x>`** | Worsens target's Save characteristic by `<x>` |
| 54 | **Disorienting** | Inflicts /status/:8/ (Disoriented) on critical hit |
| 55 | **Blinding** | Inflicts /status/:10/ (Blinded) on critical hit |
| 56 | **Mist-Infused** | Inflicts /status/:5/ (Mist-Infused) on critical hit |
| 57 | **Executioner** | +1 Damage against injured / wounded targets |

---

## 4. Database Scoping & Reference Tagging

- **Database Collection**: Weapons are stored globally in the `Nebryss-assets` database inside the `weapon` collection.
- **Entity Reference Tag**: `@weapon[<id>]` (e.g. `@weapon[8]`) for raw database persistence.
- **Chat Display**: When presenting weapon drafts in chat for user review, use clean text (e.g. `Balefire Blade`), never raw reference tags.

---

## 5. Companion Tool CLI Commands

Execute mutations via `campaign-session-tool.js` (staged for interactive user approval):

```bash
# Search weapons
node scripts/campaign-session-tool.js list-weapons "Plasma"

# Create standard Weapon
node scripts/campaign-session-tool.js create-weapon \
  --name="Aetheric Harpoon Gun" \
  --price=55 \
  --profiles='[{"profileName":"Standard","rng":12,"attacks":4,"ws":3,"damage":{"min":4,"max":5},"specialRules":[{"ruleId":5,"modValue":3},{"ruleId":34,"modValue":1}],"body":"human","type":"Ranged"}]'

# Update existing Weapon
node scripts/campaign-session-tool.js update-weapon \
  --id=8 \
  --price=70
```