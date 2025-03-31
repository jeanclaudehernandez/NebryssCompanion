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

      <div *ngIf="currentView === 'bestiary'" class="bestiary-select-container">
        <h2>Select Bestiary Creature</h2>
      
        <!-- Faction Dropdown -->
        <div class="filter-group">
          <label>Faction:</label>
          <select [(ngModel)]="selectedFaction" (change)="onFactionSelected()">
            <option [value]="null">All Factions</option>
            <option *ngFor="let faction of factions" [value]="faction">
              {{ faction }}
            </option>
          </select>
        </div>

        <!-- Creature Dropdown -->
        <div class="filter-group">
          <label>Creature:</label>
          <select [(ngModel)]="selectedCreatureId" (change)="onCreatureSelected()">
            <option [value]="null">Select a creature</option>
            <option *ngFor="let creature of filteredCreatures" [value]="creature.id">
              {{ creature.name }} ({{ creature.subgroup }})
            </option>
          </select>
        </div>
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
  factions: string[] = [];
  selectedFaction: string = "null";
  filteredCreatures: any[] = [];

  constructor(private dataService: DataService) {}

  ngOnInit() {
    this.dataService.getAllData().subscribe(response => {
      this.bestiary = response.bestiary;
      this.itemsData = response.items;
      this.weaponsData = response.weapons;
      this.weaponRulesData = response.weaponRules;
      this.factions = this.getUniqueFactions(response.bestiary);      
      this.onFactionSelected();
    });
  }

  private getUniqueFactions(creatures: any[]): string[] {
    return [...new Set(creatures.map(c => c.faction))].sort();
  }

  onFactionSelected() {
    if (this.selectedFaction != 'null') {
      this.filteredCreatures = this.bestiary.filter(c => c.faction === this.selectedFaction);
    } else {
      this.filteredCreatures = this.bestiary.map((c) => c);
    }
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