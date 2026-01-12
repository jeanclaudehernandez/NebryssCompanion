import { Component, ChangeDetectionStrategy } from '@angular/core';
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
import { ThemeService } from './theme.service';

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
    MistEngineBattlesComponent
  ],
  template: `
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
        <app-lore></app-lore>
      }
      @if (currentView === 'locations') {
        <app-locations (navigateTo)="onViewChange($event)" [initialLocationName]="selectedLocationName"></app-locations>
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
    </div>
  `,
  styleUrls: ['./app.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {
  currentView: 'players' | 'bestiary' | 'items' | 'shops' | 'lore' | 'locations' | 'talents' | 'mistEffects' | 'terrains' | 'mistEngineBattles' = 'players';
  selectedLocationName: string | null = null;

  constructor(private themeService: ThemeService) {
    const savedView = localStorage.getItem('lastView');
    this.currentView = this.isValidView(savedView) ? savedView : 'players';
  }

  private isValidView(view: string | null): view is AppComponent['currentView'] {
    return view !== null && 
      ['players', 'bestiary', 'items', 'shops', 'lore', 'locations', 'talents', 'mistEffects', 'terrains', 'mistEngineBattles'].includes(view);
  }

  onViewChange(view: 'players' | 'bestiary' | 'items' | 'shops' | 'lore' | 'locations' | 'talents' | 'mistEffects' | 'terrains' | 'mistEngineBattles') {
    this.currentView = view;
    // Reset selectedLocationName when manually changing views, unless we are navigating specifically
    // Ideally this logic should be more granular, but for now this is fine.
    // Actually, if we just clicked sidebar, we probably want to reset it.
    // But if it's coming from LocationsComponent navigating to Shops, we don't need to reset it (it's for Locations component input).
    // Let's just set it to null here, and have a separate method for location navigation.
    this.selectedLocationName = null;
    localStorage.setItem('lastView', view);
    window.scrollTo({ top: 0 });
  }

  onNavigateToLocation(locationName: string) {
    this.selectedLocationName = locationName;
    this.currentView = 'locations';
    localStorage.setItem('lastView', 'locations');
    window.scrollTo({ top: 0 });
  }
}