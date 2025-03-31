import { Component } from '@angular/core';
import { CommonModule, JsonPipe } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { PlayerListComponent } from './player-list/player-list.component';
import { SidebarComponent } from './sidebar/sidebar.component';
import { DataService } from './data.service';
import { PlayerDetailComponent } from './player-detail/player-detail.component';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    HttpClientModule,
    PlayerListComponent,
    SidebarComponent,
    PlayerDetailComponent,
    FormsModule,
    JsonPipe
  ],
  template: `
    <app-sidebar (viewChange)="onViewChange($event)"></app-sidebar>
    
    <div class="content-area">
      <!-- Players View -->
      <app-player-list *ngIf="currentView === 'players'"></app-player-list>

      <!-- Bestiary Selection -->
      <div *ngIf="currentView === 'bestiary'" class="bestiary-select-container">
        <h2>Select Bestiary Creature</h2>
        <select [(ngModel)]="selectedCreatureId" (change)="onCreatureSelected()">
          <option [value]="null">Select a creature</option>
          <option *ngFor="let creature of bestiary" [value]="creature.id">
            {{ creature.name }} ({{ creature.faction }})
          </option>
        </select>
      </div>
      <!-- Creature Detail View -->
      <app-player-detail 
        *ngIf="selectedCreature"
        [character]="selectedCreature"
        [weaponsData]="weaponsData"
        [characterType]="'mob'"
        [itemsData]="itemsData"
        [weaponRulesData]="weaponRulesData">
      </app-player-detail>
    </div>
  `,
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  currentView: 'players' | 'bestiary' = 'players';
  bestiary: any[] = [];
  selectedCreatureId: number | null = null;
  selectedCreature: any = null;
  weaponsData: any;
  itemsData: any;
  weaponRulesData: any[] = [];
  menuOpen = false;

  constructor(private dataService: DataService) {}

  ngOnInit() {
    this.dataService.getAllData().subscribe(response => {
      this.bestiary = response.bestiary;
      this.itemsData = response.items;
      this.weaponsData = response.weapons;
      this.weaponRulesData = response.weaponRules
    });
  }

  onViewChange(view: 'players' | 'bestiary') {
    this.currentView = view;
    this.selectedCreature = null; // Reset selected creature when switching views
    this.menuOpen = view === 'bestiary';
  }

  onCreatureSelected() {
    if (this.selectedCreatureId) {
      this.selectedCreature = this.bestiary.find(c => c.id === Number(this.selectedCreatureId));
      this.dataService.getWeapons().subscribe(weapons => {
        this.weaponsData = weapons;
      });
    }
  }
}