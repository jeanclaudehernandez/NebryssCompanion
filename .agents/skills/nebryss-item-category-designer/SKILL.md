---
name: Nebryss Item Category Designer
description: Designs, configures, and structures dynamic Item Categories and table column mappings for the Nebryss Kill Team Campaign in the exact ItemCategory schema. Invoke when the user asks to create or configure an item category or table definition.
---

# Nebryss Item Category Designer

Item categories group the catalog and define the columns of the generic item tables (`itemCategory` collection). See existing ones with `list-entities itemcategory` — there is one per item `type` (armor, consumable, ammunition, mistEngine, shipHull, cannon, cannonball, deployable, modification, material, blueprint).

## 1. Steps
1. `name`: tab/menu label ("Mist Engines"); `key`: the `Item.type` it shows ("mistEngine").
2. `headers`: column titles; `keys`: the matching `Item` property for each header, same order and length (e.g. `["Name","Price","Max Speed"]` ↔ `["name","price","maxSpeed"]`). Use only properties that type's items have (see `nebryss-item-designer`).
3. Draft in chat for approval.

**Persistence**: there is no companion command for categories; they are saved through `PUT /api/itemCategory`, which replaces the whole document — always send `id`, `name`, `key`, `headers` and `keys` together.

## 2. Schema (`ItemCategory`)
`{ "id": n, "name": "Mist Engines", "key": "mistEngine", "headers": ["Name","Price","Optimal Conditions","Max Speed","Max Weight"], "keys": ["name","price","optimalConditions","maxSpeed","maxWeight"] }`
