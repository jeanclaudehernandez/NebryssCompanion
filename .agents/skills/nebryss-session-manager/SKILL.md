---
name: Nebryss Session Manager
description: **Description:** Conversational workflow for creating, drafting, planning, and concluding play sessions in the Nebryss narrative Kill Team campaign. Manages the `campaignSession` MongoDB collection, parses entity references by unique numeric ID (`@player[<id>]`, `@npc[<id>]`, `@location[<id>]`, `@shop[<id>]`, `@bestiary[<id>]`), reads previous session history, presents structured session ideas for user approval, drafts session content, debriefs play sessions with targeted questions, and updates session conclusions.
**Trigger:** User requests to create, plan, draft, or conclude/finalize a campaign session (e.g., "create a session", "plan our next session", "finalize the session", "conclude session 1", "record session results").
---

# Nebryss Session Manager

This skill governs the end-to-end conversation workflow for narrative play sessions in the Nebryss Kill Team campaign.

---

## 1. Data Model & Collection Schema

- **MongoDB Database:** `Nebryss-assets` (Main DB)
- **Collection Name:** `campaignSession`
- **Fallback JSON Assets:** `src/assets/campaignSessions.json` & `local-db/campaignSession.json`

### `CampaignSession` Model Interface

```typescript
export interface CampaignSession {
  id?: number;          // Unique document ID
  campaignId: number;   // ID of the parent campaign (e.g., 1 for "nebryss-voss-succession")
  sessionId: number;    // Sequential session number (1, 2, 3, ...)
  content: string;      // Planned session ideas, locations, fight encounters, NPCs, objectives, with @entity[<id>] tags
  conclussion: string;  // Detailed recollection of player actions, combat results, NPC outcomes, with @entity[<id>] tags
}
```

---

## 2. Mandatory Entity Reference Syntax (By Entity ID)

To ensure relational integrity and unambiguous parsing across campaigns and UI views, **all entity references in stored `content` and `conclussion` MUST use unique numeric entity IDs**:

| Entity Type | Database Tag Syntax | Example in MongoDB | Human Display Example |
| :--- | :--- | :--- | :--- |
| **Player** | `@player[<id>]` | `@player[1]` | `@player[1: Wendy]` |
| **NPC** | `@npc[<id>]` | `@npc[12]` | `@npc[12: Commander Elara Voss]` |
| **Location** | `@location[<id>]` | `@location[1]` | `@location[1: Zephyria]` |
| **Shop** | `@shop[<id>]` | `@shop[1]` | `@shop[1: Herbwhisper's Apothecary]` |
| **Bestiary** | `@bestiary[<id>]` | `@bestiary[25]` | `@bestiary[25: Mandrake Shadowstalker]` |

### Parsing & Regex
- **Pure ID Match:** `/@(player|npc|location|shop|bestiary)\[(\d+)\]/g`
- **General Tag Match:** `/@(player|npc|location|shop|bestiary)\[([^\]]+)\]/g`

> [!NOTE]
> During drafting and user review, drafts can display human-readable labels (e.g., `@player[1: Wendy]` or `@player[Wendy]`), but the system / script automatically normalizes them into pure ID tags (`@player[1]`) when writing to MongoDB.

---

## 3. Workflow: Creating a New Session

Triggered when the user asks to plan, draft, or create a session.

```mermaid
graph TD
    A[1. Connect to MongoDB] --> B[2. Read Previous Sessions & Active Entities]
    B --> C[3. Generate Session Ideas & Branching Paths]
    C --> D[4. Present Ideas to User for Review/Choice]
    D --> E{User Approved?}
    E -- Revisions / Feedback --> C
    E -- Approved --> F[5. Generate Complete Session Draft with @type[id] Tags]
    F --> G[6. Present Draft for Final Approval]
    G --> H{Approved by User?}
    H -- Adjustments --> F
    H -- Approved --> I[7. Save Entry to MongoDB campaignSession & JSON assets]
    I --> J[8. Confirm Session ID & Ready for Play]
```

### Detailed Execution Steps:
1. **Query Database Context:**
   Run the context utility or connect to MongoDB:
   ```bash
   node ./scripts/campaign-session-tool.js get-context [campaignId]
   ```
   Inspect:
   - All previous sessions (their `content` and `conclussion`) to maintain plot momentum and consequence continuity.
   - Active players (`id`, `name`, `race`, `origin`) from `${prefix}-player`.
   - Known NPCs (`id`, `name`, `faction`, `role`) from `${prefix}-npc`.
   - Outpost / Capital locations (`id`, `name`, `faction`) from `${prefix}-location`.
   - Local merchants (`id`, `name`, `locationName`) from `${prefix}-shop`.
   - Enemy stat cards (`id`, `name`, `faction`, `pr`) from `bestiary`.

2. **Formulate Narrative Trajectories:**
   Create 2-3 compelling session ideas tailored to the current party location and unresolved plot hooks:
   - **Locations:** Identify 1-2 `@location[<id>]` destinations.
   - **Combat Encounters:** Pick specific `@bestiary[<id>]` threats balanced for the party's current Power Rating.
   - **Social / Political Intrigue:** Involve relevant `@npc[<id>]` factions.
   - **Commercial / Supply:** Reference relevant `@shop[<id>]` for gear upgrades.
   - **Primary & Secondary Objectives:** Clearly defined stakes and branching moral/tactical choices.

3. **Present Ideas for User Approval:**
   Present the structured options to the user with resolved entity names and IDs. Await user feedback or choice.

4. **Draft the Session Entry:**
   Construct the full narrative session draft with standard sections:
   - **Title & Overview:** Thematic mission name and brief hook.
   - **Act I: The Briefing & Departure:** Setting the stage, NPC dialogues at `@location[<id>]`, supply stops at `@shop[<id>]`.
   - **Act II: The Journey & Encounters:** Environmental hazards, mist density, tactical battles against `@bestiary[<id>]`.
   - **Act III: The Climax & Branching Choices:** High-stakes confrontation and pivotal choices.
   - **Objectives & Rewards:** Clear win/loss conditions and potential salvage.
   *Ensure all entities are enclosed in `@type[<id>]` tags.*

5. **Final Approval & Database Insertion:**
   Present the draft to the user. Once approved, insert the record into MongoDB:
   ```bash
   node ./scripts/campaign-session-tool.js save --campaignId=<id> --sessionId=<num> --content="<approved content>"
   ```

---

## 4. Workflow: Finalizing a Session (Debrief & Conclusion)

Triggered when the user asks to conclude, finalize, or record the outcome of a session.

```mermaid
graph TD
    A[1. Connect to MongoDB] --> B[2. Fetch Latest Session Content]
    B --> C[3. Ask Targeted Debrief Questions to User]
    C --> D[4. User Answers Questions]
    D --> E[5. Synthesize Answers into Narrative Conclussion Draft with @type[id]]
    E --> F[6. Present Conclusion Draft to User for Approval]
    F --> G{Approved by User?}
    G -- Edits --> E
    G -- Approved --> H[7. Update MongoDB campaignSession Entry]
```

### Detailed Execution Steps:
1. **Fetch the Latest Session:**
   ```bash
   node ./scripts/campaign-session-tool.js get-latest [campaignId] --expand
   ```
   Read the planned `content`, the fight encounters, and the choices that were presented.

2. **Debrief Q&A with the User:**
   Ask 3-5 concise, specific questions based directly on what was planned:
   - *Exploration:* Which locations from `@location[<id>]` did `@player[<id>]` visit?
   - *Combat:* How did the combat encounters against `@bestiary[<id>]` resolve? (Victories, wounds, casualties, tactical retreats?)
   - *NPC Interactions:* What happened during dialogues with `@npc[<id>]`? (Alliances formed, secrets revealed, enemies made?)
   - *Decisions & Forks:* Which choices did the players make at the climax?
   - *Loot & Progression:* Did they purchase or salvage any items from `@shop[<id>]` or enemy remnants?

3. **Draft the Narrative Conclusion:**
   Transform the user's answers into a comprehensive `conclussion` summary with `@type[<id>]` syntax tagging.
   Structure:
   - **Summary of Actions & Travel:** Where the party went and their opening actions.
   - **Combat Aftermath:** Tactical recap of skirmishes and character performance.
   - **Decisions & Consequences:** The path chosen and its immediate impact on the game world.
   - **Current State:** Where the players are resting, remaining wounds/afflictions, and emerging plot hooks for the next session.

4. **Approval & Update Database:**
   Present the conclusion draft. Once approved by the user, update the database:
   ```bash
   node ./scripts/campaign-session-tool.js finalize --campaignId=<id> --sessionId=<num> --conclussion="<approved conclusion>"
   ```

---

## 5. Tooling & Helper Script Reference

The companion tool `scripts/campaign-session-tool.js` handles automatic conversion between names and IDs:

```bash
# Get full campaign context (sessions, players, NPCs, locations, shops, bestiary)
node ./scripts/campaign-session-tool.js get-context [campaignId]

# List all sessions (raw ID tags or human display with --expand)
node ./scripts/campaign-session-tool.js list [campaignId] --expand

# Get latest session
node ./scripts/campaign-session-tool.js get-latest [campaignId] --expand

# Save / Create a session (auto-converts names to IDs)
node ./scripts/campaign-session-tool.js save --campaignId=1 --sessionId=1 --content="..."

# Finalize a session with conclusion (auto-converts names to IDs)
node ./scripts/campaign-session-tool.js finalize --campaignId=1 --sessionId=1 --conclussion="..."

# Verify entity syntax and lookup IDs
node ./scripts/campaign-session-tool.js parse-tags "<text with @entity[...]>" [campaignId]
```
