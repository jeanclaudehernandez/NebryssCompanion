---
name: Nebryss Campaign Designer
description: Manages and designs tabletop skirmish game campaigns adhering strictly to the Nebryss campaign JSON structure. Invoke when user requests campaign management (e.g., "Create a new campaign," "Design a campaign for Voss Succession").
---

### Execution Steps

1. **Assign ID & Name:** Generate a unique numeric ID and slug name for the campaign (e.g., `"nebryss-voss-succession"`).
2. **Collection Binding:** Set `playersCollectionName` to specify the player collection name (e.g., `"player"`, `"player-voss"`).
3. **Format:** Output the campaign object matching the `Campaign` schema.
4. **Full Object Replacement on Updates (API Overwrite Rule):** The API updates campaigns via full document overwrite (`replaceOne` matching the `id` field). When updating a campaign (`PUT /api/campaign`), always provide the **complete campaign object with all fields** (`id`, `name`, `playersCollectionName`, `prefix`), NOT only the modified fields.

### Campaign JSON Schema

```json
{
  "id": 1,
  "name": "nebryss-voss-succession",
  "prefix": "nebryss-voss-succession",
  "playersCollectionName": "player"
}
```

### API Endpoints

- **GET `/api/campaign`**: Retrieve all active campaigns.
- **POST `/api/campaign`**: Create a new campaign.
- **PUT `/api/campaign`**: Update an existing campaign. **Must send the complete campaign object with all fields.**
- **DELETE `/api/campaign/:id`**: Soft delete a campaign by ID.

