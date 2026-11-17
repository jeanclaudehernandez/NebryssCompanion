---
name: Nebryss Item Designer
description: Designs, balances, and formats game items (consumables, armor, ammunition, modifications, materials, blueprints, mist engines, ship hulls, cannons, cannonballs, and deployables) for the Nebryss Kill Team Campaign adhering to the 11 Item category schemas. Invoke when the user asks to create or balance an item.
---

# Nebryss Item Designer

## 1. Steps
1. **Pick `type`** (one of 11): `consumable`, `armor`, `ammunition`, `mistEngine`, `shipHull`, `cannon`, `cannonball`, `deployable`, `modification`, `material`, `blueprint`. Weapons are NOT items — use `nebryss-weapon-designer`.
2. **Price & rules**: price in mistrals; clear mechanical `description`. Reference weapon rules as `/weaponRule/:ID/` and altered states as `/status/:ID/`, with IDs looked up via `list-entities weaponrule` / `list-entities alteredstate`.
3. Add the type's extra fields (below), draft in chat with clean names, stage `create-item` after approval.

**Updates merge**: send `--id` plus changed fields; list fields (`statModifications`, `buildMaterials`) replace the stored list.

## 2. Fields by type (all: `id`, `name`, `type`, `price`, `description`; global `item` collection, tag `@item[id]`)
- `consumable` (potions, stimms, rations, filters): base fields only.
- `armor`: `raceReq` (body, e.g. "Human"), `isEquippable` true, `statModifications` `[{"stat":"Save","mod":1}]` (stats as in `nebryss-affliction-designer`).
- `ammunition`: `quantity`, `subtype` (weapon family, e.g. "Bolter").
- `mistEngine`: `optimalConditions`, `maxSpeed` ("32 Knots"), `maxWeight`.
- `shipHull`: `weight`, `shipWounds`, `defense`, `maxCargo`.
- `cannon`: `ammoType`, `weight`.
- `cannonball`: `damage` ("4D6 + 8").
- `deployable` (turrets, barricades, mines, beacons): base fields only.
- `modification` (scopes, stocks, barrels): `part`, `attachedTo` (weapon ID).
- `material` (monster parts, alloys, essences): `bestiaryId` it drops from.
- `blueprint`: `blueprintFor` (weapon ID), `buildMaterials` `[{"id": itemId, "amount": n}]`.

## 3. Commands (single line)
`node scripts/campaign-session-tool.js create-item --name="Aetheric Healing Balm" --type="consumable" --price=15 --description="Restores 1D3+2 lost Wounds and removes /status/:2/."`
`node scripts/campaign-session-tool.js create-item --name="Reinforced Carapace Rig" --type="armor" --price=65 --raceReq="Human" --isEquippable=true --statModifications='[{"stat":"Save","mod":1}]' --description="Ceramic plating that deflects shrapnel. Improves Save by 1."`
`node scripts/campaign-session-tool.js update-item --id=12 --price=22`
