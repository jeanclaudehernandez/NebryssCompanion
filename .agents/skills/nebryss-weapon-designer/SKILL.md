---
name: Nebryss Weapon Designer
description: Conceptualizes, balances, and formats new weapons and firing profiles for the Nebryss Kill Team Campaign based on thematic descriptions or tactical roles. Invoke when the user asks to create or balance a weapon.
---

# Nebryss Weapon Designer

## 1. Steps
1. **Concept**: evocative name; Melee, Ranged, Heavy or Spell; one or more profiles (e.g. Standard, Overcharge, Burst).
2. **Balance each profile**:
   - `rng`: `0` melee, `null` unlimited range, else inches (`6`, `8`, `10`, `12`, `18`, `24`).
   - `attacks` 3–5 · `ws` hit roll as a number (`3` = 3+, range 2–5) · `damage` `{ "min": normal, "max": critical }`.
   - `body`: one body tag the wielder needs (`human`, `astartes`, `universal`, `spell`, `construct`, `daemon`, `behemoth`, `plant`, `spirit`...; reuse values already in the weapons table).
   - `type`: lowercase category (`pistol`, `rifle`, `plasma rifle`, `one-handed sword`, `claws`, `flamer`, `launcher`, `warp`...) — afflictions and talents target it.
   - `specialRules`: `[{ "ruleId": N, "modValue": <x> or null }]`.
3. **Special rules**: look up existing rules and their exact effects with `list-entities weaponrule` / `get-entity weaponrule <id>` — never from memory. `modValue` fills the rule's `<x>`. Missing rule → design it with `nebryss-weapon-rule-designer` first.
4. `price` in mistrals (0–250).
5. Draft in chat with clean names and each rule's name + effect; stage `create-weapon` after approval.

**Updates merge**: send `--id` plus changed fields. `profiles` is replaced as a whole list: `get-entity weapon <id>` first and send every profile.

## 2. Schema (`Weapon`, global `weapon` collection, tag `@weapon[id]`)
`{ "id": n, "name": str, "price": n, "profiles": [ { "profileName": str, "rng": n|null, "attacks": n, "ws": n, "damage": {"min": n, "max": n}, "specialRules": [{"ruleId": n, "modValue": n|null}], "body": str, "type": str } ] }`

## 3. Commands (single line)
`node scripts/campaign-session-tool.js list-weapons "Plasma"`
`node scripts/campaign-session-tool.js create-weapon --name="Aetheric Harpoon Gun" --price=55 --profiles='[{"profileName":"Standard","rng":12,"attacks":4,"ws":3,"damage":{"min":4,"max":5},"specialRules":[{"ruleId":5,"modValue":3},{"ruleId":34,"modValue":1}],"body":"human","type":"harpoon gun"}]'`
`node scripts/campaign-session-tool.js update-weapon --id=8 --price=70`
