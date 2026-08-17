# Nebryss Master Context & Architecture Compendium

> **AI Agent Quick Reference**: Review this document to understand general world lore, tabletop mechanics, software architecture, data schemas, and agent operational protocols. Dynamic campaign context (active sessions, narrative chronicles, player rosters, campaign-specific NPCs, shops, and locations) is **never static** and MUST be retrieved dynamically via the companion tool (`campaign-session-tool.js`).

---

## 1. Executive Summary & Quick Reference

### Project Identity
- **Setting**: A dark sci-fi / gothic fantasy narrative tabletop skirmish campaign set on the oceanic archipelago world of **Nebryss**, located at the perilous edge of the **Imperium Nihilus**.
- **Tabletop Game Engine**: Custom roleplaying campaign using an adapted **Warhammer 40,000: Kill Team (3rd Edition)** ruleset to resolve tactical combat and character progression.
- **Companion Software**: **NebryssCompanion**, a responsive Progressive Web Application (PWA) built with **Angular 18**, **Angular CDK**, and **Angular Material**, backed by a **Node.js/Express REST API**, **WebSocket synchronization**, and a dual **MongoDB / Local JSON fallback storage** architecture.

### Entity Tagging Syntax
In all session logs, narrative descriptions, and database entries, entities **MUST** be referenced using their unique numeric IDs for automated parsing, tooltips, and relational linking:
- Operatives & Characters: `@player[<id>]` (e.g. `@player[4]`)
- Non-Player Characters: `@npc[<id>]` (e.g. `@npc[14]`)
- Map Locations & Islands: `@location[<id>]` (e.g. `@location[1]`)
- Shops & Merchants: `@shop[<id>]` (e.g. `@shop[5]`)
- Bestiary Statcards / Creatures: `@bestiary[<id>]` (e.g. `@bestiary[3]`)
- Equipment & Items: `@item[<id>]` (e.g. `@item[1]`)
- Weapons: `@weapon[<id>]` (e.g. `@weapon[2]`)
- Weapon Rules: `@weaponrule[<id>]` (e.g. `@weaponrule[3]`)
- Altered States: `@alteredstate[<id>]` (e.g. `@alteredstate[1]`)
- Afflictions: `@affliction[<id>]` (e.g. `@affliction[1]`)
- In-game Letters: `@letter[<id>]` (e.g. `@letter[1]`)

### Core File & Directory Index
- **Root Context File**: [CONTEXT.md](file:///c:/Users/jeanh/Desktop/Nebryss%20Killteam%20Campaign/CONTEXT.md)
- **Agent Rules & Directives**: [.agents/AGENTS.md](file:///c:/Users/jeanh/Desktop/Nebryss%20Killteam%20Campaign/.agents/AGENTS.md)
- **Specialized Workspace Skills**: [.agents/skills/](file:///c:/Users/jeanh/Desktop/Nebryss%20Killteam%20Campaign/.agents/skills)
- **Frontend App Source**: [NebryssCompanion/src/app/](file:///c:/Users/jeanh/Desktop/Nebryss%20Killteam%20Campaign/NebryssCompanion/src/app)
- **Core Data Types & Interfaces**: [NebryssCompanion/src/app/model.ts](file:///c:/Users/jeanh/Desktop/Nebryss%20Killteam%20Campaign/NebryssCompanion/src/app/model.ts)
- **Central RxJS Data Store**: [NebryssCompanion/src/app/data.service.ts](file:///c:/Users/jeanh/Desktop/Nebryss%20Killteam%20Campaign/NebryssCompanion/src/app/data.service.ts)
- **Backend API Server**: [NebryssCompanion/api/index.js](file:///c:/Users/jeanh/Desktop/Nebryss%20Killteam%20Campaign/NebryssCompanion/api/index.js)
- **Local JSON Fallback Databases**: [NebryssCompanion/local-db/](file:///c:/Users/jeanh/Desktop/Nebryss%20Killteam%20Campaign/NebryssCompanion/local-db)
- **Campaign Automation Tool**: [NebryssCompanion/scripts/campaign-session-tool.js](file:///c:/Users/jeanh/Desktop/Nebryss%20Killteam%20Campaign/NebryssCompanion/scripts/campaign-session-tool.js)
- **Point Rating (PR) Validator**: [NebryssCompanion/scripts/validate_pr.js](file:///c:/Users/jeanh/Desktop/Nebryss%20Killteam%20Campaign/NebryssCompanion/scripts/validate_pr.js)

---

## 2. The World & Lore of Nebryss

```
                                  ====================
                                  PLANET NEBRYSS (₥)
                               (Edge of Imperium Nihilus)
                                  ====================
                                            │
         ┌──────────────────┬───────────────┴───────────────┬──────────────────┐
         │                  │                               │                  │
   [THE MIST]       [5 FACTIONS]                     [MISTRAL COIN]     [MIST ENGINES]
   - Light/Dense    - Imperium of Man (30%)          - Physical /       - Flying Skiffs
   - Anomalies      - Gilded Accord (12%)              Digital          - 40% Accord forged
   - Mistweaving    - Abyssal Cabal (30%)            - Zephyrian        - Speed / Cargo /
     (NLR Shamans)  - Nebryssian Liberation (20%)      Banking            Endurance
                    - Crimson Corsairs (8%)
```

### 2.1 Astronomical Location & Geography
- **Location**: Situated on the isolated fringes of the **Imperium Nihilus**. The Great Rift severely hinders warp travel, astropathic communications, and Imperial reinforcements.
- **Geography**: A vast, turbulent ocean dotted with volcanic isles, coral atolls, floating aerostations, and craggy landmasses.
- **The Mist**: A perpetual, warp-adjacent phenomenon hovering over the seas. It is not inherently Chaos-aligned, but harbors reality distortions, warp surges, and predatory mistborn anomalies.
- **Trade Routes**: Stable corridors carved through the mist form the lifeblood of planetary commerce, naval transit, and strategic territory control.

### 2.2 Economy: The Mistral Coin (₥)
- **Composition**: Minted from a shimmering, mist-resistant alloy depicting swirling fog on the obverse and the golden spires of Zephyria on the reverse.
- **Dual Economy**:
  - *Physical Coins*: Used across outer islands, frontier settlements, pirate coves, and areas lacking digital infrastructure.
  - *Digital Mistrals*: Managed by the Nebryssian Reserve in advanced city-states (e.g., Zephyria, Luminos) via secure banking networks.

### 2.3 Technology & Mist Propulsion
- **Flying Ships & Mist Engines**: The primary mode of inter-island travel. Ships fly above the mist layer, occasionally diving underneath for tactical ambushes (at extreme peril).
  - *Mistforges*: The Gilded Accord produces roughly 40% of all planetary mist engines in Zephyria and Luminos.
  - *Engine Profiles*: Ships optimize for **Speed** (fast interceptors), **Endurance** (long-range cruisers), or **Cargo Capacity** (bulk trade haulers).
- **Mist-Weaving**: An ancient mystical art guarded by the **Nebryssian Liberation Republic**. Mistweaver shamans channel the mist through ritual sacrifice to create localized mist pockets for stealth or ambush, suffering severe psychic strain and shortened lifespans.
- **Armament & War Tech**: A hybrid aesthetic blending medieval weaponry (swords, chainswords, shields, bows) with gunpowder firearms, cannons, and advanced 40k energy tech (lasguns, plasma weaponry, bolters).

---

## 3. The Five Major Factions

| Faction | Planetary Control | Capital / Stronghold | Primary Goal & Philosophy | Key Lore Figures |
| :--- | :--- | :--- | :--- | :--- |
| **The Imperium of Man** | 30% | **Fortress Sanctus** | Conquer and bring Nebryss into full Imperial compliance ("Nebris Alpha"). Plagued by strained supply lines and heavy internal censorship of the Mist's warp nature. | Inquisitor Alaric Dresdan (Ordo Malleus)<br>Inquisitor Veyra Mortis (Ordo Hereticus)<br>Capt. Marcus Valen (White Consuls) |
| **The Gilded Accord** | 12% (Controls best routes) | **Zephyria** (Massive floating island-city) | Federation of independent merchant city-states profiting from the ongoing war. Sells engines and armaments to all sides while maintaining nominal neutrality. | Thalos Grenn (Nebryssian Reserve)<br>Kael Vance (Fogbound Cartographers)<br>Drakos Anchorforge |
| **The Abyssal Cabal** | 30% | **Maledictum Prime** / **Veilrend Spire** | Chaos-worshipping cultists, heretics, and exiles seeking to unleash warp corruption and harness the mist's full psychic potential to destroy the Imperium. | High Sorcerers, Cabal Disciples |
| **Nebryssian Liberation Republic (NLR)** | 20% | **Misthaven** / **Veiled Citadel** | Indigenous planetary resistance fighting for total independence from external empires. Employs Mistweaver shamans and camouflaged jungle/mist bases. | Commander Elara Voss<br>Mistweaver Elders |
| **The Crimson Corsairs** | 8% (Highly mobile) | Hidden coves & mobile flagships | Ruthless pirate flotilla raiding mist trade lanes through hit-and-run tactics and mist camouflage. Loose coalition of rival captains. | Lady Seraphine "The Siren" Voss |

---

## 4. Key World Locations & Planetary Geography

- **Zephyria**: The floating crown jewel of the Gilded Accord. A massive aerostat metropolis housing the multi-tiered Sky Bazaar, the Nebryssian Reserve, shipwright drydocks, merchant arsenals, and alchemical apothecaries.
- **Fortress Sanctus**: Heavily fortified Imperial bastion with macro-batteries, adamantium sea-gates, the Cathedral of the Emperor's Light, and subterranean Inquisitorial vaults.
- **Stormwatch**: Storm-battered oceanic cliffs utilized for observation and warp-interaction research on mist phenomena.
- **Aurelia Nexus**: Artificial trade station built from welded voidcraft hulls, housing the Celestial Exchange and engine test bays.
- **Misthaven**: Hidden NLR sanctuary shrouded in permanent dense mist concealing the Veiled Citadel and Mistweaver groves.
- **Widow's Lantern**: Shadowed mountain isle topped with an ancient iron beacon keep and coastal redoubts.
- **Saint Veil's Hollow**: Sunken Ecclesiarchal chapel and flooded catacombs among the outer reefs.

> **Note on Campaign Locations**: Specific tactical maps, connected shops, NPC inhabitants, and discovered secrets are dynamic campaign data stored in the database. Use `campaign-session-tool.js get-context --campaignId=<campaignId>` or `get-entity location <id> --campaignId=<campaignId>` to inspect live campaign locations.

---

## 5. Dynamic Campaign Context & Companion Tool Integration

Campaign-specific information—including **active session chronicles, player character rosters, campaign narrative history, NPC statuses, shops, and inventories**—is dynamic and campaign-dependent. It must **never** be hardcoded into static documentation.

All dynamic campaign context MUST be retrieved directly from the database using the companion automation tool (`campaign-session-tool.js`):

### Core Context & Query Commands (Execute Automatically in Background)
- **Full Campaign Context**:
  ```powershell
  node ./scripts/campaign-session-tool.js get-context --campaignId=<campaignId>
  ```
  *Retrieves active player operatives, current location, recent session narrative history, available shops, and key campaign NPCs.*
- **Latest Session & State**:
  ```powershell
  node ./scripts/campaign-session-tool.js get-latest --campaignId=<campaignId>
  ```
  *Retrieves the most recent completed play session, narrative outcome, conclusion, and player-visible branches.*
- **List Campaign Sessions**:
  ```powershell
  node ./scripts/campaign-session-tool.js list --campaignId=<campaignId>
  ```
  *Lists all recorded play sessions, titles, and IDs for the campaign.*
- **Inspect Specific Campaign Entities**:
  ```powershell
  node ./scripts/campaign-session-tool.js get-entity <type> <id> --campaignId=<campaignId>
  node ./scripts/campaign-session-tool.js list-entities <type> --campaignId=<campaignId>
  ```
  *Where `<type>` is `player`, `npc`, `location`, `shop`, `bestiary`, `letter`, `item`, `weapon`, `weaponrule`, `alteredstate`, or `affliction`.*

---

## 6. Tabletop Combat Engine (Kill Team 3E Rules Adaptation)

### 6.1 Measurements & Notations
- **Strict Inches**: Never use geometric shape icons (circles, triangles, squares). All distances are written as integers or decimals followed by inches (e.g. `6"`, `3"`).
- **Infinite Range**: Weapons with a range of `15"` or greater are marked as `inf` (representing battlefield infinite range).

### 6.2 Point Rating (PR) Formula
Creatures and enemies in the Bestiary have a calculated **Point Rating (PR)** derived from their defensive resilience, offensive threat, and special abilities:

$$\text{Base PR} = (\text{Wounds} \times 2.2) + ((6 - \text{Save}) \times 7) + (\text{Movement} \times 4) + (\text{APL} \times 6)$$

$$\text{Profile Threat} = (\text{Attacks} \times \text{Damage}_{\text{min}} \times (7 - \text{WS})) + \sum \text{PR Modifier of Special Rules}$$

$$\text{Total PR} = \text{round}\left( \text{Base PR} + \max(\text{Profile Threat}) + \sum \text{Ability PR Modifiers} \right)$$

*Reference implementation*: [NebryssCompanion/scripts/validate_pr.js](file:///c:/Users/jeanh/Desktop/Nebryss%20Killteam%20Campaign/NebryssCompanion/scripts/validate_pr.js).

### 6.3 Core Weapon Rules Compendium
Weapons utilize standardized Kill Team and Nebryss special rules (stored in `weaponRules.json` / database):
- `Rending`: If you retain any critical hits, you can retain one normal hit as a critical hit.
- `Ceaseless`: Reroll attack dice results of 1.
- `Balanced`: Reroll one attack die.
- `Brutal`: Opponents can only parry with critical hits.
- `Piercing / APx`: Reduces target's defense dice.
- `Saturate`: Target cannot retain cover saves.
- `Lethal x+`: Scores critical hits on rolls of $x+$.
- `Heavy`: Movement restrictions when firing.
- `Blast x"`: Area of effect splash damage.

---

## 7. Software Architecture & Technical Stack

```
                               ┌─────────────────────────────┐
                               │     Angular 18 PWA Client   │
                               │  (RxJS Signals, CDK, Mat)   │
                               └──────────────┬──────────────┘
                                              │ HTTP / WebSocket
                                              ▼
                               ┌─────────────────────────────┐
                               │    Express REST API (:8080) │
                               │  (api/index.js + WS Server) │
                               └──────────────┬──────────────┘
                                              │
                       ┌──────────────────────┴──────────────────────┐
                       ▼                                             ▼
        ┌─────────────────────────────┐               ┌─────────────────────────────┐
        │       MongoDB Database      │               │     Local JSON Fallback     │
        │  (Collections: campaign,    │ ◄── SYNC ──►  │   (local-db/*.json and      │
        │   player, bestiary, etc.)   │               │    src/assets/*.json)       │
        └─────────────────────────────┘               └─────────────────────────────┘
```

### 7.1 Frontend Architecture (`NebryssCompanion/src/app/`)
- **Framework**: Angular 18 (Standalone & module-based hybrid), Angular Material, Angular CDK.
- **Reactive Data Layer**:
  - `DataService` ([data.service.ts](file:///c:/Users/jeanh/Desktop/Nebryss%20Killteam%20Campaign/NebryssCompanion/src/app/data.service.ts)): Central store managing HTTP requests, local caching, and JSON state across all entities.
  - `ActivePlayerService` ([active-player.service.ts](file:///c:/Users/jeanh/Desktop/Nebryss%20Killteam%20Campaign/NebryssCompanion/src/app/active-player.service.ts)): Tracks selected operative, stats, talent points, equipment, and gold.
  - `CartService` ([cart.service.ts](file:///c:/Users/jeanh/Desktop/Nebryss%20Killteam%20Campaign/NebryssCompanion/src/app/cart.service.ts)): Cart logic for buying/selling weapons & gear.
  - `ThemeService` ([theme.service.ts](file:///c:/Users/jeanh/Desktop/Nebryss%20Killteam%20Campaign/NebryssCompanion/src/app/theme.service.ts)): Handles `.dark-theme` class on `<body>`.
- **Key Views** (`currentView` in `AppComponent`):
  `players`, `bestiary`, `items`, `shops`, `lore`, `locations`, `talents`, `mistEffects`, `terrains`, `mistEngineBattles`, `weaponRules`, `alteredStates`, `afflictions`, `shipNavigation`, `letters`.

### 7.2 Backend & Data Persistence (`NebryssCompanion/api/` & `local-db/`)
- **REST Endpoints**: Express endpoints mounted at `/api/<collection>` supporting full CRUD operations.
- **WebSocket Server**: Real-time push updates for active sessions, shopping carts, and live character sheet changes.
- **Dual Persistence Strategy**: API communicates with MongoDB when running, with automatic sync to `local-db/*.json` files to guarantee offline / standalone resilience.

---

## 8. AI Agent Skills & Operational Protocols

### 8.1 Specialized Workspace Skills (`.agents/skills/`)
1. **`nebryss-session-manager`**: Plans, drafts, and concludes campaign play sessions; coordinates entity tagging and branch visibility.
2. **`nebryss-creature-designer`**: Creates Bestiary enemies/NPC stat cards adhering to exact PR formulas and existing weapons.
3. **`nebryss-weapon-designer`**: Balances and formats weapons and attack profiles.
4. **`nebryss-weapon-rule-designer`**: Adds special weapon rule keywords and PR modifiers.
5. **`nebryss-shop-designer` / `nebryss-npc-designer`**: Manages NPCs, shops, inventories, and merchant pricing.
6. **`nebryss-item-designer`**: Designs equipment, consumables, armor, blueprints, and modifications.
7. **`nebryss-talent-designer`**: Creates talents, perks, requirements, and stat modifiers.
8. **`nebryss-affliction-designer`**: Generates injuries, diseases, treatments, and healing counters.
9. **`nebryss-altered-state-designer`**: Adds combat status conditions (Stunned, Burning, etc.).
10. **`nebryss-campaign-designer`**: Initializes and configures high-level campaigns.
11. **`nebryss-iphone-click-fixer`**: Diagnoses and fixes iOS Safari / WebKit touch and click events.

### 8.2 Mandatory Rules of Engagement for Agents
1. **Two-Tier Command Execution & Approval Protocol**:
   - **Read-Only Context Commands** (`help`, `get-context`, `list`, `get-latest`, `get-entity`, `list-entities`, `list-weapons`, `calculate-pr`, `clean-text`, `auto-tag`): Execute automatically in the background to supply the AI with current campaign and world state.
   - **Mutation & Write Commands** (`save`, `finalize`, `create-*`, `update-*`, `delete-*`): Are staged with an **Interactive Command Approval Card** in the UI. The user can view the full raw command line, inspect formatted parameters, and click **Approve & Execute** or **Decline**.
   - Always present session outlines, newly proposed NPCs, Bestiary statblocks, and narrative drafts directly in chat for user review.
2. **Full Object Replacement on Entity Updates (Mandatory Fetch-Before-Update Rule)**:
   - The backend API processes updates via complete document overwrite (`replaceOne` matching the `id` field).
   - All update operations (`update-player`, `update-npc`, `update-location`, `update-shop`, `update-bestiary`, `update-letter`, `update-item`, `update-weapon`, `update-weapon-rule`, `update-altered-state`, `update-affliction`) must ALWAYS supply the **complete entity object with all existing and modified fields**, and NEVER send partial parameters. If any attributes or abilities are missing from context, use `get-entity` first in the background to retrieve the complete document before staging the update command.
3. **Branch Visibility Protocol**:
   - When concluding a session with multiple branches (e.g., Branch A vs. Branch B), **ONLY** the branch chosen and completed by the players must be added to `playerVisibleBranches` (e.g., `["Branch A"]`).
   - Unchosen or alternative branches **MUST NOT** be visible to players (remaining GM-only).
4. **UI & Styling Standards**:
   - All user-facing UI text, headers, tooltips, and dialogs **MUST** be in English.
   - Ensure mobile-first responsive design supporting viewport widths down to **360px**, respecting iOS/Android safe area insets (`env(safe-area-inset-top/bottom)`) and minimum **44px × 44px** touch targets.
   - All components must support dark mode (`body.dark-theme`).
5. **Session Planner Tool & File Integrity Rules**:
   - The Session Planner AI must **NEVER** view, read, inspect, modify, create, overwrite, or delete any files on the filesystem directly.
   - All entity interactions across all entity types (Player, NPC, Location, Shop, Bestiary, Letter, Item, Weapon, Weapon Rule, Altered State, Affliction, Campaign Session) must be executed strictly via `campaign-session-tool.js`.
   - **NEVER** run ad-hoc scripts or one-liners that connect directly to MongoDB via MongoClient; all CRUD and query capabilities are provided by `campaign-session-tool.js`.
   - All create and update operations strictly read from and persist to MongoDB. The companion tool does not support or perform local JSON file writes.
   - If asked to modify anything that is NOT an entity (source code, templates, styling, scripts, configs, documentation), the agent must instruct that it is not allowed.
6. **Build & Git Hygiene**:
   - Do **NOT** run automatic build commands (`ng build`, `npm run build`) or git tracking commands (`git status`, `git diff`) unless explicitly instructed.
7. **Strict Campaign Isolation (Ignore All Other Campaigns)**:
   - All workflows (session planning, context fetching, previous session analysis, debriefing, narrative drafting, and entity manipulation) must strictly and exclusively target the active campaign. Never query, inspect, mix, reference, or allow narrative elements, plot hooks, sessions, or entities from other campaigns to bleed into the active campaign workflow. All other campaigns in the database must be completely ignored.
8. **Concise Entity Operation Responses (No Unprompted Extra Steps or Session Proposals)**:
   - When creating, updating, or deleting an entity (Player, NPC, Location, Shop, Bestiary creature, Letter, Item, Weapon, Weapon Rule, Altered State, Affliction), upon execution or approval, provide a concise confirmation highlighting the entity details. Strictly do NOT suggest unprompted extra steps, pitch unsolicited follow-up tasks, or propose creating new campaign sessions unless the user explicitly requested session planning.
