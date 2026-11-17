---
name: Nebryss Shop Designer
description: Designs, balances, and configures merchant shops, black markets, arsenals, apothecaries, and price overrides for the Nebryss Kill Team Campaign in the exact Shop schema. Invoke when the user asks to create, edit, or manage shops and merchant inventories.
---

# Nebryss Shop Designer

## 1. Steps
1. **Identity**: name, specialization (apothecary, gunsmith, mist-engine salvage, contraband...) and ambiance in `description`.
2. **`owner`**: numeric ID of an existing NPC. No NPC yet → create it first with `nebryss-npc-designer`.
3. **Location**: `locationId` = existing location ID, `locationName` = that location's name (e.g. `Zephyria`), `location` = the exact spot (bazaar stall, harbor bay).
4. **Stock** `items`: `{"id", "price", "type"}` where `type: "item"` uses an ID from the items table and `type: "weapon"` an ID from the weapons table (look them up; never invent). `price` overrides the catalog price at this shop only.
5. **`categories`**: item-category IDs stocked (`list-entities itemcategory`). **`paymentMethod`**: `{ "digital": bool, "physical": bool }`.
6. Draft in chat with clean names; stage `create-shop` after approval.

**Updates merge**: send `--campaignId`, `--id` plus changed fields. `items` and `categories` replace the stored lists: `get-entity shop <id>` first and send the full list.

## 2. Schema (`Shop`, campaign collection `${prefix}-shop`, tag `@shop[id]`)
`{ "id": n, "name": str, "owner": npcId, "locationId": n, "locationName": str, "location": str, "description": str, "discovered": bool, "categories": [n], "items": [{"id": n, "price": n, "type": "item"|"weapon"}], "paymentMethod": {"digital": bool, "physical": bool}, "imgUrl": str, "thumbnail": str }`

## 3. Commands (single line)
`node scripts/campaign-session-tool.js create-shop --campaignId=1 --name="Aethelgard's Void Armory" --owner=4 --locationId=2 --locationName="Zephyria" --location="Upper Spires, Promenade 7" --description="Sanctioned Imperial sidearms and mist-hardened armor." --categories='[1,2,3,9]' --items='[{"id":1,"price":50,"type":"item"},{"id":8,"price":85,"type":"weapon"}]' --paymentMethod='{"digital":true,"physical":false}' --discovered=true`
`node scripts/campaign-session-tool.js update-shop --campaignId=1 --id=3 --paymentMethod='{"digital":true,"physical":true}'`
