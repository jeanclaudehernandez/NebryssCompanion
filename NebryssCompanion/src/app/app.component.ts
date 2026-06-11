import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { PlayerListComponent } from './player-list/player-list.component';
import { SidebarComponent } from './sidebar/sidebar.component';
import { DataService } from './data.service';
import { BestiaryComponent } from './bestiary/bestiary.component';
import { FormsModule } from '@angular/forms';
import { ItemsComponent } from './items/items.component';
import { ShopsComponent } from './shops/shops.component';
import { LoreComponent } from './lore/lore.component';
import { LocationsComponent } from './locations/locations.component';
import { TalentsComponent } from './talents/talents.component';
import { MistEffectsComponent } from './mist-effects/mist-effects.component';
import { TerrainsComponent } from './terrains/terrains.component';
import { MistEngineBattlesComponent } from './mist-engine-battles/mist-engine-battles.component';
import { WeaponRulesPageComponent } from './weapon-rules-page/weapon-rules-page.component';
import { AlteredStatesPageComponent } from './altered-states-page/altered-states-page.component';
import { ThemeService } from './theme.service';
import { LoadingService } from './loading.service';
import { MatDialog } from '@angular/material/dialog';
import { WeaponRuleDialogComponent } from './weapon-rule/weapon-rule.component';
import { WeaponRule } from './model';
import { AfflictionsListComponent } from './afflictions-list/afflictions-list.component';
import { ShipNavigationComponent } from './ship-navigation/ship-navigation.component';
import { ItemAdminPageComponent } from './item-admin-page/item-admin-page.component';
import { AdminEditorSession } from './admin-editor.models';

  @Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    HttpClientModule,
    ItemsComponent,
    PlayerListComponent,
    SidebarComponent,
    FormsModule,
    BestiaryComponent,
    ShopsComponent,
    LoreComponent,
    LocationsComponent,
    TalentsComponent,
    MistEffectsComponent,
    TerrainsComponent,
    MistEngineBattlesComponent,
    WeaponRulesPageComponent,
    AlteredStatesPageComponent,
    AfflictionsListComponent,
    ShipNavigationComponent,
    ItemAdminPageComponent
  ],
  template: `
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
    <app-sidebar (viewChange)="onViewChange($event)"></app-sidebar>
    
    <div class="content-area" #contentArea [style.transform]="contentTransform">
      @if (currentView === 'players') {
        <app-player-list></app-player-list>
      }
      @if (currentView === 'bestiary') {
        <app-bestiary></app-bestiary>
      }
      @if (currentView === 'items') {
        <app-items (openAdminEditor)="onOpenAdminEditor($event)"></app-items>
      }
      @if (currentView === 'shops') {
        <app-shops (navigateToLocation)="onNavigateToLocation($event)"></app-shops>
      }
      @if (currentView === 'lore') {
        <app-lore (navigateToLocation)="onNavigateToLocation($event)" [initialFactionName]="selectedFactionName"></app-lore>
      }
      @if (currentView === 'locations') {
        <app-locations (navigateTo)="onViewChange($event)" (navigateToLore)="onNavigateToLore($event)" [initialLocationName]="selectedLocationName"></app-locations>
      }
      @if (currentView === 'talents') {
        <app-talents></app-talents>
      }
      @if (currentView === 'mistEffects') {
        <app-mist-effects></app-mist-effects>
      }
      @if (currentView === 'terrains') {
        <app-terrains></app-terrains>
      }
      @if (currentView === 'mistEngineBattles') {
        <app-mist-engine-battles></app-mist-engine-battles>
      }
      @if (currentView === 'weaponRules') {
        <app-weapon-rules-page [initialRuleName]="selectedRuleName"></app-weapon-rules-page>
      }
      @if (currentView === 'alteredStates') {
        <app-altered-states-page [initialStateName]="selectedStateName"></app-altered-states-page>
      }
      @if (currentView === 'shipNavigation') {
        <app-ship-navigation></app-ship-navigation>
      }
      @if (currentView === 'afflictions') {
        <app-afflictions-list></app-afflictions-list>
      }
      @if (currentView === 'adminItemCreator') {
        <app-item-admin-page [editSession]="adminEditSession"></app-item-admin-page>
      }
    </div>

    <nav class="footer-menu" aria-label="Footer menu">
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

      <div class="footer-spacer" aria-hidden="true"></div>

      <button
        type="button"
        class="footer-btn footer-btn-center"
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
        [class.active]="currentView === 'shops'"
        (click)="onViewChange('shops')"
        aria-label="Open Shops"
      >
        <span class="material-icons" aria-hidden="true">storefront</span>
        <span class="footer-label">Shops</span>
      </button>
    </nav>
  `,
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  currentView: 'players' | 'bestiary' | 'items' | 'shops' | 'lore' | 'locations' | 'talents' | 'mistEffects' | 'terrains' | 'mistEngineBattles' | 'weaponRules' | 'alteredStates' | 'afflictions' | 'shipNavigation' | 'adminItemCreator' = 'players';
  selectedLocationName: string | null = null;
  selectedFactionName: string | null = null;
  selectedRuleName: string | null = null;
  selectedStateName: string | null = null;
  adminEditSession: AdminEditorSession | null = null;

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
    private themeService: ThemeService,
    public loadingService: LoadingService,
    private dataService: DataService,
    private dialog: MatDialog
  ) {
    const savedView = localStorage.getItem('lastView');
    this.currentView = this.isValidView(savedView) ? savedView : 'players';
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

  private isValidView(view: string | null): view is AppComponent['currentView'] {
    return view !== null && 
      ['players', 'bestiary', 'items', 'shops', 'lore', 'locations', 'talents', 'mistEffects', 'terrains', 'mistEngineBattles', 'weaponRules', 'alteredStates', 'afflictions', 'shipNavigation', 'adminItemCreator'].includes(view);
  }

  onViewChange(view: 'players' | 'bestiary' | 'items' | 'shops' | 'lore' | 'locations' | 'talents' | 'mistEffects' | 'terrains' | 'mistEngineBattles' | 'weaponRules' | 'alteredStates' | 'afflictions' | 'shipNavigation' | 'adminItemCreator') {
    this.currentView = view;
    if (view === 'adminItemCreator') {
      this.adminEditSession = null;
    }
    // Reset selectedLocationName when manually changing views, unless we are navigating specifically
    // Ideally this logic should be more granular, but for now this is fine.
    // Actually, if we just clicked sidebar, we probably want to reset it.
    // But if it's coming from LocationsComponent navigating to Shops, we don't need to reset it (it's for Locations component input).
    // Let's just set it to null here, and have a separate method for location navigation.
    this.selectedLocationName = null;
    this.selectedFactionName = null;
    this.selectedRuleName = null;
    this.selectedStateName = null;
    
    // Save current view
    localStorage.setItem('lastView', view);
    window.scrollTo({ top: 0 });
  }

  onOpenAdminEditor(session: AdminEditorSession) {
    this.adminEditSession = session;
    this.currentView = 'adminItemCreator';
    this.selectedLocationName = null;
    this.selectedFactionName = null;
    this.selectedRuleName = null;
    this.selectedStateName = null;
    localStorage.setItem('lastView', 'adminItemCreator');
    window.scrollTo({ top: 0 });
  }

  onNavigateToLocation(locationName: string) {
    this.selectedLocationName = locationName;
    this.currentView = 'locations';
    localStorage.setItem('lastView', 'locations');
    window.scrollTo({ top: 0 });
  }

  onNavigateToLore(factionName: string) {
    this.selectedFactionName = factionName;
    this.currentView = 'lore';
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
  }

  navigateToStatus(stateName: string) {
    this.selectedStateName = stateName;
    this.currentView = 'alteredStates';
  }
}
