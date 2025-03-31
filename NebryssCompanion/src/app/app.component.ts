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
    LoreComponent
  ],
  template: `
    <app-sidebar (viewChange)="onViewChange($event)"></app-sidebar>
    
    <div class="content-area">
      <app-player-list *ngIf="currentView === 'players'"></app-player-list>
      <app-bestiary *ngIf="currentView === 'bestiary'"></app-bestiary>
      <app-items *ngIf="currentView === 'items'"></app-items>
      <app-shops *ngIf="currentView === 'shops'"></app-shops>
      <app-lore *ngIf="currentView === 'lore'"></app-lore>
    </div>
  `,
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  currentView: 'players' | 'bestiary' | 'items' | 'shops' | 'lore' = 'players';

  constructor() {}

  onViewChange(view: 'players' | 'bestiary' | 'items' | 'shops' | 'lore') {
    this.currentView = view;
  }
}