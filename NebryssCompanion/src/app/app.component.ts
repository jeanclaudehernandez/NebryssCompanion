import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { PlayerListComponent } from './player-list/player-list.component';
import { SidebarComponent } from './sidebar/sidebar.component';
import { DataService } from './data.service';
import { BestiaryComponent } from './bestiary/bestiary.component';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    HttpClientModule,
    PlayerListComponent,
    SidebarComponent,
    FormsModule,
    BestiaryComponent
  ],
  template: `
    <app-sidebar (viewChange)="onViewChange($event)"></app-sidebar>
    
    <div class="content-area">
      <app-player-list *ngIf="currentView === 'players'"></app-player-list>
      <app-bestiary *ngIf="currentView === 'bestiary'"></app-bestiary>
    </div>
  `,
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  currentView: 'players' | 'bestiary' = 'players';

  constructor() {}

  onViewChange(view: 'players' | 'bestiary') {
    this.currentView = view;
  }
}