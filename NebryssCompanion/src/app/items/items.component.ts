import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../data.service';
import { WeaponTableComponent } from '../weapon-table/weapon-table.component';
import { GenericTableComponent } from '../generic-table/generic-table.component';

@Component({
  selector: 'app-items',
  standalone: true,
  imports: [CommonModule, WeaponTableComponent, GenericTableComponent],
  template: `
    <div class="items-container">
      <!-- Weapons Section -->
      <h2>Weapons</h2>
      <app-weapon-table 
        [weaponIds]="allWeaponIds" 
        [weaponsData]="weaponsData" 
        [weaponRulesData]="weaponRules"
        [displayPrice]="true"
        [displayBody]="true"></app-weapon-table>

      <!-- Other Items Sections -->
      <div *ngFor="let category of itemCategories">
        <app-generic-table 
          [title]="category.name"
          [data]="itemsData[category.key] || []"
          [headers]="category.headers"
          [headerKeys]="category.keys">
        </app-generic-table>
      </div>
    </div>
  `,
  styleUrls: ['./items.component.css']
})
export class ItemsComponent {
  itemsData: any = {};
  weaponsData: any = {};
  weaponRules: any[] = [];
  allWeaponIds: number[] = [];

  itemCategories = [
    { 
      name: 'Armor', 
      key: 'armor',
      headers: ['Name', 'Price', 'Description', 'Race Requirement'],
      keys: ['name', 'price', 'description', 'raceReq']
    },
    { 
      name: 'Consumables', 
      key: 'consumables',
      headers: ['Name', 'Price', 'Description'],
      keys: ['name', 'price', 'description']
    },
    { 
      name: 'Ammunition', 
      key: 'ammunition',
      headers: ['Name', 'Price', 'Quantity', 'Type', 'Description'],
      keys: ['name', 'price', 'quantity', 'type', 'description']
    },
    { 
      name: 'Mist Engines', 
      key: 'mistEngines',
      headers: ['Name', 'Price', 'Optimal Conditions', 'Max Speed', 'Max Weight'],
      keys: ['name', 'price', 'optimalConditions', 'maxSpeed', 'maxWeight']
    },
    { 
      name: 'Ship Hulls', 
      key: 'shipHulls',
      headers: ['Name', 'Price', 'Weight', 'Ship Wounds', 'Defense', 'Max Cargo'],
      keys: ['name', 'price', 'weight', 'shipWounds', 'defense', 'maxCargo']
    },
    { 
      name: 'Cannons', 
      key: 'cannons',
      headers: ['Name', 'Price', 'Ammo Type', 'Weight'],
      keys: ['name', 'price', 'ammoType', 'weight']
    },
    { 
      name: 'Cannonballs', 
      key: 'cannonballs',
      headers: ['Name', 'Price', 'Damage'],
      keys: ['name', 'price', 'damage']
    },
    { 
      name: 'Deployables', 
      key: 'deployables',
      headers: ['Name', 'Type', 'Description'],
      keys: ['name', 'type', 'description']
    }
  ];

  constructor(private dataService: DataService) {}

  ngOnInit() {
    this.dataService.getAllData().subscribe(data => {
      // Load items
      this.itemsData = data.items;
      
      // Load weapons
      this.weaponsData = data.weapons;
      this.weaponRules = data.weaponRules;
      
      // Get all weapon IDs
      const allWeapons = [
        ...(data.weapons.melee || []),
        ...(data.weapons.ranged || [])
      ];
      this.allWeaponIds = allWeapons.map(w => w.id);
    });
  }
}