---
name: Nebryss Letter Designer
description: Designs, formats, and manages in-game Letters (Imperial missives, encrypted intelligence, inquisitorial decrees, trade contracts, and letters of mark) for the Nebryss Kill Team Campaign in the exact Letter schema. Invoke when the user asks to create, edit, or manage in-game letters, missives, or notes.
---

# Nebryss Letter Designer

## 1. Steps
1. **Subject & sender**: `subject` (e.g. "Decree of Excommunication - Voss Warrant"); `senderId` = existing NPC ID or `null` for anonymous; `senderName` = sender's title and name.
2. **Body (`message`)**: immersive, lore-true text formatted with HTML (`<b>`, `<i>`, `<ul>`, `<li>`, `<div>`, `<br>`, `<p>`) for seals, parchment lines, redactions and log entries. The app displays `message`.
3. **Date & recipients**: `date` in Imperial format (`0.217.087.M42`); `recipientIds` = player IDs who can see it; `targetNames` = intended recipients as text; `readBy` = player IDs who opened it (usually `[]`); `isDeleted` false.
4. Draft in chat with clean names; stage `create-letter` after approval.

**Updates merge**: send `--campaignId`, `--id` plus changed fields; `recipientIds`, `targetNames`, `readBy` replace the stored lists.

## 2. Schema (`Letter`, campaign collection `${prefix}-letter`, tag `@letter[id]`)
`{ "id": n, "subject": str, "senderId": npcId|null, "senderName": str, "message": "html", "date": "0.457.015.M42", "recipientIds": [playerId], "targetNames": [str], "readBy": [playerId], "isDeleted": false }`

## 3. Commands (single line)
`node scripts/campaign-session-tool.js create-letter --campaignId=1 --subject="Warning from the Docks" --senderName="Old Salt Brand" --message="<div>Keep your crews away from the eastern reef. The Corsairs have mined the narrows.</div>" --date="0.112.088.M42" --recipientIds="2,3"`
`node scripts/campaign-session-tool.js update-letter --campaignId=1 --id=5 --subject="Voss Flagship Charter (Decrypted)" --readBy='[2]'`
