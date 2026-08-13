import { Component, DestroyRef, HostListener, TemplateRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { combineLatest } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SidebarComponent } from './sidebar/sidebar.component';
import { DataService } from './data.service';
import { ThemeService } from './theme.service';
import { LoadingService } from './loading.service';
import { MatDialog } from '@angular/material/dialog';
import { AdminEditorSession } from './admin-editor.models';
import { ActivePlayerService } from './active-player.service';
import { AppViewHostComponent } from './app-view-host.component';
import { APP_VIEWS, AppView } from './app-view.types';
import { Location, Campaign } from './model';
import { BestiaryMaterialsService } from './bestiary/bestiary-materials.service';
import { ModalService } from './modal.service';
import { CampaignService } from './campaign.service';

import { AdminService } from './admin.service';
import { ToastService } from './toast.service';
import { SettingsModalComponent } from './settings-modal/settings-modal.component';
import { NavigationHistoryService, AppNavigationSelectionState } from './navigation-history.service';
import { AuthGatewayComponent } from './auth-gateway/auth-gateway.component';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    HttpClientModule,
    SidebarComponent,
    AppViewHostComponent,
    SettingsModalComponent,
    AuthGatewayComponent
  ],
  template: `
    <ng-container *ngIf="(authService.isAuthenticated$ | async); else unauthenticatedGate">
      <!-- Top App Bar Header -->
      <header class="app-header">
      <button type="button" class="header-action-btn" (click)="$event.stopPropagation(); sidebarComp.toggleMenu()" aria-label="Open navigation menu">
        <span class="material-icons">menu</span>
      </button>

      <h1 class="header-title">{{ currentViewTitle }}</h1>

      <button
        *ngIf="hasAdminAccess$ | async"
        type="button"
        class="top-gm-toggle-btn"
        [class.active]="isAdmin$ | async"
        (click)="toggleGmMode()"
        title="Toggle GM Mode (Secret Vaults & Editors)"
      >
        <span class="material-icons">security</span>
        <span>{{ (isAdmin$ | async) ? 'GM ON' : 'GM OFF' }}</span>
      </button>

      <div class="header-actions">
        <button
          *ngIf="showBestiaryLootButton"
          type="button"
          class="bestiary-loot-btn"
          [class.open]="bestiaryMaterialsSidebarOpen"
          (click)="toggleBestiaryMaterialsSidebar()"
          [attr.aria-label]="'Open loot drops (' + bestiaryMaterialsCount + ')'"
        >
          <span class="material-icons" aria-hidden="true">inventory_2</span>
          <span class="bestiary-loot-btn-text">Loot ({{ bestiaryMaterialsCount }})</span>
        </button>

        @if (showHeaderPlayerTitle) {
          @if (activePlayer$ | async; as player) {
            <div class="active-player-chip" (click)="onViewChange('players')" title="Active Player">
              <span class="material-icons chip-icon">person</span>
              <span class="chip-name">{{ player.name }}</span>
            </div>
          } @else {
            <div class="active-player-chip" (click)="onViewChange('players')" title="Select Player">
              <span class="material-icons chip-icon">person</span>
              <span class="chip-name">Select</span>
            </div>
          }
        }
      </div>
    </header>

    <!-- Pull to Refresh Indicator -->
    <div class="pull-refresh-indicator" [style.height.px]="pullIndicatorHeight" [style.opacity]="pullProgress > 0 ? 1 : 0">
       <div class="spinner-small" *ngIf="isRefreshing || pullProgress > 0.8"></div>
       <span *ngIf="!isRefreshing && pullProgress <= 0.8">Pull to refresh...</span>
       <span *ngIf="!isRefreshing && pullProgress > 0.8">Release to refresh</span>
       <span *ngIf="isRefreshing">Refreshing...</span>
    </div>

    @if (loadingService.loading$ | async) {
      <div class="loading-overlay">
        <div class="spinner"></div>
      </div>
    }
    <app-sidebar #sidebarComp (viewChange)="onViewChange($event)" (openSettings)="openSettingsModal()"></app-sidebar>
    
    <div class="content-area" #contentArea [style.transform]="contentTransform" [class.content-area-no-footer]="!showFooterMenu">
      <app-view-host
        [view]="currentView"
        [selectedLocationName]="selectedLocationName"
        [selectedLocationBackTarget]="selectedLocationBackTarget"
        [selectedWorldMapLocationName]="selectedWorldMapLocationName"
        [selectedFactionName]="selectedFactionName"
        [selectedRuleName]="selectedRuleName"
        [selectedStateName]="selectedStateName"
        [selectedNpcName]="selectedNpcName"
        [selectedShopName]="selectedShopName"
        [selectedBestiaryId]="selectedBestiaryId"
        [adminEditSession]="adminEditSession"
        [adminLocationDraft]="adminLocationDraft"
        (viewChange)="onViewChange($event)"
        (openAdminEditor)="onOpenAdminEditor($event)"
        (navigateToLocation)="onNavigateToLocation($event.locationName, $event.backTarget)"
        (navigateToWorldMap)="onNavigateToWorldMap($event)"
        (navigateToLore)="onNavigateToLore($event)"
        (navigateToShop)="onNavigateToShop($event)"
        (navigateToNpc)="onNavigateToNpc($event)"
        (navigateToBestiary)="onNavigateToBestiary($event)"
        (navigateToAdminLocationCreator)="onNavigateToAdminLocationCreator($event)"
        (pinSelected)="onPinSelected($event)"
        (locationSelected)="onLocationSelected($event)"
        (npcSelected)="onNpcSelected($event)"
        (creatureSelected)="onCreatureSelected($event)"
        (shopSelected)="onShopSelected($event)"
      ></app-view-host>
    </div>

    @if (showFooterMenu) {
      <nav class="footer-menu" aria-label="Footer navigation">
        <button
          type="button"
          class="footer-btn"
          [class.active]="currentView === 'players'"
          (click)="onViewChange('players')"
          aria-label="Open Player"
        >
          <span class="material-icons" aria-hidden="true">person</span>
          <span class="footer-label">Player</span>
        </button>

        <button
          type="button"
          class="footer-btn"
          [class.active]="currentView === 'talents'"
          (click)="onViewChange('talents')"
          aria-label="Open Talents"
        >
          <span class="material-icons" aria-hidden="true">fitness_center</span>
          <span class="footer-label">Talents</span>
        </button>

        <button
          type="button"
          class="footer-btn"
          [class.active]="currentView === 'shops'"
          (click)="onViewChange('shops')"
          aria-label="Open Shops"
        >
          <span class="material-icons" aria-hidden="true">storefront</span>
          <span class="footer-label">Shops</span>
        </button>

        <button
          type="button"
          class="footer-btn"
          [class.active]="currentView === 'letters'"
          (click)="onViewChange('letters')"
          aria-label="Open Letters"
        >
          <span class="footer-badge" *ngIf="letterUnreadCount > 0">{{ letterUnreadCount }}</span>
          <span class="material-icons" aria-hidden="true">mail</span>
          <span class="footer-label">Letters</span>
        </button>
      </nav>
    }
    </ng-container>

    <ng-template #unauthenticatedGate>
      <app-auth-gateway></app-auth-gateway>
    </ng-template>

    <ng-template #campaignPromptDialog let-campaigns="campaigns" let-select="select">
      <div class="confirmation-dialog campaign-prompt-modal">
        <h3 style="color: #a855f7; margin-bottom: 8px;">Select a Campaign</h3>
        <p style="margin-bottom: 16px; color: #cbd5e1;">Please select a campaign to continue playing in Nebryss Companion:</p>
        <div style="display: flex; flex-direction: column; gap: 8px; max-height: 250px; overflow-y: auto;">
          <button
            *ngFor="let camp of campaigns"
            type="button"
            class="btn-confirm"
            style="background-color: #8b5cf6; width: 100%; text-align: center; margin-bottom: 6px;"
            (click)="select(camp)"
          >
            {{ camp.name }}
          </button>
        </div>
      </div>
    </ng-template>

    <!-- 🎵 Shake-to-Rickroll Easter Egg Overlay -->
    @if (rickrollVisible) {
      <div class="rickroll-overlay" (click)="dismissRickroll()">
        <iframe
          src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&controls=0&loop=1&playlist=dQw4w9WgXcQ"
          allow="autoplay; encrypted-media"
          allowfullscreen
        ></iframe>
        <button class="rickroll-close" (click)="dismissRickroll()" aria-label="Close">
          <span class="material-icons">close</span>
        </button>
      </div>
    }

    <!-- ⚙️ App Settings & Customization Modal -->
    <app-settings-modal
      *ngIf="isSettingsModalOpen"
      (close)="closeSettingsModal()"
    ></app-settings-modal>
  `,
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  @ViewChild('sidebarComp') sidebarComp?: SidebarComponent;
  @ViewChild('campaignPromptDialog') campaignPromptDialogTemplate?: TemplateRef<any>;
  private readonly destroyRef = inject(DestroyRef);

  isSettingsModalOpen = false;
  currentView: AppView = 'players';
  selectedLocationName: string | null = null;
  selectedLocationBackTarget: string | null = null;
  selectedWorldMapLocationName: string | null = null;
  selectedFactionName: string | null = null;
  selectedRuleName: string | null = null;
  selectedStateName: string | null = null;
  selectedNpcName: string | null = null;
  selectedShopName: string | null = null;
  selectedBestiaryId: number | null = null;
  adminEditSession: AdminEditorSession | null = null;
  adminLocationDraft: { mapX: number | null; mapY: number | null; location: Location | null } | null = null;
  letterUnreadCount = 0;
  bestiaryMaterialsCount = 0;
  bestiaryMaterialsSidebarOpen = false;
  rickrollVisible = false;

  // Shake detection state
  private shakeLastX = 0;
  private shakeLastY = 0;
  private shakeLastZ = 0;
  private shakeCooldown = false;
  activePlayer$ = this.activePlayerService.activePlayer$;
  hasAdminAccess$ = this.adminService.hasAdminAccess$;
  isAdmin$ = this.adminService.isAdmin$;

  constructor(
    public themeService: ThemeService,
    public loadingService: LoadingService,
    public adminService: AdminService,
    private toastService: ToastService,
    private dataService: DataService,
    private dialog: MatDialog,
    private activePlayerService: ActivePlayerService,
    private bestiaryMaterialsService: BestiaryMaterialsService,
    private modalService: ModalService,
    public campaignService: CampaignService,
    private navigationHistory: NavigationHistoryService,
    public authService: AuthService
  ) {
    const savedView = localStorage.getItem('lastView');
    this.currentView = this.isValidView(savedView) ? savedView : 'players';

    this.navigationHistory.init(this.getCurrentNavigationState());
    this.navigationHistory.registerRestoreCallback(state => this.restoreNavigationState(state));

    this.navigationHistory.registerModalHandler(() => {
      if (this.isSettingsModalOpen) {
        this.closeSettingsModal();
        return true;
      }
      return false;
    });

    this.navigationHistory.registerModalHandler(() => {
      if (this.rickrollVisible) {
        this.dismissRickroll();
        return true;
      }
      return false;
    });

    this.navigationHistory.registerModalHandler(() => {
      if (this.sidebarComp?.isOpen) {
        this.sidebarComp.isOpen = false;
        return true;
      }
      return false;
    });

    this.navigationHistory.registerModalHandler(() => {
      if (this.modalService.isOpen()) {
        this.modalService.close();
        return true;
      }
      return false;
    });

    this.navigationHistory.registerModalHandler(() => {
      if (this.bestiaryMaterialsService.isOpen) {
        this.bestiaryMaterialsService.close();
        return true;
      }
      return false;
    });

    this.checkAndPromptCampaign();

    this.dataService.getLetters()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();

    combineLatest([this.activePlayerService.activePlayer$, this.dataService.letters$])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([player, letters]) => {
        this.themeService.setActivePlayerSkin(player);

        if (!player) {
          this.letterUnreadCount = 0;
          return;
        }

        this.letterUnreadCount = letters.filter(
          letter => letter.recipientIds.includes(player.id) && !letter.readBy.includes(player.id)
        ).length;
      });

    this.bestiaryMaterialsService.count$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(count => {
        this.bestiaryMaterialsCount = count;
      });

    this.bestiaryMaterialsService.open$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(isOpen => {
        this.bestiaryMaterialsSidebarOpen = isOpen;
      });

    this.initPullToRefreshListeners();
    this.initShakeToRickroll();
  }

  openSettingsModal(): void {
    this.isSettingsModalOpen = true;
  }

  closeSettingsModal(): void {
    this.isSettingsModalOpen = false;
  }

  private shakeCount = 0;
  private lastShakeTime = 0;

  private initShakeToRickroll(): void {
    const SHAKE_THRESHOLD = 50;
    const COOLDOWN_MS = 8000;

    if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) {
      return;
    }

    window.addEventListener('devicemotion', (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc || acc.x == null || acc.y == null || acc.z == null) return;

      const dx = Math.abs(acc.x - this.shakeLastX);
      const dy = Math.abs(acc.y - this.shakeLastY);
      const dz = Math.abs(acc.z - this.shakeLastZ);

      this.shakeLastX = acc.x;
      this.shakeLastY = acc.y;
      this.shakeLastZ = acc.z;

      const now = Date.now();
      if ((dx + dy + dz) > SHAKE_THRESHOLD && !this.shakeCooldown && !this.rickrollVisible) {
        if (now - this.lastShakeTime < 1200) {
          this.shakeCount++;
        } else {
          this.shakeCount = 1;
        }
        this.lastShakeTime = now;

        if (this.shakeCount >= 3) {
          this.rickrollVisible = true;
          this.shakeCooldown = true;
          this.shakeCount = 0;
          setTimeout(() => { this.shakeCooldown = false; }, COOLDOWN_MS);
        }
      }
    });
  }

  dismissRickroll(): void {
    this.rickrollVisible = false;
  }

  private checkAndPromptCampaign(): void {
    if (!this.campaignService.hasCampaignSelected()) {
      setTimeout(() => {
        this.dataService.getCampaigns().subscribe(campaigns => {
          if (campaigns && campaigns.length > 0 && !this.campaignService.hasCampaignSelected() && this.campaignPromptDialogTemplate) {
            const dialogContext = {
              campaigns,
              select: (camp: Campaign) => {
                this.activePlayerService.clearActivePlayer();
                this.campaignService.setSelectedCampaign(camp);
                this.dataService.refreshPlayers().subscribe();
                this.modalService.close();
              }
            };
            this.modalService.openFromTemplate(this.campaignPromptDialogTemplate, dialogContext, { showCloseButton: false });
          }
        });
      }, 300);
    }
  }

  toggleAdminMode(): void {
    const nextState = !this.adminService.isAdmin;
    this.adminService.setAdminStatus(nextState);
    this.toastService.show(
      nextState ? 'Modo GM Activado (Viendo Secretos de Campaña)' : 'Modo Jugador Activado (Secretos Ocultos)',
      'info'
    );
  }

  get showFooterMenu(): boolean {
    if (this.currentView === 'bestiary' || this.currentView === 'aiSessionManager') {
      return false;
    }
    return !this.currentView.startsWith('admin');
  }

  get showHeaderPlayerTitle(): boolean {
    return true;
  }

  get showBestiaryLootButton(): boolean {
    return this.currentView === 'bestiary' && this.bestiaryMaterialsCount > 0;
  }

  get currentViewTitle(): string {
    switch (this.currentView) {
      case 'players': return 'Players';
      case 'bestiary': return 'Bestiary';
      case 'letters': return 'Letters';
      case 'items': return 'Items';
      case 'shops': return 'Shops';
      case 'lore': return 'Lore';
      case 'locations': return 'Locations';
      case 'worldMap': return 'World Map';
      case 'talents': return 'Talents';
      case 'mistEffects': return 'Mist Effects';
      case 'terrains': return 'Terrains';
      case 'mistEngineBattles': return 'Mist Engine';
      case 'weaponRules': return 'Weapon Rules';
      case 'alteredStates': return 'Altered States';
      case 'afflictions': return 'Afflictions';
      case 'shipNavigation': return 'Ship Navigation';
      case 'npcs': return 'NPCs';
      case 'adminItemCreator': return 'Item Admin';
      case 'adminLocationCreator': return 'Location Admin';
      case 'adminPlayerEditor': return 'Player admin';
      case 'adminCreatureEditor': return 'Creature Admin';
      case 'adminCampaignEditor': return 'Campaign Admin';
      case 'adminRulesEditor': return 'Rules Admin';
      case 'adminSessionEditor': return 'Session Admin';
      case 'campaignSessions': return 'Sessions';
      case 'aiSessionManager': return 'AI Session Manager';
      default: return 'Nebryss Companion';
    }
  }

  // Pull to refresh variables
  private pullStartY = 0;
  private isPulling = false;
  private readonly PULL_THRESHOLD = 150; // px to trigger refresh
  private readonly PULL_START_MAX_Y = 32;
  private readonly PULL_ACTIVATION_DISTANCE = 14;
  public pullProgress = 0; // 0 to 1
  public isRefreshing = false;

  get pullIndicatorHeight(): number {
    return Math.min(this.pullProgress * 60, 80);
  }

  get contentTransform(): string {
    // Optional: push content down as we pull
    // return `translateY(${this.pullIndicatorHeight}px)`;
    return 'none'; // Keep content static for now, overlay indicator
  }



  // Detect if we are in standalone PWA mode (iOS or Android)
  private get isStandalone(): boolean {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isIOSStandalone = (window.navigator as any).standalone === true;
    return isStandalone || isIOSStandalone;
  }

  private get isIOSDevice(): boolean {
    const { userAgent, platform, maxTouchPoints } = window.navigator;
    return /iPad|iPhone|iPod/i.test(userAgent)
      || (platform === 'MacIntel' && (maxTouchPoints ?? 0) > 1);
  }

  private resetPullState(resetProgress = true) {
    this.isPulling = false;
    if (resetProgress) {
      this.pullProgress = 0;
    }
  }

  private isInteractiveElement(target: EventTarget | null): boolean {
    return target instanceof Element && !!target.closest(`
      button,
      a,
      input,
      textarea,
      select,
      option,
      label,
      summary,
      [role="button"],
      [contenteditable="true"],
      .table-header,
      .inventory-actions,
      .dropdown-trigger,
      .dropdown-menu,
      .footer-menu,
      .mat-mdc-dialog-surface,
      .modal-content
    `);
  }

  private canStartPullRefresh(event: TouchEvent): boolean {
    // iOS Safari/PWA is prone to canceling taps when a root-level pull gesture
    // starts tracking touches, so keep the custom gesture disabled there.
    if (!this.isStandalone || this.isIOSDevice || this.isRefreshing || event.touches.length !== 1) {
      return false;
    }

    if (window.scrollY > 0) {
      return false;
    }

    const touch = event.touches[0];
    if (touch.clientY > this.PULL_START_MAX_Y) {
      return false;
    }

    return !this.isInteractiveElement(event.target);
  }

  onTouchStart(event: TouchEvent) {
    if (!this.canStartPullRefresh(event)) {
      this.resetPullState();
      return;
    }

    this.pullStartY = event.touches[0].clientY;
    this.isPulling = true;
    this.pullProgress = 0;
  }

  onTouchMove(event: TouchEvent) {
    if (!this.isPulling || this.isRefreshing || event.touches.length !== 1) return;

    const currentY = event.touches[0].clientY;
    const diff = currentY - this.pullStartY;

    if (diff <= 0 || window.scrollY > 0) {
      this.resetPullState();
      return;
    }

    // Ignore tiny finger movement so taps still register normally on iPhone.
    if (diff < this.PULL_ACTIVATION_DISTANCE) {
      this.pullProgress = 0;
      return;
    }

    const activePullDistance = diff - this.PULL_ACTIVATION_DISTANCE;
    this.pullProgress = Math.min(activePullDistance / this.PULL_THRESHOLD, 1.5);
  }

  onTouchEnd() {
    if (this.isPulling && this.pullProgress >= 0.8 && !this.isRefreshing) {
      this.triggerRefresh();
    } else {
      this.resetPullState();
    }
  }

  onTouchCancel() {
    this.resetPullState();
  }

  private initPullToRefreshListeners(): void {
    if (!this.isStandalone || this.isIOSDevice) {
      return;
    }

    const handleTouchStart = (event: TouchEvent) => this.onTouchStart(event);
    const handleTouchMove = (event: TouchEvent) => this.onTouchMove(event);
    const handleTouchEnd = () => this.onTouchEnd();
    const handleTouchCancel = () => this.onTouchCancel();

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    this.destroyRef.onDestroy(() => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchCancel);
    });
  }

  private triggerRefresh() {
    this.isRefreshing = true;
    this.pullProgress = 1; // Keep indicator shown
    this.isPulling = false;

    // Simulate refresh delay then reload
    setTimeout(() => {
      window.location.reload();
    }, 500);
  }

  private isValidView(view: string | null): view is AppView {
    return view !== null && APP_VIEWS.includes(view as AppView);
  }

  getCurrentNavigationState(): AppNavigationSelectionState {
    return {
      view: this.currentView,
      selectedLocationName: this.selectedLocationName,
      selectedLocationBackTarget: this.selectedLocationBackTarget,
      selectedWorldMapLocationName: this.selectedWorldMapLocationName,
      selectedFactionName: this.selectedFactionName,
      selectedRuleName: this.selectedRuleName,
      selectedStateName: this.selectedStateName,
      selectedNpcName: this.selectedNpcName,
      selectedShopName: this.selectedShopName,
      selectedBestiaryId: this.selectedBestiaryId,
      adminEditSession: this.adminEditSession,
      adminLocationDraft: this.adminLocationDraft
    };
  }

  restoreNavigationState(state: AppNavigationSelectionState): void {
    this.currentView = state.view;
    this.selectedLocationName = state.selectedLocationName;
    this.selectedLocationBackTarget = state.selectedLocationBackTarget;
    this.selectedWorldMapLocationName = state.selectedWorldMapLocationName;
    this.selectedFactionName = state.selectedFactionName;
    this.selectedRuleName = state.selectedRuleName;
    this.selectedStateName = state.selectedStateName;
    this.selectedNpcName = state.selectedNpcName;
    this.selectedShopName = state.selectedShopName;
    this.selectedBestiaryId = state.selectedBestiaryId;
    this.adminEditSession = state.adminEditSession;
    this.adminLocationDraft = state.adminLocationDraft;
    localStorage.setItem('lastView', state.view);
    window.scrollTo({ top: 0 });
  }

  onPinSelected(pinName: string | null): void {
    this.selectedWorldMapLocationName = pinName;
    if (pinName) {
      this.navigationHistory.pushState(this.getCurrentNavigationState());
    } else {
      this.navigationHistory.replaceCurrentState(this.getCurrentNavigationState());
    }
  }

  onLocationSelected(locName: string | null): void {
    this.selectedLocationName = locName;
    if (locName) {
      this.navigationHistory.pushState(this.getCurrentNavigationState());
    } else {
      this.navigationHistory.replaceCurrentState(this.getCurrentNavigationState());
    }
  }

  onNpcSelected(npcName: string | null): void {
    this.selectedNpcName = npcName;
    if (npcName) {
      this.navigationHistory.pushState(this.getCurrentNavigationState());
    } else {
      this.navigationHistory.replaceCurrentState(this.getCurrentNavigationState());
    }
  }

  onCreatureSelected(id: number | null): void {
    this.selectedBestiaryId = id;
    if (id) {
      this.navigationHistory.pushState(this.getCurrentNavigationState());
    } else {
      this.navigationHistory.replaceCurrentState(this.getCurrentNavigationState());
    }
  }

  onShopSelected(shopName: string | null): void {
    this.selectedShopName = shopName;
    if (shopName) {
      this.navigationHistory.pushState(this.getCurrentNavigationState());
    } else {
      this.navigationHistory.replaceCurrentState(this.getCurrentNavigationState());
    }
  }

  onViewChange(view: AppView) {
    this.currentView = view;
    if (view === 'adminItemCreator') {
      this.adminEditSession = null;
    }
    if (view === 'adminLocationCreator') {
      this.adminLocationDraft = null;
    }
    this.selectedLocationName = null;
    this.selectedLocationBackTarget = null;
    this.selectedWorldMapLocationName = null;
    this.selectedFactionName = null;
    this.selectedRuleName = null;
    this.selectedStateName = null;
    this.selectedNpcName = null;
    this.selectedShopName = null;
    this.selectedBestiaryId = null;
    if (view !== 'adminLocationCreator') {
      this.adminLocationDraft = null;
    }

    // Save current view
    localStorage.setItem('lastView', view);
    this.navigationHistory.pushState(this.getCurrentNavigationState());
    window.scrollTo({ top: 0 });
  }

  onOpenAdminEditor(session: AdminEditorSession) {
    this.adminEditSession = session;
    if (session.mode === 'shop') {
      this.currentView = 'adminShopEditor';
    } else if (session.mode === 'npc') {
      this.currentView = 'adminNpcEditor';
    } else if (session.mode === 'creature') {
      this.currentView = 'adminCreatureEditor';
    } else if (session.mode === 'session') {
      this.currentView = 'adminSessionEditor';
    } else {
      this.currentView = 'adminItemCreator';
    }
    this.adminLocationDraft = null;
    this.selectedLocationName = null;
    this.selectedLocationBackTarget = null;
    this.selectedWorldMapLocationName = null;
    this.selectedFactionName = null;
    this.selectedRuleName = null;
    this.selectedStateName = null;
    localStorage.setItem('lastView', this.currentView);
    this.navigationHistory.pushState(this.getCurrentNavigationState());
    window.scrollTo({ top: 0 });
  }

  onNavigateToAdminLocationCreator(coords: { mapX: number | null; mapY: number | null; location: Location | null }) {
    this.adminLocationDraft = {
      mapX: coords.mapX,
      mapY: coords.mapY,
      location: coords.location
    };
    this.currentView = 'adminLocationCreator';
    this.selectedLocationName = null;
    this.selectedLocationBackTarget = null;
    this.selectedWorldMapLocationName = null;
    this.selectedFactionName = null;
    this.selectedRuleName = null;
    this.selectedStateName = null;
    localStorage.setItem('lastView', 'adminLocationCreator');
    this.navigationHistory.pushState(this.getCurrentNavigationState());
    window.scrollTo({ top: 0 });
  }

  onNavigateToLocation(locationName: string, backTarget: string | null = null) {
    this.selectedLocationName = locationName;
    this.selectedLocationBackTarget = backTarget;
    this.currentView = 'locations';
    this.selectedWorldMapLocationName = null;
    this.adminLocationDraft = null;
    localStorage.setItem('lastView', 'locations');
    this.navigationHistory.pushState(this.getCurrentNavigationState());
    window.scrollTo({ top: 0 });
  }

  onNavigateToWorldMap(locationName: string) {
    this.selectedWorldMapLocationName = locationName;
    this.currentView = 'worldMap';
    this.selectedLocationName = null;
    this.selectedLocationBackTarget = null;
    this.selectedFactionName = null;
    this.selectedRuleName = null;
    this.selectedStateName = null;
    this.adminLocationDraft = null;
    localStorage.setItem('lastView', 'worldMap');
    this.navigationHistory.pushState(this.getCurrentNavigationState());
    window.scrollTo({ top: 0 });
  }

  onNavigateToLore(factionName: string) {
    this.selectedFactionName = factionName;
    this.currentView = 'lore';
    this.selectedWorldMapLocationName = null;
    this.adminLocationDraft = null;
    localStorage.setItem('lastView', 'lore');
    this.navigationHistory.pushState(this.getCurrentNavigationState());
    window.scrollTo({ top: 0 });
  }

  onNavigateToShop(target: { shopId?: number; shopName?: string } | string) {
    const shopName = typeof target === 'string' ? target : target.shopName || null;
    this.selectedShopName = shopName;
    this.currentView = 'shops';
    localStorage.setItem('lastView', 'shops');
    this.navigationHistory.pushState(this.getCurrentNavigationState());
    window.scrollTo({ top: 0 });
  }

  onNavigateToNpc(target: { npcId?: number; npcName?: string } | string) {
    const npcName = typeof target === 'string' ? target : target.npcName || null;
    this.selectedNpcName = npcName;
    this.currentView = 'npcs';
    localStorage.setItem('lastView', 'npcs');
    this.navigationHistory.pushState(this.getCurrentNavigationState());
    window.scrollTo({ top: 0 });
  }

  onNavigateToBestiary(bestiaryId: number) {
    this.selectedBestiaryId = bestiaryId;
    this.currentView = 'bestiary';
    localStorage.setItem('lastView', 'bestiary');
    this.navigationHistory.pushState(this.getCurrentNavigationState());
    window.scrollTo({ top: 0 });
  }

  toggleBestiaryMaterialsSidebar(): void {
    this.bestiaryMaterialsService.toggle();
  }

  toggleGmMode(): void {
    const nextState = this.adminService.toggleGmMode();
    this.toastService.show(
      nextState ? 'GM Mode ON (Secret Vaults & GM Tools visible)' : 'Player View Active (GM OFF)',
      'info'
    );
  }

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent) {
    const target = event.target as HTMLElement;

    const ruleLink = target.closest('[data-weapon-rule]');
    if (ruleLink) {
      const ruleName = ruleLink.getAttribute('data-weapon-rule');
      if (ruleName) {
        event.preventDefault();
        event.stopPropagation();
        this.openWeaponRuleModal(ruleName);
        return;
      }
    }

    const statusLink = target.closest('[data-status]');
    if (statusLink) {
      const stateName = statusLink.getAttribute('data-status');
      if (stateName) {
        event.preventDefault();
        event.stopPropagation();
        this.navigateToStatus(stateName);
      }
    }
  }

  private openWeaponRuleModal(ruleName: string) {
    this.dataService.getAllData().subscribe(data => {
      void import('./weapon-rule/weapon-rule.component').then(({ WeaponRuleDialogComponent }) => {
        const rule = data.weaponRules.find((r: any) => r.name === ruleName);

        if (!rule) {
          const fallbackRule = {
            name: ruleName,
            description: 'Rule definition not found'
          };

          const dialogRef = this.dialog.open(WeaponRuleDialogComponent, {
            data: { rule: fallbackRule },
            panelClass: 'image-dialog-container',
            hasBackdrop: true,
            backdropClass: 'image-dialog-backdrop',
            disableClose: true
          });
          setTimeout(() => {
            dialogRef.disableClose = false;
          }, 0);
          return;
        }

        let name = rule.name;
        let description = rule.effect;

        const statusMatches = [...new Set((description || '').match(/\/status\/:\d+\//g))];
        const statusEntries: string[] = [];

        if (statusMatches) {
          statusMatches.forEach(match => {
            const statusId = parseInt(match.replace('/status/:', '').replace('/', ''));
            const status = data.alteredStates.find((s: any) => s.id === statusId);

            if (status) {
              const link = `<span class="status-link" data-status="${status.name}">${status.name}</span>`;
              description = description.replace(new RegExp(match, 'g'), link);
              statusEntries.push(`<strong><span class="status-link" data-status="${status.name}">${status.name}</span></strong>: ${status.effect}`);
            }
          });
        }

        if (statusEntries.length > 0) {
          description += '\n\n' + statusEntries.map(entry => `<em>${entry}</em>`).join('\n\n');
        }

        const ruleDisplay = { name, description };

        const dialogRef = this.dialog.open(WeaponRuleDialogComponent, {
          data: { rule: ruleDisplay },
          panelClass: 'image-dialog-container',
          hasBackdrop: true,
          backdropClass: 'image-dialog-backdrop',
          disableClose: true
        });
        setTimeout(() => {
          dialogRef.disableClose = false;
        }, 0);
      });
    });
  }

  navigateToStatus(stateName: string) {
    this.selectedStateName = stateName;
    this.currentView = 'alteredStates';
    localStorage.setItem('lastView', 'alteredStates');
    this.navigationHistory.pushState(this.getCurrentNavigationState());
  }
}
