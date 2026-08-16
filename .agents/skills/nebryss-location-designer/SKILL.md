---
name: Nebryss Location Designer
description: Designs, maps, and formats world map locations, capital fortresses, island settlements, trading outposts, tactical RPG battle layouts, and hidden secrets for the Nebryss Kill Team Campaign in the exact Location schema. Invoke when the user asks to create, edit, or map a location.
---

# Nebryss Location Designer

This skill governs the creation, faction control, interactive world map coordinates, GM secret blocks, notable features, and tactical battle map layouts of Locations within the Nebryss archipelago.

---

## 1. Execution Steps

1. **Establish Location Identity & Faction**:
   - `name`: Island, settlement, fortress, or reef name (e.g., *"Zephyria"*, *"Fortress Sanctus"*, *"Brinewake Isle"*).
   - `faction`: Controlling faction or territory power (e.g. `"The Imperium of Man"`, `"The Gilded Accord"`, `"The Abyssal Cabal"`, `"Nebryssian Liberation Republic"`, `"The Crimson Corsairs"`, `"Neutral / Unaligned"`, `"Forces of Nature"`).
   - `category`: Location archetype (`"fortress"`, `"trading post"`, `"city"`, `"island"`, `"ruins"`, `"reef"`, `"sanctuary"`, `"shipwreck"`, `"dock"`).
   - `categorySize`: Scale indicator (`1` to `5`, or `"Small"`, `"Major"`, `"Capital"`).
   - `isCapital`: Set to `true` if this location is the primary seat of power for its faction.
2. **Configure World Map Positioning**:
   - `mapX`: Horizontal percentage coordinate (`0.0` to `100.0`) on the interactive World Map.
   - `mapY`: Vertical percentage coordinate (`0.0` to `100.0`) on the interactive World Map.
   - `discovered`: Whether the location is visible to players on the map.
3. **Design Secrets & GM Notes**:
   - `secrets`: Array of `SecretBlock` items (`{ id, title, content, isRevealed }`) containing hidden plot hooks, clandestine tunnels, or faction conspiracies.
   - `isSecret` / `isSecretRevealed`: Flags controlling whether the location itself is hidden from player view until discovered.
   - `privateNotes`: Freeform confidential GM notes.
4. **Draft Tactical RPG Layout (`rpgMapLayout`)**:
   - Provide sector-by-sector tactical descriptions (e.g., *SECTOR 1: Harbor Gates*, *SECTOR 2: Barracks*, *SECTOR 3: Cathedral*) with terrain features, cover, elevations, and visual prompt notes for tabletop battlemasters.
5. **Add Features & Embedded Shops**:
   - `notableFeatures`: Array of landmark points (`{ name, description, owner }`).
   - `shops`: Array of embedded merchants (`{ name, description, owner, imgUrl, thumbnail }`).
6. **Format & Persist**: Output valid JSON matching the `Location` schema and stage in MongoDB via `campaign-session-tool.js`.
7. **Full Object Replacement on Updates (API Overwrite Rule)**: The API updates database records via full document overwrite (`replaceOne` matching the `id` field). When executing `update-location`, retrieve the existing document first if needed (via `node scripts/campaign-session-tool.js get-entity location <id> --campaignId=<campaignId>`), merge changes into the full document, and pass the **entire object with all fields** (`campaignId`, `id`, `name`, `faction`, `description`, `category`, `categorySize`, `isCapital`, `isWorldMap`, `mapX`, `mapY`, `discovered`, `isSecret`, `isSecretRevealed`, `secrets`, `rpgMapLayout`, `privateNotes`, `imgUrl`, `thumbnail`, `notableFeatures`, `shops`), NOT only the modified fields.

---

## 2. JSON Schema (`Location`)

```json
{
  "id": 9999,
  "name": "string",
  "description": "string (Immersive overview of the island geography, atmosphere, and infrastructure)",
  "faction": "The Gilded Accord",
  "category": "trading post",
  "categorySize": 3,
  "isCapital": false,
  "isWorldMap": false,
  "mapX": 54.2,
  "mapY": 38.6,
  "discovered": true,
  "isSecret": false,
  "isSecretRevealed": false,
  "secrets": [
    {
      "id": "sec-loc-1",
      "title": "Smuggler's Sea Cave",
      "content": "A hidden cavern beneath the south cliffs houses two Corsair skiffs and stolen ammunition crates.",
      "isRevealed": false
    }
  ],
  "rpgMapLayout": "SECTOR 1: HARBOR DOCKS (SOUTH)\nWooden piers lined with cargo cranes, mist lanterns, and light barricades providing light cover.\n\nSECTOR 2: CENTRAL MARKET SQUARE (CENTER)\nOpen cobblestone plaza with vendor stalls, vantage points on rooftop walkways, and heavy stone pillars.\n\nSECTOR 3: WAREHOUSE VAULTS (NORTH)\nEnclosed corrugated iron warehouses with heavy blast doors and elevated catwalks.\n\nVISUAL PROMPT NOTES:\nIsometric battle map of a mist-shrouded trading port with wooden boardwalks, steam vents, and merchant stalls.",
  "privateNotes": "GM Only: Inquisitorial agents are observing the warehouse from the upper clocktower.",
  "imgUrl": "https://example.com/location.jpg",
  "thumbnail": "https://example.com/location_thumb.jpg",
  "notableFeatures": [
    {
      "name": "The Grand Crane Array",
      "description": "Massive steam-powered cranes capable of hauling entire gunboats out of the water.",
      "owner": "Guildmaster Thorne"
    }
  ],
  "shops": [
    {
      "name": "Thorne's Shipwrights",
      "description": "Repairs mist engines and sells hull modifications.",
      "owner": "Guildmaster Thorne"
    }
  ]
}
```

---

## 3. Database Scoping & Reference Tagging

- **Database Collection**: Locations are campaign-scoped entities stored in the `NebryssCampaignAssets` database inside `${prefix}-location` (e.g. `nebryss-voss-succession-location`).
- **Entity Reference Tag**: `@location[<id>]` (e.g. `@location[3]`) for raw database persistence.
- **Chat Display**: When presenting location drafts in chat for user review, use clean text (e.g. `Fortress Sanctus`), never raw reference tags.

---

## 4. Companion Tool CLI Commands

Execute mutations via `campaign-session-tool.js` (staged for interactive user approval). Always generate and run commands as a **single line** (no bash `\` continuations):

```bash
# Create standard Location
node scripts/campaign-session-tool.js create-location --campaignId=1 --name="Whispering Atoll" --faction="Forces of Nature" --description="A ring of sharp coral reefs and half-submerged spires shrouded in permanent dense mist." --category="reef" --categorySize=3 --isCapital=false --mapX=32.5 --mapY=74.1 --discovered=true

# Update existing Location (Send the COMPLETE object with all fields)
node scripts/campaign-session-tool.js update-location --campaignId=1 --id=3 --name="Whispering Atoll" --faction="Forces of Nature" --description="A ring of sharp coral reefs and half-submerged spires shrouded in permanent dense mist." --category="reef" --categorySize=3 --isCapital=false --isWorldMap=false --mapX=83.01 --mapY=53.9 --discovered=true --isSecret=false --isSecretRevealed=false --secrets='[{"id":"sec-loc-1","title":"Smuggler Sea Cave","content":"Hidden cove with Corsair supplies","isRevealed":false}]' --rpgMapLayout="SECTOR 1: REEF ENTRANCE (SOUTH)\nRazor-sharp reef barriers.\n\nSECTOR 2: CENTRAL LAGOON (CENTER)\nOpen water with floating debris.\n\nSECTOR 3: ANCIENT SPIRE (NORTH)\nSubmerged obsidian tower."
```

