---
name: Nebryss Session Manager
description: Conversational workflow for creating, drafting, planning, and concluding play sessions in the Nebryss narrative Kill Team campaign. Manages the campaignSession MongoDB collection, parses entity references by unique numeric ID (@player[<id>], @npc[<id>], @location[<id>], @shop[<id>], @bestiary[<id>]), reads previous session history, creates new NPC entries, creates Bestiary stat cards for combatant/hostile NPCs (strictly using existing weapons from the weapons compendium and calculating exact PR), presents structured session ideas for user approval, drafts session content displaying clean readable entity names in chat reviews while ensuring saved database entries contain exact numeric reference tags (@entity[<id>]), debriefs play sessions with targeted questions, and updates session conclusions. Invoke when user requests to create, plan, draft, or conclude/finalize a campaign session.
---

# Nebryss Session Manager

This skill governs the end-to-end conversation workflow for narrative play sessions in the Nebryss Kill Team campaign.

---

## 1. Data Model & Collection Schemas

- **MongoDB Database:** `Nebryss-assets` (Main DB) & `NebryssCampaignAssets` (Player & Campaign DB)
- **Primary Collections:**
  - `campaignSession`: Play session content and conclusions
  - `npc` / `${prefix}-npc`: Non-player characters and story contacts
  - `bestiary`: Combat enemy stat cards and creature stat blocks
  - `weapon`: Weapons compendium (**all Bestiary entries must strictly use existing weapons from this collection**)
  - `weaponRule`: Special weapon rules and PR modifiers

### Model Interfaces

```typescript
export interface CampaignSession {
  id?: number;          // Unique document ID
  campaignId: number;   // ID of the parent campaign (e.g., 1 for "nebryss-voss-succession", 2 for "DevTest")
  sessionId: number;    // Sequential session number (1, 2, 3, ...)
  content: string;      // Planned session ideas, locations, fight encounters, NPCs, objectives, with @entity[<id>] tags
  conclussion: string;  // Detailed recollection of player actions, combat results, NPC outcomes, with @entity[<id>] tags
  playerVisibleBranches?: string[]; // Branches revealed to players (e.g. ["Branch A: Total Scorched Earth"])
}

export interface NPC {
  id: number;
  name: string;
  faction: string;
  subgroup: string;
  mission?: string;
  methods?: string;
  personality?: string;
  location?: string;
  bestiaryId?: number;  // Links directly to Bestiary entry ID if NPC is combatant/hostile
  role?: string;
  reputation?: string;
  backstory?: string;
  description?: string;
  fleetSize?: string;
  flagship?: string;
  tactics?: string;
  motivations?: string;
  discovered?: boolean;
  wargear?: Array<{ name: string; description: string }>;
}

export interface BestiaryEntry {
  id: number;
  name: string;
  faction: string;
  subgroup: string;
  pr: number;           // Power Rating calculated from stats, weapons, and abilities
  isDiscovered?: boolean;
  discoveredCampaignIds?: number[];
  attributes: {
    Movement: number;
    Wounds: number;
    Save: number;       // Lower is better (e.g. 3+ is Save: 3)
    APL: number;        // Action Point Limit (2 standard, 3 elite, 4 boss)
    body: string[];     // ["human", "universal", "astartes", "daemon", "fellgor", etc.]
  };
  weapons: number[];    // MUST ONLY contain existing weapon IDs from the weapons database!
  abilities: Array<{
    name: string;
    effect: string;
    prModifier?: number | null;
  }>;
  deployables?: Array<{ id: number; quant: number }>;
}
```

---

## 2. Presentation vs Persistence: Clean Names in Chat & Numeric ID Tags in DB

To ensure both an immersive, human-readable reading experience during review and strict relational integrity in application state, follow this strict separation:

### A. Presentation Layer (Chat / Approval View)
- **DO NOT display raw reference tags or bracketed IDs in chat** (e.g. avoid `@player[1]`, `@location[3]`, `@npc[1]`, `@bestiary[4]`, or `@player[1: Wendy]`).
- **Display natural, clean entity names directly in the narrative prose** (e.g. "Wendy", "Fortress Sanctus", "Inquisitor Veyra Mortis", "Maledictum Prime", "Aetherwing").
- This ensures the GM/user can read, review, and evaluate the story, briefings, and encounters naturally without syntax clutter.

### B. Persistence Layer (MongoDB & Local Storage)
- **All saved text in `campaignSession.content` and `campaignSession.conclussion` MUST use exact numeric ID tags**:
  - `@player[<id>]` (e.g., `@player[1]`)
  - `@npc[<id>]` (e.g., `@npc[12]`)
  - `@location[<id>]` (e.g., `@location[3]`)
  - `@shop[<id>]` (e.g., `@shop[1]`)
  - `@bestiary[<id>]` (e.g., `@bestiary[25]`)
- Before saving to the database, map the entity names in the approved draft back to their exact `@type[<id>]` tags. The companion script (`campaign-session-tool.js`) or automated replacement automatically converts recognized names into pure ID tags.

| Entity Type | Chat Presentation Example (Clean) | Stored Database Syntax |
| :--- | :--- | :--- |
| **Player** | `Wendy`, `Tellurius`, `Techmarine Varek Bastion` | `@player[1]`, `@player[5]`, `@player[6]` |
| **NPC** | `Inquisitor Veyra Mortis`, `Captain Marcus Valen` | `@npc[1]`, `@npc[3]` |
| **Location** | `Fortress Sanctus`, `Maledictum Prime`, `Zephyria` | `@location[3]`, `@location[8]`, `@location[1]` |
| **Shop** | `Herbwhisper's Apothecary`, `The Stoutbarrel Tavern` | `@shop[1]`, `@shop[5]` |
| **Bestiary** | `Aetherwing`, `Mandrake Shadowstalker`, `Intercessor Warrior` | `@bestiary[4]`, `@bestiary[25]`, `@bestiary[8]` |

---

## 3. Workflow: Creating a New Session with NPC & Bestiary Creation

Triggered when the user asks to plan, draft, or create a session.

```mermaid
graph TD
    A[1. Connect & Read Campaign Context] --> B[2. Check Unresolved Plot Hooks & Locations]
    B --> C[3. Formulate Ideas with Proposed NPCs & Encounters]
    C --> D{Are New NPCs Introduced?}
    D -- Yes --> E[4. Draft NPC Entry Profile]
    E --> F{Are NPCs Proposed to Battle Players?}
    F -- Yes (Combatant) --> G[5. Select Existing Weapon IDs & Create Bestiary Entry with Calculated PR]
    G --> H[6. Link bestiaryId to NPC Entry]
    F -- No (Social/Merchant/Ally) --> H
    D -- No --> I[7. Present Ideas & Entities with Clean Names in Chat for User Review]
    H --> I
    I --> J{User Approved in Chat?}
    J -- Revisions --> C
    J -- Approved --> K[8. Save NPC & Bestiary to DB via Tool]
    K --> L[9. Generate Narrative Session Draft in Chat with Clean Names]
    L --> M[10. User Approves Draft in Chat]
    M --> N[11. Convert Clean Names to @type[id] Tags & Persist campaignSession to DB]
```

### Detailed Execution Steps:

1. **Query Database Context & Weapons Compendium:**
   ```bash
   node ./NebryssCompanion/scripts/campaign-session-tool.js get-context [campaignId]
   ```
   Inspect:
   - Previous session narratives & unresolved plot threads.
   - Active players and current party location.
   - Known NPCs, factions, and existing Bestiary creatures.
   - Available weapons in the compendium.

2. **Formulate Narrative Trajectories & NPC Introductions:**
   Create 2-3 structured session ideas. If introducing **new NPCs** (allies, informants, bounty hunters, rivals, warlords, cultists):
   - Design their character profile (name, faction, subgroup, role, personality, backstory, location).
   - Determine if they are **combatants proposed to battle against the players**.

3. **Creating Combatant NPCs & Bestiary Entries (Strict Existing Weapon Rule):**
   When an NPC is proposed as a battle encounter or boss:
   - **STRICT RULE: ONLY USE EXISTING WEAPONS.**
     Browse/search existing weapons:
     ```bash
     node ./NebryssCompanion/scripts/campaign-session-tool.js list-weapons [query]
     ```
     Select 1-3 appropriate weapon IDs (e.g. `2` for Chainsword, `31` for Boltgun, `29` for Plasma Rifle, `8` for Power Sword, `18` for Claws, etc.).
   - Balance core attributes:
     - `Movement`: 4 (Slow), 6 (Standard), 8 (Swift/Flight).
     - `Wounds`: 8-10 (Trooper), 12-16 (Elite/Commander), 20+ (Behemoth/Boss).
     - `Save`: 6 (Poor), 5 (Standard flak), 4 (Carapace), 3 (Power armour), 2 (Artificer/Shield).
     - `APL`: 2 (Standard), 3 (Elite), 4 (Legendary Boss).
   - Add thematic abilities with `prModifier` (e.g. `+10` for aura buffs or extra attacks).
   - Calculate PR automatically:
     ```bash
     node ./NebryssCompanion/scripts/campaign-session-tool.js calculate-pr --weapons="2,31" --attributes='{"Movement":6,"Wounds":12,"Save":4,"APL":2}' --abilities='[{"name":"Battle Rage","effect":"+1 Attack when wounded","prModifier":10}]'
     ```
   - Persist both the Bestiary entry and NPC linked together:
     ```bash
     node ./NebryssCompanion/scripts/campaign-session-tool.js create-combat-npc --campaignId=1 --name="Captain Drake" --faction="Crimson Corsairs" --subgroup="Pirate" --weapons="2,31" --attributes='{"Movement":6,"Wounds":14,"Save":4,"APL":2,"body":["human"]}' --abilities='[{"name":"Boarding Fury","effect":"Reroll 1s in melee","prModifier":8}]' --role="Pirate Captain" --personality="Ruthless and cunning" --location="Zephyria"
     ```

4. **Present Ideas & Entities for User Review in Chat (Clean Names):**
   Print structured session options along with any proposed NPCs and Bestiary stat blocks directly in the chat message using clean names for seamless reading. Never use interactive modals or assume automatic writes.

5. **Draft Full Narrative Session Content in Chat (Clean Names):**
   Once the concept is agreed upon, print the drafted narrative session text directly in the chat for the user to review using clean, natural names:
   - **Session Header & Overview:** Thematic mission title and overview hook.
   - **Act I: The Briefing & Departure:** Setting the stage, NPC interactions at locations, supply stops at shops.
   - **Act II: The Journey & Encounters:** Mist hazards, skirmishes against bestiary creatures, NPC dialogues.
   - **Act III: The Climax & Branching Choices:** High-stakes confrontation against bosses/NPCs with tactical choices.
   - **Objectives & Rewards:** Primary, secondary, and investigation objectives with salvage.

6. **Insert & Persist upon Chat Approval (Tagged with @type[id]):**
   Only when the user provides feedback and explicitly states **"approve"** (or gives affirmative approval in chat):
   - Map all entity names in the approved narrative content to their exact numeric ID tags (`@player[<id>]`, `@npc[<id>]`, `@location[<id>]`, `@shop[<id>]`, `@bestiary[<id>]`).
   - Persist to MongoDB and local JSON storage:
   ```bash
   # Persist session content with numeric entity tags to MongoDB & local storage
   node ./NebryssCompanion/scripts/campaign-session-tool.js save --campaignId=<id> --sessionId=<num> --content="<approved content with @type[id] tags>"
   ```

---

## 4. Workflow: Finalizing a Session (Debrief & Conclusion)

Triggered when the user asks to conclude, finalize, or record the outcome of a session.

1. **Fetch Latest Session:**
   ```bash
   node ./NebryssCompanion/scripts/campaign-session-tool.js get-latest [campaignId]
   ```

2. **Debrief Q&A with the User in Chat:**
   Ask 3-5 concise, specific questions based directly on what was planned:
   - *Exploration:* Which locations were explored?
   - *Combat:* How did skirmishes resolve? (Victories, wounds, casualties, retreats?)
   - *NPCs:* What became of key NPCs? (Defeated, captured, allied, escaped?)
   - *Decisions & Forks:* Which choices did the players make at key narrative branches?
   - *Loot & Upgrades:* Any gear purchased or salvaged from combat?

3. **Branch Visibility Handling (Player-Visible vs GM-Only):**
   - **For sessions with branching paths (e.g. Branch A / Branch B)**: When the user/GM indicates that the players chose or completed a specific branch (e.g. Branch A), **ONLY the chosen/completed branch(es) must be added to `playerVisibleBranches` (e.g. `["Branch A"]` or `["Branch A: <Branch Title>"]`)**.
   - Any unexplored, unchosen, or alternative branches must **NOT** be added to `playerVisibleBranches` so that they remain strictly GM-only and hidden from player views.

4. **Print Narrative Conclusion Draft in Chat (Clean Names):**
   Synthesize answers into standard conclusion sections and print in chat for user feedback using clean, natural names:
   - **Summary of Action:** Concise recap of journey and skirmishes.
   - **Combat Aftermath:** Character performance, casualties, defeated enemies.
   - **Decisions & Consequences:** The path chosen and its immediate world impact.
   - **Current State:** Resting location, player wounds/afflictions, next hooks.

5. **Insert & Finalize Conclusion upon Chat Approval (Tagged with @type[id]):**
   Only when the user explicitly says **"approve"** in chat, map all entity names to `@type[id]` tags and persist:
   ```bash
   node ./NebryssCompanion/scripts/campaign-session-tool.js finalize --campaignId=<id> --sessionId=<num> --conclussion="<approved conclusion with @type[id] tags>" --branches="Branch A: <Title>"
   ```

---

## 5. Tooling & Helper Script Reference

The companion tool `scripts/campaign-session-tool.js` (or `NebryssCompanion/scripts/campaign-session-tool.js`) provides a full CLI suite eliminating the need for ad-hoc scripts:

```bash
# 1. Get full campaign context (sessions, players, NPCs, locations, shops, bestiary, weapons)
node scripts/campaign-session-tool.js get-context [campaignId]

# 2. List sessions with clean human-readable names or expanded tags
node scripts/campaign-session-tool.js list [campaignId] --clean
node scripts/campaign-session-tool.js get-latest [campaignId] --clean

# 3. Auto-tag human-readable text into @type[id] format
node scripts/campaign-session-tool.js auto-tag [campaignId] --input="Wendy and Tellurius travel from Fortress Sanctus to Maledictum Prime"
node scripts/campaign-session-tool.js auto-tag [campaignId] --file="draft.md"

# 4. Convert stored @type[id] tags into clean human-readable narrative text
node scripts/campaign-session-tool.js clean-text [campaignId] --input="@player[1] visits @location[3]"
node scripts/campaign-session-tool.js clean-text [campaignId] --file="session.md"

# 5. List or search existing weapons in the compendium
node scripts/campaign-session-tool.js list-weapons [query]

# 6. Calculate PR for a proposed Bestiary stat block (CLI or JSON file)
node scripts/campaign-session-tool.js calculate-pr --weapons="2,31" --attributes='{"Movement":6,"Wounds":12,"Save":4,"APL":2}' --abilities='[{"name":"Overcharge","effect":"+2 Damage","prModifier":10}]'
node scripts/campaign-session-tool.js calculate-pr --json-file="creature.json"

# 7. Create a non-combat NPC (CLI flags or JSON file)
node scripts/campaign-session-tool.js create-npc --campaignId=1 --name="Valen Croft" --faction="Gilded Accord" --role="Navigator" --location="Zephyria"
node scripts/campaign-session-tool.js create-npc --json-file="npc.json"

# 8. Create a Bestiary entry (validates weapon IDs & auto-calculates PR)
node scripts/campaign-session-tool.js create-bestiary --name="Corsair Enforcer" --faction="Crimson Corsairs" --weapons="2,24" --attributes='{"Movement":6,"Wounds":10,"Save":5,"APL":2,"body":["human"]}'
node scripts/campaign-session-tool.js create-bestiary --json-file="bestiary.json"

# 9. Create a Combat NPC (creates Bestiary entry + NPC linked via bestiaryId)
node scripts/campaign-session-tool.js create-combat-npc --campaignId=1 --name="Baron Vane" --faction="Crimson Corsairs" --subgroup="Nobility" --weapons="8,29" --attributes='{"Movement":6,"Wounds":16,"Save":3,"APL":3,"body":["human"]}' --abilities='[{"name":"Duelist","effect":"Parry melee hits","prModifier":12}]' --role="Pirate Lord" --personality="Haughty and deadly" --location="Stormwatch"
node scripts/campaign-session-tool.js create-combat-npc --json-file="combat-npc.json"

# 10. Save / Create a session (supports file input, auto-tagging, and branch visibility)
node scripts/campaign-session-tool.js save --campaignId=1 --sessionId=1 --content-file="session1.md"
node scripts/campaign-session-tool.js save --campaignId=1 --sessionId=1 --content="Draft text" --branches="Branch A: Total Scorched Earth"
node scripts/campaign-session-tool.js save --file="session-payload.json"

# 11. Finalize a session with conclusion (supports file input & branch visibility)
node scripts/campaign-session-tool.js finalize --campaignId=1 --sessionId=1 --conclussion-file="conclusion.md" --branches="Branch A: Total Scorched Earth"
node scripts/campaign-session-tool.js finalize --campaignId=1 --sessionId=1 --conclussion="Debrief text"
```


---

## 6. Common Existing Weapon Index (Quick Reference)

Always check `list-weapons` for full details. Common existing weapon IDs:

| Weapon ID | Weapon Name | Type / Body | Attacks | WS | Damage | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | Bayonet | melee (human) | 3 | 4+ | 2/3 | Standard infantry |
| **2** | Chainsword | melee (human) | 4 | 4+ | 3/4 | Brutal shred |
| **8** | Power Sword | melee (astartes) | 4 | 3+ | 4/6 | Lethal 5+, Piercing |
| **10** | Rusty Spear | melee (nature) | 3 | 4+ | 2/4 | Reach |
| **12** | Tidal Trident | melee (nature) | 4 | 3+ | 3/5 | Piercing |
| **14** | Balefire Blade | melee (astartes) | 4 | 3+ | 3/4 | Chaos infused |
| **18** | Claws | melee (nature) | 4 | 4+ | 3/4 | Beast attack |
| **22** | Stone Fists | melee (nature) | 3 | 4+ | 4/5 | Heavy blunt |
| **23** | Lasgun | ranged 10" (human) | 4 | 4+ | 2/3 | Reliable rifle |
| **24** | Stub Pistol | ranged 10" (human) | 4 | 4+ | 2/3 | Sidearm |
| **25** | Mistforged Pistol | ranged 10" (human) | 4 | 4+ | 2/3 | Lethal 5+ |
| **26** | Longshot Rifle | ranged sniper (human) | 3 | 3+ | 3/4 | Sniper, Piercing |
| **29** | Plasma Rifle | ranged 10" (astartes) | 4 | 3+ | 5/6 | Piercing 1 |
| **30** | Plasma Pistol | ranged 8" (universal) | 4 | 3+ | 3/5 | Supercharge |
| **31** | Boltgun | ranged 10" (astartes) | 4 | 3+ | 3/4 | Explosive |
| **32** | Melta | ranged 6" (astartes) | 4 | 3+ | 6/3 | Anti-tank |
| **42** | Tidal Bolt | spell (nature) | 4 | 3+ | 3/4 | Blast |
| **45** | Psychic Shriek | spell (universal) | 4 | 3+ | 3/4 | Ignores Cover |
| **49** | Warpflame Blast | spell (universal) | 5 | 3+ | 2/3 | Torrent, Burning |
| **52** | Bolt Pistol | ranged 8" (astartes) | 4 | 4+ | 3/4 | Sidearm |
| **78** | Thunder Hammer | melee (astartes) | 4 | 4+ | 5/6 | Stun, Heavy |
| **79** | Heavy Flamer | ranged 8" (astartes) | 5 | 2+ | 3/3 | Torrent, Burning |
| **87** | Power Klaw | melee (ork) | 4 | 4+ | 5/7 | Brutal |
| **111** | Voss Forged Pistol | ranged 10" (human) | 4 | 4+ | 3/3 | Fate Seal, Lethal 5+ |
| **112** | Maledictum Hex | spell (abyssal) | 4 | 3+ | 3/4 | Curse |
| **113** | Siphon Soul | spell (abyssal) | 3 | 3+ | 4/5 | Life drain |

