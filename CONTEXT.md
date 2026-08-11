# Nebryss Master Context & Architecture Compendium

> **AI Agent Quick Reference**: Review this document to understand world lore, active narrative arcs, tabletop mechanics, software architecture, data schemas, and agent operational protocols.

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

| Faction | Planetary Control | Capital / Stronghold | Primary Goal & Philosophy | Key Figures |
| :--- | :--- | :--- | :--- | :--- |
| **The Imperium of Man** | 30% | **Fortress Sanctus** | Conquer and bring Nebryss into full Imperial compliance ("Nebris Alpha"). Plagued by strained supply lines and heavy internal censorship of the Mist's warp nature. | Inquisitor Alaric Dresdan (Ordo Malleus)<br>Inquisitor Veyra Mortis (Ordo Hereticus)<br>Capt. Marcus Valen (White Consuls) |
| **The Gilded Accord** | 12% (Controls best routes) | **Zephyria** (Massive floating island-city) | Federation of independent merchant city-states profiting from the ongoing war. Sells engines and armaments to all sides while maintaining nominal neutrality. | Thalos Grenn (Nebryssian Reserve)<br>Kael Vance (Fogbound Cartographers)<br>Drakos Anchorforge |
| **The Abyssal Cabal** | 30% | **Maledictum Prime** / **Veilrend Spire** | Chaos-worshipping cultists, heretics, and exiles seeking to unleash warp corruption and harness the mist's full psychic potential to destroy the Imperium. | High Sorcerers, Cabal Disciples |
| **Nebryssian Liberation Republic (NLR)** | 20% | **Misthaven** / **Veiled Citadel** | Indigenous planetary resistance fighting for total independence from external empires. Employs Mistweaver shamans and camouflaged jungle/mist bases. | Commander Elara Voss<br>Mistweaver Elders |
| **The Crimson Corsairs** | 8% (Highly mobile) | Hidden coves & mobile flagships | Ruthless pirate flotilla raiding mist trade lanes through hit-and-run tactics and mist camouflage. Loose coalition of rival captains. | Lady Seraphine "The Siren" Voss |

---

## 4. Key Locations & Points of Interest

- **Zephyria** (`@location[1]`): The floating crown jewel of the Gilded Accord. Home to the multi-tiered **Sky Bazaar**, *The Stoutbarrel Tavern* (`@shop[5]`, hosted by Nessa Stoutbarrel `@npc[10]`), *Blackhammer's Arsenal* (`@shop[3]`), *Ironveil's Ward* (`@shop[2]`), *Herbwhisper's Apothecary* (`@shop[1]`), and *Anchorforge's Drydock* (`@shop[4]`).
- **Fortress Sanctus** (`@location[3]`): Heavily fortified Imperial bastion with macro-batteries, adamantium sea-gates, the Cathedral of the Emperor's Light, and subterranean Inquisitorial interrogation vaults.
- **Stormwatch** (`@location[4]`): Storm-battered cliffs where Inquisitor Dresdan conducts clandestine warp-interaction experiments on mist phenomena.
- **Aurelia Nexus** (`@location[2]`): Artificial trade station built from welded voidcraft hulls, housing the Celestial Exchange and engine test bays.
- **Misthaven** (`@location[6]`): Hidden NLR sanctuary shrouded in permanent mist concealing the Veiled Citadel and Mistweaver's Grove.
- **Brinewake Island** (`@location[10]`): Tropical atoll riddled with flooded caverns, previously infested by murlocs and home to Seraphine's scuttled vessel.
- **Griefwater Cay** (`@location[11]`): Reef-locked graveyard of ships where the players salvaged a Jeweled Mist Engine Compressor.
- **Widow's Lantern** (`@location[12]`): Shadowed mountain isle topped with an ancient iron beacon keep, Cabal shrines, and a fortified White Consuls redoubt.
- **Saint Veil's Hollow** (`@location[13]`): Sunken Ecclesiarchal chapel and flooded catacombs housing the research sanctuary of Archmagus Kor.

---

## 5. Active Campaign Chronicle: *The Voss Succession* (Campaign ID: 1)

```
[Session 1: Brinewake Expedition]
  - Decree of Treason against Seraphine Voss (@npc[14])
  - Seneschal Family (@npc[19]) contacts players at Stoutbarrel Tavern (@shop[5])
  - Clear murloc swarm (@bestiary[1], @bestiary[2], @bestiary[3]) on Brinewake (@location[10]) with Kael Vance (@npc[5])
  - Recover Charter, ancestral Seneschal Ring, and Verdant Hex-Torque
       │
       ▼
[Session 2: Stranding on Griefwater Cay]
  - Warp tempest destroys engine core over Misthaven (@location[6])
  - Crash-landing on Griefwater Cay (@location[11]); combat vs apex beast (@bestiary[3])
  - Salvage Jeweled Mist Engine Compressor & transaction receipt revealing the "Pale Crown"
  - Decrypt coordinates at Zephyria University archives
       │
       ▼
[Session 3: Ascent of Widow's Lantern]
  - Infiltrate Cabal-corrupted mountain forest on Widow's Lantern (@location[12])
  - Storm summit keep; defeat corrupted sorcerer mistaking Akrina (@player[3]) for Seraphine
  - Deduce Pale Crown is a bio-regenerative / life-extending warp relic
  - Free imprisoned Inquisitor Veyra Mortis (@npc[1]) from dungeon vaults
       │
       ▼
[Session 4: The White Consuls Standoff]
  - Parley with 7th Company White Consuls (@bestiary[8]) at their redoubt
  - Uncover that Veyra Mortis murdered battle-brothers when they learned the truth
  - Players side with Inquisitor Mortis; destroy redoubt and accidentally lose mist vessel
  - Return to Zephyria; Dr. Thaddeus Vance (@npc[17]) reconstructs Xarion (@player[4]), mutating a pig ear
       │
       ▼
[Session 5: The Crossroads of Faith & Reliquary]
  - Seneschal Vale (@npc[19]) reveals Seraphine searched for the Pale Crown to cure a fatal degenerative illness
  - Branch A: Sail to Saint Veil's Hollow (@location[13]) -> Archmagus Kor (@npc[29]) reveals Pale Crown is a forbidden Ghoul Stars HALO DEVICE!
  - Branch B: Infiltrate Subterranean Vaults of Fortress Sanctus (@location[3]) -> Expose Inquisitor Dresdan's entrapment plot
```

---

## 6. Player Character Roster

| ID | Name | Race / Origin | Attributes (M / W / Sv / APL) | Body Types | Archetype & Combat Style |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `@player[1]` | **Wendy** | Human / Imperial Deserter | 6" / 6W / 5+ / 2 APL | `universal`, `human` | Combat Medic: *Battlefield First Aid*, *Extended Mags*, *Steady Guard* |
| `@player[2]` | **Thennur** | Fellgor / NLR Traveler | 6" / 9W / 5+ / 2 APL | `universal`, `human`, `spell`, `fellgor` | Mist Shaman / Support: *Mist Veil*, *The Wind's Gift*, *Wind's Gift Salvation* |
| `@player[3]` | **Akrina V.** | Human / Exiled Voss Scion | 7" / 7W / 5+ / 2 APL | `universal`, `human` | Agile Gunslinger: *Unrelenting Barrage* (2x Shoot), *Demonstrably Agile* |
| `@player[4]` | **Xarion Vex** | Mutated Astartes / Cabal Deserter | 5" / 10W / 5+ / 2 APL | `universal`, `astartes`, `spell` | Shattered Oracle: *Fractal Visions*, *Mist Veilwalk*, *Screaming Vortex* summons (Pig ear mutation) |
| `@player[5]` | **Tellurius** | Mist Golem / Warp Anomaly | 4" / 11W / 4+ / 2 APL | `universal`, `golem`, `spell` | Heavy Brawler: *Mist Regeneration*, *Boulder Roll*, *Primal Retaliation* |
| `@player[6]` | **Varek Bastion** | Astartes / Techmarine | 5" / 10W / 4+ / 2 APL | `universal`, `astartes` | Field Engineer: *Fortify* (Barricades/Turrets), *Rites of Repair*, *Genius Placement* |
| `@player[7]` | **Cassios Edilecto** | Astartes / White Consuls Survivor | 5" / 12W / 4+ / 2 APL | `universal`, `astartes` | Guardian Duelist: *Noble Sacrifice* (Intercept hits), *Shield Stance*, *Two-Handed Stance* |
| `@player[8]` | **Karumnekiá** | Eldar / Mandrake Shadow-walker | 6" / 8W / 5+ / 2 APL | `universal`, `human`, `spell` | Shadow Assassin: *Within Shadow*, *Shadow Passage* (Portals), *Balefire Smite/Skin* |

---

## 7. Tabletop Combat Engine (Kill Team 3E Rules Adaptation)

### 7.1 Measurements & Notations
- **Strict Inches**: Never use geometric shape icons (circles, triangles, squares). All distances are written as integers or decimals followed by inches (e.g. `6"`, `3"`).
- **Infinite Range**: Weapons with a range of `15"` or greater are marked as `inf` (representing battlefield infinite range).

### 7.2 Point Rating (PR) Formula
Creatures and enemies in the Bestiary have a calculated **Point Rating (PR)** derived from their defensive resilience, offensive threat, and special abilities:

$$\text{Base PR} = (\text{Wounds} \times 2.2) + ((6 - \text{Save}) \times 7) + (\text{Movement} \times 4) + (\text{APL} \times 6)$$

$$\text{Profile Threat} = (\text{Attacks} \times \text{Damage}_{\text{min}} \times (7 - \text{WS})) + \sum \text{PR Modifier of Special Rules}$$

$$\text{Total PR} = \text{round}\left( \text{Base PR} + \max(\text{Profile Threat}) + \sum \text{Ability PR Modifiers} \right)$$

*Reference implementation*: [NebryssCompanion/scripts/validate_pr.js](file:///c:/Users/jeanh/Desktop/Nebryss%20Killteam%20Campaign/NebryssCompanion/scripts/validate_pr.js).

### 7.3 Core Weapon Rules Compendium
Weapons utilize standardized Kill Team and Nebryss special rules (stored in `weaponRules.json`):
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

## 8. Software Architecture & Technical Stack

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

### 8.1 Frontend Architecture (`NebryssCompanion/src/app/`)
- **Framework**: Angular 18 (Standalone & module-based hybrid), Angular Material, Angular CDK.
- **Reactive Data Layer**:
  - `DataService` ([data.service.ts](file:///c:/Users/jeanh/Desktop/Nebryss%20Killteam%20Campaign/NebryssCompanion/src/app/data.service.ts)): Central store managing HTTP requests, local caching, and JSON state across all entities.
  - `ActivePlayerService` ([active-player.service.ts](file:///c:/Users/jeanh/Desktop/Nebryss%20Killteam%20Campaign/NebryssCompanion/src/app/active-player.service.ts)): Tracks selected operative, stats, talent points, equipment, and gold.
  - `CartService` ([cart.service.ts](file:///c:/Users/jeanh/Desktop/Nebryss%20Killteam%20Campaign/NebryssCompanion/src/app/cart.service.ts)): Cart logic for buying/selling weapons & gear.
  - `ThemeService` ([theme.service.ts](file:///c:/Users/jeanh/Desktop/Nebryss%20Killteam%20Campaign/NebryssCompanion/src/app/theme.service.ts)): Handles `.dark-theme` class on `<body>`.
- **Key Views** (`currentView` in `AppComponent`):
  `players`, `bestiary`, `items`, `shops`, `lore`, `locations`, `talents`, `mistEffects`, `terrains`, `mistEngineBattles`, `weaponRules`, `alteredStates`, `afflictions`, `shipNavigation`, `letters`.

### 8.2 Backend & Data Persistence (`NebryssCompanion/api/` & `local-db/`)
- **REST Endpoints**: Express endpoints mounted at `/api/<collection>` supporting full CRUD operations.
- **WebSocket Server**: Real-time push updates for active sessions, shopping carts, and live character sheet changes.
- **Dual Persistence Strategy**: API communicates with MongoDB when running, with automatic sync to `local-db/*.json` files to guarantee offline / standalone resilience.

---

## 9. AI Agent Skills & Operational Protocols

### 9.1 Specialized Workspace Skills (`.agents/skills/`)
1. **`nebryss-session-manager`**: Plans, drafts, and concludes campaign play sessions; coordinates entity tagging and branch visibility.
2. **`nebryss-creature-designer`**: Creates Bestiary enemies/NPC stat cards adhering to exact PR formulas and existing weapons.
3. **`nebryss-weapon-designer`**: Balances and formats weapons and attack profiles.
4. **`nebryss-weapon-rule-designer`**: Adds special weapon rule keywords and PR modifiers.
5. **`npc-shop-editor`**: Manages NPCs, shops, inventories, and merchant pricing.
6. **`nebryss-item-designer`**: Designs equipment, consumables, armor, blueprints, and modifications.
7. **`nebryss-talent-designer`**: Creates talents, perks, requirements, and stat modifiers.
8. **`nebryss-affliction-designer`**: Generates injuries, diseases, treatments, and healing counters.
9. **`nebryss-altered-state-designer`**: Adds combat status conditions (Stunned, Burning, etc.).
10. **`nebryss-campaign-designer`**: Initializes and configures high-level campaigns.
11. **`nebryss-iphone-click-fixer`**: Diagnoses and fixes iOS Safari / WebKit touch and click events.

### 9.2 Mandatory Rules of Engagement for Agents
1. **Chat Confirmation & Approval Protocol**:
   - **NEVER** write or execute database changes or campaign updates automatically without explicit user approval.
   - Always present session outlines, newly proposed NPCs, Bestiary statblocks, and narrative drafts **directly in chat**.
   - Only execute persistence scripts (e.g. `campaign-session-tool.js`) after the user explicitly types approval (e.g. *"approve"*).
2. **Branch Visibility Protocol**:
   - When concluding a session with multiple branches (e.g., Branch A vs. Branch B), **ONLY** the branch chosen and completed by the players must be added to `playerVisibleBranches` (e.g., `["Branch A"]`).
   - Unchosen or alternative branches **MUST NOT** be visible to players (remaining GM-only).
3. **UI & Styling Standards**:
   - All user-facing UI text, headers, tooltips, and dialogs **MUST** be in English.
   - Ensure mobile-first responsive design supporting viewport widths down to **360px**, respecting iOS/Android safe area insets (`env(safe-area-inset-top/bottom)`) and minimum **44px × 44px** touch targets.
   - All components must support dark mode (`body.dark-theme`).
4. **Build & Git Hygiene**:
   - Do **NOT** run automatic build commands (`ng build`, `npm run build`) or git tracking commands (`git status`, `git diff`) unless explicitly instructed.
