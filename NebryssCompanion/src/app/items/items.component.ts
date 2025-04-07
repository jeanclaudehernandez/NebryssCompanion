import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../data.service';
import { WeaponTableComponent } from '../weapon-table/weapon-table.component';
import { GenericTableComponent } from '../generic-table/generic-table.component';
import { Items, Weapon, WeaponRule, ItemCategory, ScrollSection, AlteredState } from '../model';
import { ScrollNavComponent } from '../scroll-nav/scroll-nav.component';
import { ActivePlayerService } from '../active-player.service';

@Component({
  selector: 'app-items',
  standalone: true,
  imports: [CommonModule, WeaponTableComponent, GenericTableComponent, ScrollNavComponent],
  template: `
    <div class="items-container">
      <div class="weapons-section" [id]="'weapon'">
        <h2 (click)="toggleWeaponsCollapsed()" style="cursor: pointer; margin-left: 50px;">
          Weapons {{ weaponsCollapsed ? '▶' : '▼' }}
        </h2>
        <div *ngIf="!weaponsCollapsed">
          <app-weapon-table 
            [weaponIds]="allWeaponIds" 
            [weaponsData]="weaponsData" 
            [weaponRulesData]="weaponRules"
            [alteredStates]="alteredStates"
            [displayPrice]="true"
            [displayBody]="true"
            [inventoryManagement]="hasActivePlayer()"></app-weapon-table>
        </div>
      </div>

      <div *ngFor="let category of itemCategories" [id]='category.key'>
        <app-generic-table 
          [storageKey]="'items-category-' + category.key"
          [title]="category.name"
          [data]="getCategoryData(category.key)"
          [headers]="category.headers"
          [headerKeys]="category.keys"
          [inventoryManagement]="hasActivePlayer()">
        </app-generic-table>
      </div>
    </div>
    <app-scroll-nav [sections]="scrollSections"></app-scroll-nav>
  `,
  styleUrls: ['./items.component.css']
})
export class ItemsComponent implements OnInit {
  itemsData!: Items; // Use Items interface
  weaponsData: Weapon[] = [];
  weaponRules: WeaponRule[] = [];
  itemCategories: ItemCategory[] = [];
  alteredStates: AlteredState[] = [];
  allWeaponIds: number[] = [];
  weaponsCollapsed = true;
  scrollSections: ScrollSection[] = [];
  

  constructor(
    private dataService: DataService,
    private activePlayerService: ActivePlayerService
  ) {}

  ngOnInit() {
    this.dataService.getAllData().subscribe(data => {
      this.itemsData = data.items;
      
      this.weaponsData = data.weapons;
      this.weaponRules = data.weaponRules;
      this.alteredStates = data.alteredStates;
      this.itemCategories = data.itemCategories;
      this.allWeaponIds = this.weaponsData.map(w => w.id);
      const saved = localStorage.getItem('items-weapons-collapsed');
      this.weaponsCollapsed = saved ? JSON.parse(saved) : true;
      this.scrollSections = [
        {
          id: 'weapon',
          title: 'Weapons',
        },
        ...this.itemCategories.map((category: ItemCategory) => {
          return {
            id: category.key,
            title: category.name
          }
        })
      ]
    });
  }

  toggleWeaponsCollapsed() {
    this.weaponsCollapsed = !this.weaponsCollapsed;
    localStorage.setItem('items-weapons-collapsed', JSON.stringify(this.weaponsCollapsed));
  }

  getCategoryData(key: string): any[] {
    // Get the base items
    const items = this.itemsData[key as keyof Items] || [];
    
    // Check if we have an active player
    const activePlayer = this.activePlayerService.activePlayer;
    if (!activePlayer || !activePlayer.items || !activePlayer.items.length) {
      return items;
    }
    
    // Map player's item IDs for quick lookup
    const playerItemIds = new Set(activePlayer.items.map(item => item.id));
    
    // Sort the items - player owned items first
    return [...items].sort((a, b) => {
      const aOwned = a.id !== undefined && playerItemIds.has(a.id) ? 1 : 0;
      const bOwned = b.id !== undefined && playerItemIds.has(b.id) ? 1 : 0;
      return bOwned - aOwned; // Sort descending so owned items come first
    });
  }

  hasActivePlayer(): boolean {
    return this.activePlayerService.activePlayer !== null;
  }
}