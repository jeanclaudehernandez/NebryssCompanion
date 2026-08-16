---
name: Nebryss Letter Designer
description: Designs, formats, and manages in-game Letters (Imperial missives, encrypted intelligence, inquisitorial decrees, trade contracts, and letters of mark) for the Nebryss Kill Team Campaign in the exact Letter schema. Invoke when the user asks to create, edit, or manage in-game letters, missives, or notes.
---

# Nebryss Letter Designer

This skill governs the creation, narrative tone, recipient tracking, and formatting of in-game Letters and missives within the Nebryss universe.

---

## 1. Execution Steps

1. **Establish Subject & Sender**:
   - `subject`: Descriptive title or header for the letter (e.g., *"Decree of Excommunication - Voss Warrant"*).
   - `senderId`: Numeric ID of an NPC sender in `npcs.json` / `${prefix}-npc`, or `null` for anonymous / automated / unknown senders.
   - `senderName`: String title and name of the sender (e.g., *"Inquisitor Vontis Mortis of the Ordo Hereticus"*).
2. **Draft Message Content**:
   - Write rich, immersive narrative text adhering to Nebryss world lore.
   - Use HTML formatting tags (`<b>`, `<i>`, `<ul>`, `<li>`, `<div>`, `<br>`) to represent official letter seals, parchment lines, classified redactions, and log entries.
3. **Set Imperial Date & Target Recipients**:
   - `date`: Standard Imperial date format (e.g., `"0.217.087.M42"`).
   - `recipientIds`: Array of player character numeric IDs eligible to receive or view the letter (e.g., `[1, 2, 3]`).
   - `targetNames`: Array of intended recipient names or descriptions (e.g., `["Wendy", "Claimants of House Voss"]`).
   - `readBy`: Array of player IDs who have opened and read the letter (typically initialized to empty `[]` or `[1]`).
   - `isDeleted`: Soft deletion flag (`false` by default).
4. **Format & Persist**: Output valid JSON matching the `Letter` schema and stage the entity in MongoDB via `campaign-session-tool.js`.

---

## 2. JSON Schema (`Letter`)

```json
{
  "id": 9999,
  "subject": "Intercepted Courier Log: Mist-Spire Route Beta",
  "senderId": 3,
  "senderName": "Master Navigator Seneschal Darius Mountain",
  "message": "<div><b>CLASSIFIED / ACCORD CLEARANCE ONLY</b></div><br><p>The mist-conduits north of <i>Griefwater Cay</i> are fluctuating violently. Three cargo skiffs failed to check in at beacon four.</p><ul><li>Vessel 1: Presumed adrift in dense mist</li><li>Vessel 2: Hull breach detected</li><li>Vessel 3: Cargo intact, rerouted to Zephyria</li></ul>",
  "date": "0.457.015.M42",
  "readBy": [
    1
  ],
  "recipientIds": [
    1,
    2,
    3
  ],
  "targetNames": [
    "Wendy",
    "House Voss Claimants"
  ],
  "isDeleted": false
}
```

---

## 3. Database Scoping & Reference Tagging

- **Database Collection**: Letters are campaign-scoped entities stored in the `NebryssCampaignAssets` database inside `${prefix}-letter` (e.g. `nebryss-voss-succession-letter`).
- **Entity Reference Tag**: `@letter[<id>]` (e.g. `@letter[6]`) for raw database persistence.
- **Chat Display**: When presenting letter drafts in chat for user review, use clean text (e.g. `Letter: Seraphine Voss declared a heretic`), never raw reference tags.

---

## 4. Companion Tool CLI Commands

Execute mutations via `campaign-session-tool.js` (staged for interactive user approval):

```bash
# Create standard Letter
node scripts/campaign-session-tool.js create-letter \
  --campaignId=1 \
  --subject="Warning from the Docks" \
  --senderName="Old Salt Brand" \
  --content="<div>Keep your crews away from the eastern reef. The Corsairs have mined the narrows.</div>" \
  --date="0.112.088.M42" \
  --recipientIds="1,2"

# Update existing Letter
node scripts/campaign-session-tool.js update-letter \
  --campaignId=1 \
  --id=5 \
  --subject="Voss Flagship Charter (Decrypted)"
```
