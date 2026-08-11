---
name: "Nebryss iPhone Click Fixer"
description: "Fixes iPhone-only tap, focus, and click failures in the Nebryss app. Invoke when iPhone users can scroll but buttons, tabs, or inputs do not respond."
---

# Nebryss iPhone Click Fixer

Use this skill when the user reports an interaction bug that is:
- present on iPhone but not Android/desktop,
- often allows scrolling but blocks taps, focus, or text input,
- may show hover/highlight feedback without actually selecting,
- may affect the Items page first, but can also appear anywhere else in the app.

## Execution Steps

1. **Confirm the symptom pattern**
   - Look for phrases like:
     - "iPhone users can only scroll"
     - "buttons highlight but do not click"
     - "search box will not focus"
     - "tabs do not become selected"
   - Treat this as an iOS touch/focus compatibility issue first, not a generic data bug.

2. **Inspect global touch and pointer behavior first**
   - Search for:
     - `document:touchstart`, `document:touchmove`, `document:touchend`, `document:touchcancel`
     - `@HostListener('touch...')`
     - `touch-action`
     - `preventDefault()`
     - `stopPropagation()`
     - fixed or sticky overlays with `pointer-events`
   - Pay special attention to:
     - `src/app/app.component.ts`
     - `src/styles.css`
     - `src/app/custom-dropdown/custom-dropdown.component.ts`
     - the affected page component and any child controls rendered immediately on entry

3. **Apply the common iPhone fix patterns**
   - Prefer removing or narrowing global document-level touch listeners when they are not essential.
   - Do **not** attach `touch-action: manipulation` to text-entry elements such as:
     - `input`
     - `textarea`
     - `select`
   - Restrict `touch-action: manipulation` to button-like controls only:
     - `button`
     - links
     - explicit `[role="button"]`
   - If a custom pull-to-refresh or gesture system exists, make sure it is not active on iPhone paths.
   - If a reusable component has a document-level touch listener, check whether a normal `document:click` handler is enough.

4. **Check for invisible interaction blockers**
   - Review overlays, backdrops, sticky headers, and fixed containers.
   - Verify that:
     - hidden overlays do not still receive pointer events,
     - sticky/fixed elements are not covering the active controls,
     - page-level wrappers do not create unintended hitbox overlap on iPhone.

5. **Only then inspect heavy page-entry logic**
   - If the issue happens immediately on entering a page, review synchronous initialization work.
   - Prefer reducing or deferring expensive page-entry work when it can block first interaction.
   - On the Items page specifically, review:
     - initial category rendering,
     - table setup,
     - child components mounted on first paint,
     - dropdown/filter controls rendered by default.

6. **Apply the fix broadly when the pattern is reusable**
   - If the same touch anti-pattern exists elsewhere in the app, fix the whole pattern rather than only the first page that failed.
   - Keep the change focused and minimal.

7. **Validate safely**
   - Do not introduce debug-server logging unless the user explicitly wants that workflow.
   - Do not build unless the user asks or the current workflow requires it.
   - If the user asks to deploy, build and deploy after the fix.

## Known Good Fixes From This Project

- Removed the global `document:touchstart` listener from `custom-dropdown.component.ts`.
- Narrowed global `touch-action: manipulation` rules in `src/styles.css` so they no longer apply to `input`, `select`, or `textarea`.
- Kept iPhone paths protected from custom pull-to-refresh touch tracking in `app.component.ts`.

## Notes

- When the user says "it highlights but does not click" on iPhone, suspect touch-event interference before suspecting Angular click bindings.
- When the user says "cannot type into the search box", suspect CSS/touch behavior on inputs or an overlay before suspecting form logic.
- If the issue is page-specific but scroll still works, inspect child controls mounted on entry, especially dropdowns and sticky UI.
