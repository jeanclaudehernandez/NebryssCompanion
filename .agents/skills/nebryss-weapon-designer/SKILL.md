---
name: Nebryss Weapon Designer
description: Conceptualizes, balances, and formats new weapons for the Nebryss Killteam Campaign based on thematic descriptions or names. Invoke when user requests a new weapon (e.g., "Create a high-tech sniper rifle" or "Design a corrupted biological claw").
---

### Execution Steps

1. **Conceptualize:** Invent a creative name, lore-friendly stats, and select special rules that fit the user's theme.
2. **Balance:** Ensure the weapon scales appropriately (Price 0-150, Damage 2-7, Attacks 2-6).
3. **Format:** Output a single JSON object (or array) strictly matching the `Weapon` schema. Use ID `9999` or prompt the user for the next ID.

### Output Schema

```json
{
  "id": 9999,
  "name": "string",
  "price": "number (0-150)",
  "profiles": [
    {
      "profileName": "string (Empty for default, or 'Overcharge', 'Melee', etc.)",
      "rng": "number | null (inches, null for infinite, 0 for melee)",
      "attacks": "number (usually 3-5)",
      "ws": "number (Target to hit: 2, 3, 4, 5)",
      "damage": {
        "min": "number (2-4)",
        "max": "number (3-6)"
      },
      "specialRules": [
        {
          "ruleId": "number (From Reference Table)",
          "modValue": "number | null"
        }
      ],
      "body": "string ('human', 'astartes', 'universal', 'plant', 'construct', 'spirit', 'behemoth', 'daemon', 'spell')"
    }
  ]
}

```

### Reference: Weapon Rules

| ID | Rule Name | Effect / Mod Value Details |
| --- | --- | --- |
| 1 | Shockwave | Blast on crit `<x>"` |
| 2 | Agile | Resolve 1 die faster |
| 3 | Fixed Result | No rerolls |
| 4 | Mist-Accuracy | Ignore mist penalties |
| 5 | Drag | Pull enemy on crit `<x>"` |
| 6 | Burning | Apply Status 3 |
| 7 | Bleeding | Apply Status 2 |
| 8 | Electrify | Apply Status 6 |
| 10 | Supressing | Apply Status 4 if active has higher APL roll |
| 11 | Mist Dispersal | Clears mist 3" |
| 12 | Psychic Push | Move target 2" |
| 13 | Life Siphon | Heal on damage |
| 14 | Quick Assault | Charge bonus |
| 15 | Rending | Crit promotes normal hit |
| 16 | Balanced | Reroll 1 die |
| 17 | Stun | -1 AP to target |
| 18 | Ceaseless | Reroll 1s |
| 19 | Brutal | Parry only with crits |
| 20 | Punishing | Crit promotes failed to normal |
| 21 | Lethal `<x>+` | Crit on x+ instead of 6 |
| 22 | Shock | Discard enemy success on crit |
| 23 | Saturate | No cover saves |
| 24 | Relentless | Reroll any dice |
| 25 | Devastating `<x>` | x mortal wounds on crit |
| 26 | Heavy | Cannot move & shoot |
| 27 | Piercing Crits `<x>` | Piercing on crit |
| 28 | Silent | Shoot while concealed |
| 29 | Entangle | Apply Status 1 on crit |
| 30 | Blast `<x>"` | Area damage |
| 31 | Push `<x>"` | Push target on hit |
| 32 | Psychic | Requires 'spell' body |
| 33 | Break | Weapon might break after use |
| 34 | Piercing `<x>` | Reduce defense dice |
| 35 | Hot | User takes damage on bad roll |
| 36 | Plague Bite | Status 2, or 3 if bleeding |
| 37 | Noxious Cloud | AoE damage around target |
| 38 | Shadow Claws | Bonus success in mist/heavy terrain |
| 39 | Soulrender | Heal on crit |
| 40 | Mist Resonance | +1 Dmg in mist |
| 41 | Phase Shift | Mobility in mist |
| 42 | Vorpal Strike | Gain AP on kill |
| 43 | Mistcloak Sync | +1 Save in mist |
| 44 | Accurate `<x>` | Retain x normal hits automatically |
| 45 | Torrent `<x>` | Hit enemies within x" of target |
| 46 | Severe | Promote normal to crit if no crits rolled |
| 47 | Seek | Ignore cover |
| 48 | Seek Light | Ignore light cover |
| 49 | Assassinate | Charge from conceal |
| 50 | Witchhunt | Piercing vs Spells |
| 51 | Corrupt | Apply Status 7 on crit |
| 52 | Poisonous | Apply Status 9 on crit |
| 53 | Penetrating `<x>` | Worsen target save by x |
| 54 | Disorienting | Apply Status 8 on crit |
| 55 | Blinding | Apply Status 10 on crit |
| 56 | Mist-Infused | Apply Status 5 on crit |
| 57 | Executioner | +1 Dmg vs wounded targets |

---