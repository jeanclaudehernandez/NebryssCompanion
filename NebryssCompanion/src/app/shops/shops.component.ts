import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../data.service';
import { WeaponTableComponent } from '../weapon-table/weapon-table.component';
import { GenericTableComponent } from '../generic-table/generic-table.component';

@Component({
  selector: 'app-shops',
  standalone: true,
  imports: [CommonModule, WeaponTableComponent, GenericTableComponent],
  templateUrl: './shops.component.html',
  styleUrls: ['./shops.component.css']
})
export class ShopsComponent {
  selectedCreatureId: number | null = null;
  selectedCreature: any = null;
  factions: string[] = [];
  selectedFaction: string = "null";
  filteredCreatures: any[] = [];
  itemsData: any;
  weaponsData: any;
  weaponRulesData: any[] = [];
  itemsCategories: any[] = [];
  shops: any[] = [];
  npcs: any [] = [];
  isLoading = true;
  shopCategories: any[] = [];

  constructor(private dataService: DataService) {}

  ngOnInit() {
    this.dataService.getAllData().subscribe(response => {
      this.itemsData = response.items;
      this.weaponsData = response.weapons;
      this.weaponRulesData = response.weaponRules;
      this.shops = response.shops;
      this.itemsCategories = response.itemCategories;
    });
  }

  getOwnerName(owner: number) {
    return this.dataService.getNpcByd(owner).name;
  }

  getWeaponIds(shop: any) {
    return this.dataService.getShopWeapons(shop.id).map((shopItem) => shopItem.id);
  }

  hasWeapons(shop: any) {
    return this.dataService.getShopWeapons(shop.id).length;
  }

  hasItems(shop: any) {
    return this.dataService.getShopItems(shop.id).length;
  }

  findCategory(categoryId: string) {
    return this.itemsCategories.filter((category) => category.id === categoryId)[0];
  }

  getShopItemsWithPrices(shop: any, categoryKey: string) {
    return this.dataService.getShopItems(shop.id).map((shopItem) => {
      const itemInfo = this.dataService.getItemById(shopItem.id);
      console.log(itemInfo),
      console.log(categoryKey)
      return {
        ...shopItem,
        ...itemInfo
      };
    }).filter((shopItem) => String(shopItem.itemCategory) == String(categoryKey));
  }
}