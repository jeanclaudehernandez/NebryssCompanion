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
    AlteredStatesPageComponent
  ],
  template: `
    @if (loadingService.loading$ | async) {
      <div class="loading-overlay">
        <div class="spinner"></div>
      </div>
    }
    <app-sidebar (viewChange)="onViewChange($event)"></app-sidebar>
    
    <div class="content-area" #contentArea>
      @if (currentView === 'players') {
        <app-player-list></app-player-list>
      }
      @if (currentView === 'bestiary') {
        <app-bestiary></app-bestiary>
      }
      @if (currentView === 'items') {
        <app-items></app-items>
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
    </div>
  `,
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  currentView: 'players' | 'bestiary' | 'items' | 'shops' | 'lore' | 'locations' | 'talents' | 'mistEffects' | 'terrains' | 'mistEngineBattles' | 'weaponRules' | 'alteredStates' = 'players';
  selectedLocationName: string | null = null;
  selectedFactionName: string | null = null;
  selectedRuleName: string | null = null;
  selectedStateName: string | null = null;

  constructor(
    private themeService: ThemeService,
    public loadingService: LoadingService,
    private dataService: DataService,
    private dialog: MatDialog
  ) {
    const savedView = localStorage.getItem('lastView');
    this.currentView = this.isValidView(savedView) ? savedView : 'players';
  }

  private isValidView(view: string | null): view is AppComponent['currentView'] {
    return view !== null && 
      ['players', 'bestiary', 'items', 'shops', 'lore', 'locations', 'talents', 'mistEffects', 'terrains', 'mistEngineBattles', 'weaponRules', 'alteredStates'].includes(view);
  }

  onViewChange(view: 'players' | 'bestiary' | 'items' | 'shops' | 'lore' | 'locations' | 'talents' | 'mistEffects' | 'terrains' | 'mistEngineBattles' | 'weaponRules' | 'alteredStates') {
    this.currentView = view;
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
