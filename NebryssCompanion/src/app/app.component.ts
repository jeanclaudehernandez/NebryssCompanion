import { Component, DestroyRef, HostListener, inject } from '@angular/core';
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

  @Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    HttpClientModule,
    SidebarComponent,
    AppViewHostComponent
  ],
  template: `
    <!-- Top App Bar Header -->
    <header class="app-header">
      <button type="button" class="header-action-btn" (click)="$event.stopPropagation(); sidebarComp.toggleMenu()" aria-label="Open navigation menu">
        <span class="material-icons">menu</span>
      </button>

      <h1 class="header-title">{{ currentViewTitle }}</h1>

      <div class="header-actions">
        @if (showHeaderPlayerTitle) {
          <div class="active-player-chip" *ngIf="activePlayer$ | async as player" (click)="onViewChange('players')" title="Active Player">
            <span class="material-icons chip-icon">person</span>
            <span class="chip-name">{{ player.name }}</span>
          </div>
        }

        <button type="button" class="header-action-btn" (click)="themeService.toggleTheme()" [attr.aria-label]="(themeService.darkMode$ | async) ? 'Light mode' : 'Dark mode'">
          <span class="material-icons">{{ (themeService.darkMode$ | async) ? 'light_mode' : 'dark_mode' }}</span>
        </button>
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
    <app-sidebar #sidebarComp (viewChange)="onViewChange($event)"></app-sidebar>
    
    <div class="content-area" #contentArea [style.transform]="contentTransform" [class.content-area-no-footer]="!showFooterMenu">
      <app-view-host
        [view]="currentView"
        [selectedLocationName]="selectedLocationName"
        [selectedLocationBackTarget]="selectedLocationBackTarget"
        [selectedFactionName]="selectedFactionName"
        [selectedRuleName]="selectedRuleName"
        [selectedStateName]="selectedStateName"
        [adminEditSession]="adminEditSession"
        [adminLocationDraft]="adminLocationDraft"
        (viewChange)="onViewChange($event)"
        (openAdminEditor)="onOpenAdminEditor($event)"
        (navigateToLocation)="onNavigateToLocation($event.locationName, $event.backTarget)"
        (navigateToLore)="onNavigateToLore($event)"
        (navigateToAdminLocationCreator)="onNavigateToAdminLocationCreator($event)"
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
          [class.active]="currentView === 'letters'"
          (click)="onViewChange('letters')"
          aria-label="Open Letters"
        >
          <span class="footer-badge" *ngIf="letterUnreadCount > 0">{{ letterUnreadCount }}</span>
          <span class="material-icons" aria-hidden="true">mail</span>
          <span class="footer-label">Letters</span>
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
      </nav>
    }
  `,
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  private readonly destroyRef = inject(DestroyRef);

  currentView: AppView = 'players';
  selectedLocationName: string | null = null;
  selectedLocationBackTarget: string | null = null;
  selectedFactionName: string | null = null;
  selectedRuleName: string | null = null;
  selectedStateName: string | null = null;
  adminEditSession: AdminEditorSession | null = null;
  adminLocationDraft: { mapX: number | null; mapY: number | null } | null = null;
  letterUnreadCount = 0;
  activePlayer$ = this.activePlayerService.activePlayer$;

  get showFooterMenu(): boolean {
    return this.currentView !== 'bestiary';
  }

  get showHeaderPlayerTitle(): boolean {
    return this.currentView !== 'bestiary';
  }

  get currentViewTitle(): string {
    switch (this.currentView) {
      case 'players': return 'Players';
      case 'bestiary': return 'Bestiary';
      case 'letters': return 'Letters';
      case 'items': return 'Items & Equipment';
      case 'shops': return 'Shops';
      case 'lore': return 'Lore & Factions';
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
      case 'adminItemCreator': return 'Item Creator';
      case 'adminLocationCreator': return 'Location Creator';
      case 'adminPlayerEditor': return 'Player Editor';
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

  constructor(
    public themeService: ThemeService,
    public loadingService: LoadingService,
    private dataService: DataService,
    private dialog: MatDialog,
    private activePlayerService: ActivePlayerService
  ) {
    const savedView = localStorage.getItem('lastView');
    this.currentView = this.isValidView(savedView) ? savedView : 'players';

    this.dataService.getLetters()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();

    combineLatest([this.activePlayerService.activePlayer$, this.dataService.letters$])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([player, letters]) => {
        if (!player) {
          this.letterUnreadCount = 0;
          return;
        }

        this.letterUnreadCount = letters.filter(
          letter => letter.recipientIds.includes(player.id) && !letter.readBy.includes(player.id)
        ).length;
      });
  }

  // Detect if we are in standalone PWA mode (iOS or Android)
  private get isStandalone(): boolean {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isIOSStandalone = (window.navigator as any).standalone === true;
    return isStandalone || isIOSStandalone;
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
    if (!this.isStandalone || this.isRefreshing || event.touches.length !== 1) {
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

  @HostListener('touchstart', ['$event'])
  onTouchStart(event: TouchEvent) {
    if (!this.canStartPullRefresh(event)) {
      this.resetPullState();
      return;
    }

    this.pullStartY = event.touches[0].clientY;
    this.isPulling = true;
    this.pullProgress = 0;
  }

  @HostListener('touchmove', ['$event'])
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

  @HostListener('touchend')
  onTouchEnd() {
    if (this.isPulling && this.pullProgress >= 0.8 && !this.isRefreshing) {
       this.triggerRefresh();
    } else {
       this.resetPullState();
    }
  }

  @HostListener('touchcancel')
  onTouchCancel() {
    this.resetPullState();
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

  onViewChange(view: AppView) {
    this.currentView = view;
    if (view === 'adminItemCreator') {
      this.adminEditSession = null;
    }
    if (view === 'adminLocationCreator') {
      this.adminLocationDraft = null;
    }
    // Reset selectedLocationName when manually changing views, unless we are navigating specifically
    // Ideally this logic should be more granular, but for now this is fine.
    // Actually, if we just clicked sidebar, we probably want to reset it.
    // But if it's coming from LocationsComponent navigating to Shops, we don't need to reset it (it's for Locations component input).
    // Let's just set it to null here, and have a separate method for location navigation.
    this.selectedLocationName = null;
    this.selectedLocationBackTarget = null;
    this.selectedFactionName = null;
    this.selectedRuleName = null;
    this.selectedStateName = null;
    if (view !== 'adminLocationCreator') {
      this.adminLocationDraft = null;
    }
    
    // Save current view
    localStorage.setItem('lastView', view);
    window.scrollTo({ top: 0 });
  }

  onOpenAdminEditor(session: AdminEditorSession) {
    this.adminEditSession = session;
    this.currentView = 'adminItemCreator';
    this.adminLocationDraft = null;
    this.selectedLocationName = null;
    this.selectedLocationBackTarget = null;
    this.selectedFactionName = null;
    this.selectedRuleName = null;
    this.selectedStateName = null;
    localStorage.setItem('lastView', 'adminItemCreator');
    window.scrollTo({ top: 0 });
  }

  onNavigateToAdminLocationCreator(coords: { mapX: number; mapY: number }) {
    this.adminLocationDraft = {
      mapX: coords.mapX,
      mapY: coords.mapY
    };
    this.currentView = 'adminLocationCreator';
    this.selectedLocationName = null;
    this.selectedLocationBackTarget = null;
    this.selectedFactionName = null;
    this.selectedRuleName = null;
    this.selectedStateName = null;
    localStorage.setItem('lastView', 'adminLocationCreator');
    window.scrollTo({ top: 0 });
  }

  onNavigateToLocation(locationName: string, backTarget: string | null = null) {
    this.selectedLocationName = locationName;
    this.selectedLocationBackTarget = backTarget;
    this.currentView = 'locations';
    this.adminLocationDraft = null;
    localStorage.setItem('lastView', 'locations');
    window.scrollTo({ top: 0 });
  }

  onNavigateToLore(factionName: string) {
    this.selectedFactionName = factionName;
    this.currentView = 'lore';
    this.adminLocationDraft = null;
    localStorage.setItem('lastView', 'lore');
    window.scrollTo({ top: 0 });
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
  }
}
