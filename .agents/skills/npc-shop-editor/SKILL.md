---
name: Nebryss NPC & Shop Editor
description: Instructions and guidelines for creating, editing, and managing NPCs, Shops, NPC ownership, and shop price overrides in NebryssCompanion. Invoke when the user asks to create, edit, or manage NPCs, update shop inventories, or configure merchant pricing.
---

# NPC & Shop Editor Management

This skill documents how Non-Player Characters (NPCs) and Shops are defined, linked, and edited within NebryssCompanion.

## Data Models & JSON Schemas

### NPC Schema (`assets/npcs.json` & `/api/npc`)
NPCs are stored with the following properties:
- `id`: `number` (unique numeric ID)
- `name`: `string` (full name and title of the NPC)
- `faction`: `string` (e.g., `"Gilded Accord"`, `"Imperium of Man"`, `"Nebryssian Liberation Republic"`, `"Crimson Corsairs"`)
- `subgroup`: `string` (e.g., `"Apothecary"`, `"Armorsmith"`, `"Shipwright"`, `"Ordo Malleus"`)
- `role`: `string` (short description / title of the NPC's role e.g., `"Owner of Herbwhisper's Apothecary..."`)
- `personality`: `string` (optional personality traits)
- `mission`: `string` (optional goals/mission statement)
- `methods`: `string` (optional operational methods)
- `location`: `string` (primary location e.g., `"Zephyria's Sky Bazaar"`)
- `bestiaryId`: `number` (optional reference to a creature in bestiary.json)
- `reputation` / `backstory` / `description`: `string` (optional detailed lore)
- `wargear`: `Array<{ name: string; description: string }>` (signature equipment)

### Shop Schema (`assets/shops.json` & `/api/shop`)
Shops represent merchants and vendors in the game world:
- `id`: `number` (unique numeric ID)
- `name`: `string` (shop name)
- `owner`: `number` (**ID of the owning NPC**)
- `locationId`: `number` (ID of the parent location on the World Map)
- `locationName`: `string` (Name of the parent island/location e.g., `"Zephyria"`)
- `location`: `string` (Specific sub-location or district e.g., `"Zephyria's Sky Bazaar"`)
- `description`: `string` (shop overview and lore)
- `discovered`: `boolean` (visibility to players; default `true`)
- `imgUrl` / `thumbnail`: `string` (image asset links)
- `paymentMethod`: `{ digital: boolean; physical: boolean }`
- `items`: `Array<ShopItem>` where `ShopItem` is `{ id: number; price: number; type: 'item' | 'weapon' }`

## Relationships & Business Rules

1. **NPC Ownership**:
   - `shop.owner` stores the numeric `id` of an `NPC`.
   - When presenting shop owners in dropdowns, always display the NPC's `name` alongside a descriptive summary (`role`, `description`, or `faction - subgroup`) so admins can easily identify them.

2. **World Map Location Association**:
   - `shop.locationId` links to `location.id` in `locations.json`.
   - `shop.locationName` holds the macro location name (e.g. `"Zephyria"`), while `shop.location` specifies the micro location/district (e.g. `"Zephyria's Sky Bazaar"`).

3. **Shop Inventory & Price Overrides**:
   - Items can be standard items (`type: 'item'`) or weapons (`type: 'weapon'`).
   - Base prices are defined in `items.json` or `weapons.json`.
   - `ShopItem.price` represents the **shop-specific price override**. Changing this value changes the price at this merchant without affecting the base price in the global catalog.

## Admin Editors Architecture

- **NPC Editor Component**: `app-npc-admin-page` (`src/app/npc-admin-page/`)
- **Shop Editor Component**: `app-shop-admin-page` (`src/app/shop-admin-page/`)
- **Data Service**: `DataService` (`src/app/data.service.ts`) provides CRUD operations (`getNpcs()`, `createNpc()`, `updateNpc()`, `deleteNpc()`, `getShops()`, `createShop()`, `updateShop()`, `deleteShop()`).
- **REST Endpoints**:
  - `POST /api/npc`, `PUT /api/npc`, `DELETE /api/npc/:id`
  - `POST /api/shop`, `PUT /api/shop`, `DELETE /api/shop/:id`

## Extending or Modifying Editors

When adding new attributes to NPCs or Shops:
1. Update `NPC` or `Shop` interface in `src/app/model.ts`.
2. Add input elements in `NpcAdminPageComponent` or `ShopAdminPageComponent`.
3. Update `populateForm()` and `saveNpc()` / `saveShop()` in the respective component.
4. Verify backend serialization in `api/index.js`.
