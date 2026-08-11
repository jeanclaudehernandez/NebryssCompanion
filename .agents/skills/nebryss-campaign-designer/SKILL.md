---
name: Nebryss Campaign Designer
description: Manages and designs tabletop skirmish game campaigns adhering strictly to the Nebryss campaign JSON structure. Invoke when user requests campaign management (e.g., "Create a new campaign," "Design a campaign for Voss Succession").
---

### Execution Steps

1. **Assign ID & Name:** Generate a unique numeric ID and slug name for the campaign (e.g., `"nebryss-voss-succession"`).
2. **Collection Binding:** Set `playersCollectionName` to specify the player collection name (e.g., `"player"`, `"player-voss"`).
3. **Format:** Output the campaign object matching the `Campaign` schema.

### Campaign JSON Schema

```json
{
  "id": 1,
  "name": "nebryss-voss-succession",
  "playersCollectionName": "player"
}
```

### API Endpoints

- **GET `/api/campaign`**: Retrieve all active campaigns.
- **POST `/api/campaign`**: Create a new campaign.
- **PUT `/api/campaign`**: Update an existing campaign.
- **DELETE `/api/campaign/:id`**: Soft delete a campaign by ID.
