import { Component } from '@angular/core';
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
    MistEffectsComponent
  ],
  template: `
    <app-sidebar (viewChange)="onViewChange($event)"></app-sidebar>
    
    <div class="content-area" #contentArea>
      <app-player-list *ngIf="currentView === 'players'"></app-player-list>
      <app-bestiary *ngIf="currentView === 'bestiary'"></app-bestiary>
      <app-items *ngIf="currentView === 'items'"></app-items>
      <app-shops *ngIf="currentView === 'shops'"></app-shops>
      <app-lore *ngIf="currentView === 'lore'"></app-lore>
      <app-locations *ngIf="currentView === 'locations'"></app-locations>
      <app-talents *ngIf="currentView === 'talents'"></app-talents>
      <app-mist-effects *ngIf="currentView === 'mistEffects'"></app-mist-effects>
    </div>
  `,
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  currentView: 'players' | 'bestiary' | 'items' | 'shops' | 'lore' | 'locations' | 'talents' | 'mistEffects' = 'players';

  constructor(private themeService: ThemeService) {
    const savedView = localStorage.getItem('lastView');
    this.currentView = this.isValidView(savedView) ? savedView : 'players';
  }

  private isValidView(view: string | null): view is AppComponent['currentView'] {
    return view !== null && 
      ['players', 'bestiary', 'items', 'shops', 'lore', 'locations', 'talents', 'mistEffects'].includes(view);
  }

  onViewChange(view: 'players' | 'bestiary' | 'items' | 'shops' | 'lore' | 'locations' | 'talents' | 'mistEffects') {
    this.currentView = view;
    localStorage.setItem('lastView', view);
    window.scrollTo({ top: 0 });
  }
}