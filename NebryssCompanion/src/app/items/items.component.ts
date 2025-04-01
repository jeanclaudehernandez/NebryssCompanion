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
      <div class="weapons-section">
        <h2 (click)="toggleWeaponsCollapsed()" style="cursor: pointer; margin-left: 50px;">
          Weapons {{ weaponsCollapsed ? '▶' : '▼' }}
        </h2>
        <div *ngIf="!weaponsCollapsed">
          <app-weapon-table 
            [weaponIds]="allWeaponIds" 
            [weaponsData]="weaponsData" 
            [weaponRulesData]="weaponRules"
            [displayPrice]="true"
            [displayBody]="true"></app-weapon-table>
        </div>
      </div>

      <div *ngFor="let category of itemCategories">
        <app-generic-table 
          [storageKey]="'items-category-' + category.key"
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
  weaponsData: any[] = [];
  weaponRules: any[] = [];
  allWeaponIds: number[] = [];
  itemCategories: any[] = [];
  weaponsCollapsed = true;
  

  constructor(private dataService: DataService) {}

  ngOnInit() {
    this.dataService.getAllData().subscribe(data => {
      this.itemsData = data.items;
      
      this.weaponsData = data.weapons;
      this.weaponRules = data.weaponRules;
      this.itemCategories = data.itemCategories;
      this.allWeaponIds = this.weaponsData.map(w => w.id);
      const saved = localStorage.getItem('items-weapons-collapsed');
      this.weaponsCollapsed = saved ? JSON.parse(saved) : true;
    });
  }

  toggleWeaponsCollapsed() {
    this.weaponsCollapsed = !this.weaponsCollapsed;
    localStorage.setItem('items-weapons-collapsed', JSON.stringify(this.weaponsCollapsed));
  }
}