import { Component, OnDestroy, OnInit, ViewEncapsulation, Output, EventEmitter, TemplateRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../data.service';
import { WeaponTableComponent } from '../weapon-table/weapon-table.component';
import { GenericTableComponent } from '../generic-table/generic-table.component';
import { ScrollNavComponent } from '../scroll-nav/scroll-nav.component';
import { ImageViewerComponent } from '../image-viewer/image-viewer.component';
import { BestiaryEntry, ItemCategory, Items, NPC, Player, ScrollSection, Shop, Weapon, WeaponRule, AlteredState } from '../model';
import { ActivePlayerService } from '../active-player.service';
import { ThemeService } from '../theme.service';
import { Subscription } from 'rxjs';

import { MatTooltipModule } from '@angular/material/tooltip';
import { ToastService } from '../toast.service';
import { ModalService } from '../modal.service';

export interface CartItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
  type: 'item' | 'weapon';
}

@Component({
  selector: 'app-shops',
  standalone: true,
  imports: [
    CommonModule,
    WeaponTableComponent,
    GenericTableComponent,
    ScrollNavComponent,
    ImageViewerComponent,
    MatTooltipModule
  ],
  templateUrl: './shops.component.html',
  styleUrls: ['./shops.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class ShopsComponent implements OnInit, OnDestroy {
  @Output() navigateToLocation = new EventEmitter<string>();
  selectedCreatureId: number | null = null;
  selectedCreature: BestiaryEntry | Player | null= null;
  factions: string[] = [];
  selectedFaction: string = "null";
  itemsData!: Items;
  weaponsData: Weapon[] = [];
  weaponRulesData: WeaponRule[] = [];
  alteredStates: AlteredState[] = [];
  itemsCategories: ItemCategory[] = [];
  shops: Shop[] = [];
  npcs: NPC[] = [];
  isLoading = true;
  scrollSections: ScrollSection[] = [];
  isDarkMode: boolean = false;
  private themeSubscription: Subscription = new Subscription();

  // Shopping Cart
  cart: { [shopId: number]: CartItem[] } = {};
  showCartSidebar: boolean = false;
  
  @ViewChild('confirmPurchaseModal') confirmPurchaseModal!: TemplateRef<any>;
  pendingTransaction: { shopId: number, method: 'digital' | 'physical' } | null = null;

  constructor(
    private dataService: DataService,
    private activePlayerService: ActivePlayerService,
    private themeService: ThemeService,
    private toastService: ToastService,
    private modalService: ModalService
  ) {}

  ngOnInit() {
    this.themeSubscription = this.themeService.darkMode$.subscribe(isDark => {
      this.isDarkMode = isDark;
    });
    
    this.dataService.getAllData().subscribe(response => {
      this.itemsData = response.items;
      this.weaponsData = response.weapons;
      this.weaponRulesData = response.weaponRules;
      this.alteredStates = response.alteredStates;
      this.shops = response.shops;
      this.itemsCategories = response.itemCategories;
      this.scrollSections = this.shops.map(shop => ({
        title: shop.name,
        id: `shop-${shop.id}`
      }));
    });
  }

  ngOnDestroy() {
    this.themeSubscription.unsubscribe();
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

  onLocationClick(locationName: string) {
    this.navigateToLocation.emit(locationName);
  }

  hasActivePlayer(): boolean {
    return this.activePlayerService.activePlayer !== null;
  }

  toggleCartSidebar() {
    this.showCartSidebar = !this.showCartSidebar;
  }

  get cartItemsCount(): number {
    let count = 0;
    Object.values(this.cart).forEach(items => {
      items.forEach(item => count += item.quantity);
    });
    return count;
  }

  get cartShopIds(): number[] {
    return Object.keys(this.cart).map(Number);
  }

  getShopName(shopId: number): string {
    const shop = this.shops.find(s => s.id === shopId);
    return shop ? shop.name : 'Unknown Shop';
  }

  getShopTotal(shopId: number): number {
    return this.cart[shopId]?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || 0;
  }

  onAddToCart(data: any, shopId: number, type: 'item' | 'weapon') {
    if (!this.cart[shopId]) {
      this.cart[shopId] = [];
    }

    let itemToAdd: CartItem;

    if (type === 'item') {
      // data is the item object
      const existingItem = this.cart[shopId].find(i => i.id === data.id && i.type === 'item');
      if (existingItem) {
        existingItem.quantity++;
        return;
      }
      
      itemToAdd = {
        id: data.id,
        name: data.name,
        price: data.price || 0,
        quantity: 1,
        type: 'item'
      };
    } else {
      // data is the weapon ID
      const weaponId = data;
      const existingItem = this.cart[shopId].find(i => i.id === weaponId && i.type === 'weapon');
      if (existingItem) {
        existingItem.quantity++;
        return;
      }

      const weapon = this.weaponsData.find(w => w.id === weaponId);
      if (!weapon) return;

      itemToAdd = {
        id: weaponId,
        name: weapon.name,
        price: weapon.price || 0,
        quantity: 1,
        type: 'weapon'
      };
    }

    this.cart[shopId].push(itemToAdd);
    // Auto-open sidebar on first add? Maybe not, usually annoying.
    // User requested "blue button... when clicked added... when user opens shopping cart..."
  }

  removeFromCart(item: CartItem, shopId: number) {
    const shopCart = this.cart[shopId];
    if (!shopCart) return;

    const index = shopCart.findIndex(i => i.id === item.id && i.type === item.type);
    if (index === -1) return;

    if (shopCart[index].quantity > 1) {
      shopCart[index].quantity--;
    } else {
      shopCart.splice(index, 1);
      if (shopCart.length === 0) {
        delete this.cart[shopId];
      }
    }
  }

  canPay(shopId: number, method: 'digital' | 'physical'): { allowed: boolean, reason: string } {
    const shop = this.shops.find(s => s.id === shopId);
    if (!shop) return { allowed: false, reason: 'Shop not found' };

    // Check if shop accepts payment method
    if (!shop.paymentMethod || !shop.paymentMethod[method]) {
      return { allowed: false, reason: "Shop doesn't accept this payment method" };
    }

    const player = this.activePlayerService.activePlayer;
    if (!player) return { allowed: false, reason: 'No active player' };

    // Check if player has enough funds
    const totalCost = this.getShopTotal(shopId);
    const playerFunds = player.progression?.mistrals?.[method] || 0;

    if (playerFunds < totalCost) {
      return { allowed: false, reason: "You don't have enough mistrals in that payment method" };
    }

    return { allowed: true, reason: 'Purchase' };
  }

  processPayment(shopId: number, method: 'digital' | 'physical') {
    const status = this.canPay(shopId, method);
    if (!status.allowed) return;

    const player = this.activePlayerService.activePlayer;
    if (!player) return;

    const totalCost = this.getShopTotal(shopId);
    
    // Store pending transaction
    this.pendingTransaction = { shopId, method };

    // Open modal
    const currentBalance = player.progression?.mistrals?.[method] || 0;
    this.modalService.openFromTemplate(this.confirmPurchaseModal, {
      $implicit: {
        items: this.cart[shopId],
        totalCost,
        method,
        currentBalance,
        remainingBalance: currentBalance - totalCost
      }
    });
  }

  confirmPurchase() {
    if (!this.pendingTransaction) return;
    this.executePayment(this.pendingTransaction.shopId, this.pendingTransaction.method);
    this.modalService.close();
    this.pendingTransaction = null;
  }

  cancelPurchase() {
    this.modalService.close();
    this.pendingTransaction = null;
  }

  private executePayment(shopId: number, method: 'digital' | 'physical') {
    const player = this.activePlayerService.activePlayer;
    if (!player) return;

    const totalCost = this.getShopTotal(shopId);
    const shopCart = this.cart[shopId];
    if (!shopCart || shopCart.length === 0) return;

    // Deduct funds
    if (!player.progression) {
      player.progression = { 
        talentPoints: 0, 
        mistrals: { digital: 0, physical: 0 }, 
        talents: [] 
      };
    }
    if (!player.progression.mistrals) {
      player.progression.mistrals = { digital: 0, physical: 0 };
    }
    
    player.progression.mistrals[method] -= totalCost;

    // Add items to inventory
    if (!player.items) player.items = [];
    if (!player.weapons) player.weapons = [];

    shopCart.forEach(cartItem => {
      if (cartItem.type === 'item') {
        const existingItem = player.items.find(i => i.id === cartItem.id);
        if (existingItem) {
          existingItem.quant += cartItem.quantity;
        } else {
          player.items.push({
            id: cartItem.id,
            quant: cartItem.quantity
          });
        }
      } else if (cartItem.type === 'weapon') {
        // Weapons are unique by ID in current system
        if (!player.weapons.includes(cartItem.id)) {
          player.weapons.push(cartItem.id);
        }
        // If they bought multiple of the same weapon, we currently ignore the extras
        // as the player.weapons array is just IDs.
        // We could log a warning or show a toast if they bought duplicates.
      }
    });

    // Save player
    this.activePlayerService.updateActivePlayer({ ...player });
    
    // Clear cart for this shop
    delete this.cart[shopId];

    // Close sidebar if no carts remain
    if (Object.keys(this.cart).length === 0) {
      this.showCartSidebar = false;
    }

    this.toastService.show(`Purchased items for ${totalCost} ${method} mistrals`, 'success');
  }
}