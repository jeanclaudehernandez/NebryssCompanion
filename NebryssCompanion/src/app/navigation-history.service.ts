import { Injectable, inject, DestroyRef } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { AppView } from './app-view.types';
import { AdminEditorSession } from './admin-editor.models';
import { Location } from './model';

export interface AppNavigationSelectionState {
  view: AppView;
  selectedLocationName: string | null;
  selectedLocationBackTarget: string | null;
  selectedWorldMapLocationName: string | null;
  selectedFactionName: string | null;
  selectedRuleName: string | null;
  selectedStateName: string | null;
  selectedNpcName: string | null;
  selectedShopName: string | null;
  selectedBestiaryId: number | null;
  adminEditSession: AdminEditorSession | null;
  adminLocationDraft: { mapX: number | null; mapY: number | null; location: Location | null } | null;
}

export type ModalCloseHandler = () => boolean;

@Injectable({
  providedIn: 'root'
})
export class NavigationHistoryService {
  private matDialog = inject(MatDialog);

  private historyStack: AppNavigationSelectionState[] = [];
  private readonly maxHistoryLength = 30;
  private isRestoringState = false;
  private modalHandlers: ModalCloseHandler[] = [];
  private onRestoreCallback?: (state: AppNavigationSelectionState) => void;
  private isInitialized = false;

  constructor() {
    this.initBrowserEvents();
  }

  private initBrowserEvents(): void {
    if (typeof window === 'undefined' || !window.history) {
      return;
    }

    window.addEventListener('popstate', (event: PopStateEvent) => {
      this.handlePopState(event);
    });
  }

  /**
   * Register a callback in AppComponent to apply restored view & selection state.
   */
  registerRestoreCallback(cb: (state: AppNavigationSelectionState) => void): void {
    this.onRestoreCallback = cb;
  }

  /**
   * Register a modal/overlay close handler.
   * Handlers should return `true` if they intercepted and closed an open modal/drawer, or `false` if nothing was open.
   * Handlers registered most recently are checked first.
   * If destroyRef is provided, the handler is automatically unregistered when the component is destroyed.
   */
  registerModalHandler(handler: ModalCloseHandler, destroyRef?: DestroyRef): () => void {
    this.modalHandlers.unshift(handler);
    const unregister = () => {
      const idx = this.modalHandlers.indexOf(handler);
      if (idx !== -1) {
        this.modalHandlers.splice(idx, 1);
      }
    };
    if (destroyRef) {
      destroyRef.onDestroy(unregister);
    }
    return unregister;
  }

  /**
   * Checks and closes the topmost open modal/dialog/drawer.
   * Returns true if an active modal/drawer was dismissed.
   */
  closeTopModal(): boolean {
    // 1. Angular Material Dialogs
    if (this.matDialog.openDialogs.length > 0) {
      const topDialog = this.matDialog.openDialogs[this.matDialog.openDialogs.length - 1];
      topDialog.close();
      return true;
    }

    // 2. Custom registered modal and drawer handlers
    for (const handler of this.modalHandlers) {
      try {
        if (handler()) {
          return true;
        }
      } catch (e) {
        console.error('Error executing modal close handler', e);
      }
    }

    return false;
  }

  /**
   * Initialize history with the starting navigation selection state.
   */
  init(initialState: AppNavigationSelectionState): void {
    this.historyStack = [{ ...initialState }];
    this.isInitialized = true;

    if (typeof window !== 'undefined' && window.history) {
      // Set baseline state
      window.history.replaceState({ nebryssNav: true, depth: this.historyStack.length }, '');
    }
  }

  /**
   * Record a new navigation step (view or selection change).
   */
  pushState(state: AppNavigationSelectionState): void {
    if (this.isRestoringState || !this.isInitialized) {
      return;
    }

    const current = this.historyStack[this.historyStack.length - 1];
    if (current && this.areStatesEqual(current, state)) {
      return;
    }

    this.historyStack.push({ ...state });
    if (this.historyStack.length > this.maxHistoryLength) {
      this.historyStack.shift();
    }

    if (typeof window !== 'undefined' && window.history) {
      window.history.pushState({ nebryssNav: true, depth: this.historyStack.length }, '');
    }
  }

  /**
   * Replace the current navigation state (e.g. selection update within current view).
   */
  replaceCurrentState(state: AppNavigationSelectionState): void {
    if (this.isRestoringState || !this.isInitialized || this.historyStack.length === 0) {
      return;
    }

    this.historyStack[this.historyStack.length - 1] = { ...state };
  }

  private handlePopState(event: PopStateEvent): void {
    // 1. Check if any modal / drawer / popup is open and close it
    const modalDismissed = this.closeTopModal();
    if (modalDismissed) {
      // Re-push a history state to maintain the browser history depth
      if (typeof window !== 'undefined' && window.history) {
        window.history.pushState({ nebryssNav: true, depth: this.historyStack.length }, '');
      }
      return;
    }

    // 2. Backtrack navigation history
    if (this.historyStack.length > 1) {
      this.historyStack.pop(); // Remove the active state
      const targetState = this.historyStack[this.historyStack.length - 1];
      if (targetState) {
        this.isRestoringState = true;
        try {
          this.onRestoreCallback?.(targetState);
        } finally {
          this.isRestoringState = false;
        }
      }
    } else {
      // At the root state: keep baseline history entry so user doesn't exit by accident
      if (typeof window !== 'undefined' && window.history) {
        window.history.pushState({ nebryssNav: true, depth: 1 }, '');
      }
    }
  }

  private areStatesEqual(a: AppNavigationSelectionState, b: AppNavigationSelectionState): boolean {
    return (
      a.view === b.view &&
      a.selectedLocationName === b.selectedLocationName &&
      a.selectedLocationBackTarget === b.selectedLocationBackTarget &&
      a.selectedWorldMapLocationName === b.selectedWorldMapLocationName &&
      a.selectedFactionName === b.selectedFactionName &&
      a.selectedRuleName === b.selectedRuleName &&
      a.selectedStateName === b.selectedStateName &&
      a.selectedNpcName === b.selectedNpcName &&
      a.selectedShopName === b.selectedShopName &&
      a.selectedBestiaryId === b.selectedBestiaryId &&
      this.areAdminSessionsEqual(a.adminEditSession, b.adminEditSession) &&
      a.adminLocationDraft?.mapX === b.adminLocationDraft?.mapX &&
      a.adminLocationDraft?.mapY === b.adminLocationDraft?.mapY &&
      a.adminLocationDraft?.location?.id === b.adminLocationDraft?.location?.id
    );
  }

  private areAdminSessionsEqual(a: AdminEditorSession | null | undefined, b: AdminEditorSession | null | undefined): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (a.mode !== b.mode) return false;

    if (a.mode === 'item' && b.mode === 'item') {
      return a.item.id === b.item.id;
    }
    if (a.mode === 'weapon' && b.mode === 'weapon') {
      return a.weapon.id === b.weapon.id;
    }
    if (a.mode === 'npc' && b.mode === 'npc') {
      return a.npc.id === b.npc.id;
    }
    if (a.mode === 'shop' && b.mode === 'shop') {
      return a.shop.id === b.shop.id;
    }
    if (a.mode === 'creature' && b.mode === 'creature') {
      return a.creature.id === b.creature.id;
    }

    return false;
  }
}
