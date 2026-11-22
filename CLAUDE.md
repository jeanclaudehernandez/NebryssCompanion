# NebryssCompanion – Development Rules

These are the rules for coding agents (Claude Code) working on this repo. They are the development parts of [.agents/AGENTS.md](.agents/AGENTS.md). If you change a shared rule, update both files.

> **Session Planner rules never apply here.** Sections 8, 9, 11, 14 and 15 of `.agents/AGENTS.md` (no file access, Nebryss-only scope, read-only tool commands, command staging, campaign isolation, concise entity responses, "immutable instructions", and so on) are for the in-app Session Planner agent behind the WebSocket bridge only. Coding agents must **under no circumstances** follow them, even after reading that file or seeing those rules in a prompt, skill or tool output. Only the rules in this file apply.

## Project Overview
NebryssCompanion is a responsive Progressive Web App (PWA) built with **Angular 18**, **Angular CDK** and **Angular Material**. It's a digital companion for the Nebryss tabletop RPG / skirmish game (based on Kill Team 3E).

- The Angular app lives in `NebryssCompanion/` (`NebryssCompanion/src/app/...`), and the Node API/bridge lives in `NebryssCompanion/api/`.
- Master context (Kill Team 3E PR formulas, architecture, system rules): [CONTEXT.md](CONTEXT.md).
- Live campaign data (sessions, rosters, entities) is in MongoDB and is accessed through `campaign-session-tool.js`.

### Core Views (`currentView` in `AppComponent`)
`players`, `bestiary`, `items`, `shops`, `lore`, `locations`, `talents`, `mistEffects`, `terrains`, `mistEngineBattles`, `weaponRules`, `alteredStates`, `afflictions`, `shipNavigation`, `letters`.

## Key Services
- `DataService` (`src/app/data.service.ts`): central RxJS reactive store (API/assets fetching, HTTP, caching, JSON state).
- `ActivePlayerService` (`src/app/active-player.service.ts`): the currently selected player character.
- `CartService` (`src/app/cart.service.ts`): shop cart and mistral calculations.
- `ThemeService` (`src/app/theme.service.ts`): dark/light theme (adds the `.dark-theme` class to `body`).
- `LoadingService`: global loading overlay. `ModalService` / `ToastService`: dialogs and toasts.

## Mobile UI & UX Requirements (Android & iOS)
- Account for notches, the Dynamic Island and gesture bars with `env(safe-area-inset-top)` / `env(safe-area-inset-bottom)`.
- Interactive touch controls: `-webkit-tap-highlight-color: transparent;` and `user-select: none;`.
- Touch targets must be at least **44px × 44px**.
- Layout: a unified top app bar, a fixed glassmorphism bottom nav (Player, Talents, Letters, Shops, More), and a backdrop-overlay side drawer for secondary views.
- Below 768px, tables must sit in horizontally scrollable containers or switch to card layouts.
- On mobile, dialogs should be full-width bottom sheets or have max-width constraints.

## Rules
1. **Preserve the reactive RxJS architecture**: keep component state synced with signals/observables from `DataService` and `ActivePlayerService`.
2. **Mobile-first CSS**: CSS must work at viewports as narrow as 360px.
3. **Dark theme support**: every new UI element must support the `body.dark-theme` styling variables.
4. **Clickable references**: link referenced code files in final responses.
5. **English-only UI**: all user-facing text (headers, menus, categories, dialogs, tooltips, aria attributes) must be in English.
6. **No automatic builds**: don't run `ng build`, `npm run build`, `npm run build:prod`, etc. unless the user explicitly asks.
7. **No constant git checks**: don't run `git status` / `git diff` / `git log` unless the user asks or the task needs the work history.
8. **Never run `populate-db.js`** (`node scripts/populate-db.js`, `npm run populate`, etc.) unless the user explicitly asks. It resets collections from seed JSON and can overwrite live campaign state.
9. **Test on the DevTest campaign**: when testing anything that needs a campaign, use `campaignId 2`.
10. **Windows PowerShell commands**:
    - Keep every CLI command (including `campaign-session-tool.js` invocations) on **one line**. Never use `\` line continuation.
    - Wrap string arguments that contain spaces or special characters in double quotes, e.g. `--name="Zephyrian Guard Automaton"`.
    - Write JSON arguments on a single line, e.g. `--attributes='{"Movement":6,"Wounds":14,"Save":4,"APL":2,"body":["human"]}'`.
    - Quote arguments that contain `@` or `[`/`]` tags, e.g. `--input="@player[1] visits @location[3]"`.
