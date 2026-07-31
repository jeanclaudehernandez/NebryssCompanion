# NebryssCompanion - Project Context & Rules for AI Agents

## 1. Project Overview
NebryssCompanion is a responsive companion Progressive Web Application (PWA) built with **Angular 18**, **Angular CDK**, and **Angular Material**. It serves as a digital companion for a tabletop RPG / skirmish game ("Nebryss").

### Core Views & Navigation (`currentView` in `AppComponent`):
- `players`: Active Player list & Character Sheet detail (`PlayerListComponent`, `PlayerDetailComponent`).
- `bestiary`: Monsters & Enemy stat cards (`BestiaryComponent`).
- `items`: Equipment & Items directory (`ItemsComponent`, `ItemAdminPageComponent`).
- `shops`: Shops & Merchant system with cart (`ShopsComponent`).
- `lore`: Game world lore & Factions (`LoreComponent`).
- `locations`: Map locations, capital cities, & points of interest (`LocationsComponent`).
- `talents`: Character talents tree & stacks (`TalentsComponent`).
- `mistEffects`: Mist environmental effects (`MistEffectsComponent`).
- `terrains`: Battlefield terrain rules (`TerrainsComponent`).
- `mistEngineBattles`: Combat & battle engine (`MistEngineBattlesComponent`).
- `weaponRules`: Weapon special rules compendium (`WeaponRulesPageComponent`).
- `alteredStates`: Status conditions & debuffs (`AlteredStatesPageComponent`).
- `afflictions`: Player afflictions (`AfflictionsListComponent`).
- `shipNavigation`: Ship travel & navigation (`ShipNavigationComponent`).
- `letters`: Messages & notifications (`LettersPageComponent`).

---

## 2. Key Architecture & Services

### Data Management
- `DataService` (`src/app/data.service.ts`): Central RxJS reactive store fetching data from API/assets, handling HTTP requests, local caching, and JSON state.
- `ActivePlayerService` (`src/app/active-player.service.ts`): Manages the currently selected player character across the app.
- `CartService` (`src/app/cart.service.ts`): Handles shop shopping cart items and gold calculations.

### UI & Theme Services
- `ThemeService` (`src/app/theme.service.ts`): Toggles dark/light theme (`.dark-theme` class on `body`).
- `LoadingService` (`src/app/loading.service.ts`): Controls global loading overlay spinner.
- `ModalService` & `ToastService`: Custom dialogs and feedback toasts.

---

## 3. Mobile UI & UX Requirements (Android & iOS)

### Safe Area & Device Compatibility
- Always account for iOS notches, Dynamic Island, and gesture bars using `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`.
- Use `-webkit-tap-highlight-color: transparent;` and `user-select: none;` on interactive touch controls.
- Ensure touch targets are at least **44px × 44px** for accessibility on mobile devices.

### Layout & Components
- **Top App Bar**: Unified header displaying current view title, side-drawer trigger, theme toggle, and quick active-player status.
- **Bottom Navigation Bar**: Fixed bottom bar with key primary views (Player, Talents, Letters, Shops, More/Menu) styled with subtle glassmorphism and clear active indicators.
- **Side Drawer**: Smooth backdrop-overlay mobile drawer for secondary views (Bestiary, Lore, Locations, Terrains, etc.).
- **Mobile Tables & Cards**: Tables must wrap in smooth horizontally scrollable containers or convert into responsive card layouts for small screen viewports (<768px).
- **Dialogs & Modals**: Optimize dialogs for mobile display with full-width bottom-sheet options or max-width constraints.

---

## 4. Workflows & Rules for AI Agents
1. **Preserve Reactive RxJS Architecture**: Keep component state synced with RxJS signals/observables from `DataService` and `ActivePlayerService`.
2. **Mobile-First CSS**: Always verify CSS rules work on viewports as small as 360px width.
3. **Dark Theme Support**: Ensure all newly added UI elements support `body.dark-theme` styling variables.
4. **Clickable References**: Include `file:///` markdown links for any referenced code files in final responses.
5. **English Language UI**: All user-facing UI text, headers, menu titles, category names, dialogs, tooltips, and aria attributes MUST be strictly in English.
