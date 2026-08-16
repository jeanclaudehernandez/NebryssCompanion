---
name: Nebryss Shop Designer
description: Designs, balances, and configures merchant shops, black markets, arsenals, apothecaries, and price overrides for the Nebryss Kill Team Campaign in the exact Shop schema. Invoke when the user asks to create, edit, or manage shops and merchant inventories.
---

# Nebryss Shop Designer

This skill governs the creation, inventory setup, merchant pricing, and location binding of Shops within the Nebryss universe.

---

## 1. Execution Steps

1. **Establish Identity & Theme**: Define the shop's name, specialization (e.g. apothecary, gunsmith, mist-engine salvage, illicit contraband), and visual/narrative ambiance.
2. **Assign Shopkeeper / Owner**:
   - `owner` must store the numeric `id` of an existing `NPC` (e.g., `@npc[5]`).
   - If the merchant NPC doesn't exist yet, create the NPC first using the `nebryss-npc-designer` skill.
3. **Bind Location**:
   - `locationId`: Numeric `id` of the parent location in `locations.json` / `${prefix}-location`.
   - `locationName`: Name of the parent island/capital (e.g., `"Zephyria"` or `"Fortress Sanctus"`).
   - `location`: Specific sub-district, bazaar stall, or harbor bay (e.g., `"Zephyria's Sky Bazaar, Bay 4"`).
4. **Configure Inventory & Price Overrides**:
   - Add items (`type: 'item'`) referencing catalog item IDs from `items.json`.
   - Add weapons (`type: 'weapon'`) referencing weapon IDs from `weapons.json`.
   - Set shop-specific price overrides: The `price` in `ShopItem` overrides the default catalog price at this vendor without altering global baseline costs.
5. **Set Categories & Currency Rules**:
   - `categories`: Array of numeric `ItemCategory` IDs stocked (e.g., `[1, 2, 3]`).
   - `paymentMethod`: Configure whether the shop accepts digital mistrals, physical coinage, or both (`{ digital: boolean, physical: boolean }`).
6. **Format & Persist**: Output valid JSON matching the `Shop` schema and stage the shop creation in MongoDB via `campaign-session-tool.js`.
7. **Full Object Replacement on Updates (API Overwrite Rule)**: The API updates database records via full document overwrite (`replaceOne` matching the `id` field). When executing `update-shop`, retrieve the existing document first if needed (via `node scripts/campaign-session-tool.js get-entity shop <id> --campaignId=<campaignId>`), merge changes into the full document, and pass the **entire object with all fields** (`campaignId`, `id`, `name`, `owner`, `locationId`, `locationName`, `location`, `description`, `discovered`, `categories`, `items`, `paymentMethod`, `imgUrl`, `thumbnail`), NOT only the modified fields.

---

## 2. JSON Schema (`Shop`)

```json
{
  "id": 9999,
  "name": "string",
  "owner": 5,
  "locationId": 2,
  "locationName": "Zephyria",
  "location": "Zephyria's Sky Bazaar, Berth 12",
  "description": "string (A cluttered workshop smelling of ozone, lubricant, and mist-essence)",
  "discovered": true,
  "categories": [1, 2, 3, 9],
  "items": [
    {
      "id": 1,
      "price": 45,
      "type": "item"
    },
    {
      "id": 23,
      "price": 30,
      "type": "weapon"
    }
  ],
  "paymentMethod": {
    "digital": true,
    "physical": true
  },
  "imgUrl": "string (Optional asset URL)",
  "thumbnail": "string (Optional thumbnail URL)"
}
```

---

## 3. Database Scoping & Reference Tagging

- **Database Collection**: Shops are campaign-scoped entities stored in the `NebryssCampaignAssets` database inside `${prefix}-shop` (e.g. `nebryss-voss-succession-shop`).
- **Entity Reference Tag**: `@shop[<id>]` (e.g. `@shop[4]`) for raw database persistence.
- **Chat Display**: When presenting shop drafts in chat for user review, use clean text (e.g. `Herbwhisper's Apothecary`), never raw reference tags.

---

## 4. Companion Tool CLI Commands

Execute mutations via `campaign-session-tool.js` (staged for interactive user approval). Always generate and run commands as a **single line** (no bash `\` continuations):

```bash
# Create standard Shop
node scripts/campaign-session-tool.js create-shop --campaignId=1 --name="Aethelgard's Void Armory" --owner=4 --locationId=2 --locationName="Zephyria" --location="Upper Spires, Promenade 7" --description="Premier supplier of sanctioned Imperial sidearms and mist-hardened armor." --categories='[1,2,3,9]' --items='[{"id":1,"price":50,"type":"item"},{"id":2,"price":15,"type":"item"},{"id":8,"price":85,"type":"weapon"}]' --paymentMethod='{"digital":true,"physical":false}' --discovered=true

# Update existing Shop (Send the COMPLETE object with all fields)
node scripts/campaign-session-tool.js update-shop --campaignId=1 --id=3 --name="Aethelgard's Void Armory" --owner=4 --locationId=2 --locationName="Zephyria" --location="Upper Spires, Promenade 7" --description="Premier supplier of sanctioned Imperial sidearms and mist-hardened armor." --categories='[1,2,3,9]' --items='[{"id":1,"price":40,"type":"item"},{"id":2,"price":15,"type":"item"},{"id":8,"price":85,"type":"weapon"},{"id":23,"price":35,"type":"weapon"}]' --paymentMethod='{"digital":true,"physical":false}' --discovered=true
```

