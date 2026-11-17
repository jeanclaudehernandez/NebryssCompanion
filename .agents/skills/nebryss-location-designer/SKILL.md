---
name: Nebryss Location Designer
description: Designs, maps, and formats world map locations, capital fortresses, island settlements, trading outposts, tactical RPG battle layouts, and hidden secrets for the Nebryss Kill Team Campaign in the exact Location schema. Invoke when the user asks to create, edit, or map a location.
---

# Nebryss Location Designer

## 1. Steps
1. **Identity**: `name`; `faction` as text ("The Imperium of Man", "The Gilded Accord", "The Abyssal Cabal", "Nebryssian Liberation Republic", "The Crimson Corsairs", "Neutral / Unaligned", "Forces of Nature"); `category` (fortress, trading post, city, island, ruins, reef, sanctuary, shipwreck, dock); `categorySize` 1–5; `isCapital` true only for a faction's seat of power.
2. **World map**: `mapX`, `mapY` = percentage position 0–100; `discovered` = visible to players. Check existing locations' coordinates (`list-entities location`) to avoid overlaps.
3. **Secrets (GM only)**: `secrets` = `[{ id: "sec-loc-n", title, content, isRevealed: false }]` for hidden hooks; `isSecret` / `isSecretRevealed` hide the location itself; `privateNotes` for GM notes. Never reveal unrevealed secrets to players.
4. **`rpgMapLayout`**: battle map text, one block per sector — `SECTOR n: NAME (DIRECTION)` + terrain, cover, elevation — then `VISUAL PROMPT NOTES:` for map art.
5. **Features**: `notableFeatures` `[{name, description, owner}]`; small embedded merchants in `shops` `[{name, description, owner}]` (full shops with stock use `nebryss-shop-designer`).
6. Draft in chat with clean names; stage `create-location` after approval.

**Updates merge**: send `--campaignId`, `--id` plus changed fields; `secrets`, `notableFeatures`, `shops` replace the stored lists.

## 2. Schema (`Location`, campaign collection `${prefix}-location`, tag `@location[id]`)
`{ "id": n, "name": str, "description": str, "faction": str, "category": str, "categorySize": n, "isCapital": bool, "isWorldMap": bool, "mapX": n, "mapY": n, "discovered": bool, "isSecret": bool, "isSecretRevealed": bool, "secrets": [...], "rpgMapLayout": str, "privateNotes": str, "imgUrl": str, "thumbnail": str, "notableFeatures": [...], "shops": [...] }`

## 3. Commands (single line)
`node scripts/campaign-session-tool.js create-location --campaignId=1 --name="Whispering Atoll" --faction="Forces of Nature" --description="A ring of coral reefs and half-submerged spires in permanent dense mist." --category="reef" --categorySize=3 --isCapital=false --mapX=32.5 --mapY=74.1 --discovered=true --rpgMapLayout="SECTOR 1: REEF ENTRANCE (SOUTH)\nRazor-sharp reef barriers.\n\nSECTOR 2: CENTRAL LAGOON (CENTER)\nOpen water with floating debris."`
`node scripts/campaign-session-tool.js update-location --campaignId=1 --id=3 --mapX=83.01 --mapY=53.9`
