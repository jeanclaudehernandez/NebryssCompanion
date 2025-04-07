import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../data.service';
import { WeaponTableComponent } from '../weapon-table/weapon-table.component';
import { GenericTableComponent } from '../generic-table/generic-table.component';
import { ScrollNavComponent } from '../scroll-nav/scroll-nav.component';
import { BestiaryEntry, ItemCategory, Items, NPC, Player, ScrollSection, Shop, Weapon, WeaponRule } from '../model';
import { ActivePlayerService } from '../active-player.service';

@Component({
  selector: 'app-shops',
  standalone: true,
  imports: [
    CommonModule,
    WeaponTableComponent,
    GenericTableComponent,
    ScrollNavComponent
  ],
  templateUrl: './shops.component.html',
  styleUrls: ['./shops.component.css']
})
export class ShopsComponent {
  selectedCreatureId: number | null = null;
  selectedCreature: BestiaryEntry | Player | null= null;
  factions: string[] = [];
  selectedFaction: string = "null";
  itemsData!: Items;
  weaponsData: Weapon[] = [];
  weaponRulesData: WeaponRule[] = [];
  itemsCategories: ItemCategory[] = [];
  shops: Shop[] = [];
  npcs: NPC[] = [];
  isLoading = true;
  scrollSections: ScrollSection[] = [];

  constructor(
    private dataService: DataService,
    private activePlayerService: ActivePlayerService
  ) {}

  ngOnInit() {
    this.dataService.getAllData().subscribe(response => {
      this.itemsData = response.items;
      this.weaponsData = response.weapons;
      this.weaponRulesData = response.weaponRules;
      this.shops = response.shops;
      this.itemsCategories = response.itemCategories;
      this.scrollSections = this.shops.map(shop => ({
        title: shop.name,
        id: `shop-${shop.id}`
      }));
    });
  }

  getOwnerName(owner: number) {
    return this.dataService.getNpcByd(owner).name;
  }

  getWeaponIds(shop: Shop) {
    return this.dataService.getShopWeapons(shop.id).map((shopItem) => shopItem.id);
  }

  hasWeapons(shop: Shop) {
    return this.dataService.getShopWeapons(shop.id).length;
  }

  hasItems(shop: Shop) {
    return this.dataService.getShopItems(shop.id).length;
  }

  findCategory(categoryId: number) {
    return this.itemsCategories.filter((category) => category.id === categoryId)[0];
  }

  getShopItemsWithPrices(shop: Shop, categoryKey: string) {
    const shopItems = this.dataService.getShopItems(shop.id).map((shopItem) => {
      const itemInfo = this.dataService.getItemById(shopItem.id);
      return {
        ...shopItem,
        ...itemInfo
      };
    }).filter((shopItem) => String(shopItem.type) == String(categoryKey));
    
    // Check if we have an active player
    const activePlayer = this.activePlayerService.activePlayer;
    if (!activePlayer || !activePlayer.items || !activePlayer.items.length) {
      return shopItems;
    }
    
    // Map player's item IDs for quick lookup
    const playerItemIds = new Set(activePlayer.items.map(item => item.id));
    
    // Sort the items - player owned items first
    return shopItems.sort((a, b) => {
      const aOwned = a.id !== undefined && playerItemIds.has(a.id) ? 1 : 0;
      const bOwned = b.id !== undefined && playerItemIds.has(b.id) ? 1 : 0;
      return bOwned - aOwned; // Sort descending so owned items come first
    });
  }

  isWeaponCollapsed(shopId: number): boolean {
    const saved = localStorage.getItem(`shop-${shopId}-weapons-collapsed`);
    return saved ? JSON.parse(saved) : true;
  }

  toggleWeaponCollapse(shopId: number): void {
    const newState = !this.isWeaponCollapsed(shopId);
    localStorage.setItem(`shop-${shopId}-weapons-collapsed`, JSON.stringify(newState));
  }

  hasActivePlayer(): boolean {
    return this.activePlayerService.activePlayer !== null;
  }
}