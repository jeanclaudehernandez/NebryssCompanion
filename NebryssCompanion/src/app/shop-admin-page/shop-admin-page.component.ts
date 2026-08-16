import { CommonModule } from '@angular/common';
import { Component, DestroyRef, Input, OnChanges, OnInit, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DataService } from '../data.service';
import { AdminService } from '../admin.service';
import { ToastService } from '../toast.service';
import { Item, ItemCategory, Location, NPC, Shop, ShopItem, Weapon, WeaponRule, AlteredState } from '../model';
import { forkJoin } from 'rxjs';
import { WeaponTableComponent } from '../weapon-table/weapon-table.component';
import { GenericTableComponent } from '../generic-table/generic-table.component';
import { NavigationHistoryService } from '../navigation-history.service';

export interface LocationShopGroup {
  locationName: string;
  shops: Shop[];
}

/** Price-edit modal state */
export interface PriceEditTarget {
  shopItem: ShopItem;
  name: string;
  basePrice: number;
  tempPrice: number;
}

@Component({
  selector: 'app-shop-admin-page',
  standalone: true,
  imports: [CommonModule, FormsModule, WeaponTableComponent, GenericTableComponent],
  templateUrl: './shop-admin-page.component.html',
  styleUrls: ['./shop-admin-page.component.css']
})
export class ShopAdminPageComponent implements OnInit, OnChanges {
  @Input() initialShop: Shop | null = null;

  private readonly destroyRef = inject(DestroyRef);
  private readonly dataService = inject(DataService);
  private readonly adminService = inject(AdminService);
  private readonly toastService = inject(ToastService);
  private readonly navigationHistory = inject(NavigationHistoryService);

  isAdmin = false;
  isLoading = true;
  isSaving = false;
  isDeleting = false;
  showDeleteConfirm = false;

  // Location group collapse state (collapsed by default)
  expandedLocations = new Set<string>();

  shops: Shop[] = [];
  npcs: NPC[] = [];
  factions: Array<{ id: number; name: string }> = [];
  locations: Location[] = [];
  itemsList: Item[] = [];
  weaponsList: Weapon[] = [];
  itemCategories: ItemCategory[] = [];
  weaponRules: WeaponRule[] = [];
  alteredStates: AlteredState[] = [];

  searchTerm = '';
  selectedShopId: number | null = null;

  // Picker & Item Adding State
  pickerSearchTerm = '';
  pickerTypeFilter: 'item' | 'weapon' = 'weapon';

  // Price-edit modal
  priceEdit: PriceEditTarget | null = null;

  // Form Fields
  id: number | null = null;
  name = '';
  ownerId: number | null = null;
  locationId: number | null = null;
  locationName = '';
  location = '';
  description = '';
  discovered = true;
  imgUrl = '';
  thumbnail = '';
  paymentDigital = true;
  paymentPhysical = true;

  // Items for sale in this shop (source of truth)
  shopItems: ShopItem[] = [];

  get filteredShops(): Shop[] {
    if (!this.searchTerm.trim()) return this.shops;
    const term = this.searchTerm.toLowerCase();
    return this.shops.filter(s =>
      s.name.toLowerCase().includes(term) ||
      (s.location && s.location.toLowerCase().includes(term)) ||
      (s.locationName && s.locationName.toLowerCase().includes(term))
    );
  }

  /**
   * Group shops by location (locationName || location || 'Unassigned Location')
   */
  get groupedShops(): LocationShopGroup[] {
    const map = new Map<string, Shop[]>();
    for (const shop of this.filteredShops) {
      const loc = (shop.locationName || shop.location || 'Unassigned Location').trim();
      if (!map.has(loc)) {
        map.set(loc, []);
      }
      map.get(loc)!.push(shop);
    }

    const result: LocationShopGroup[] = [];
    map.forEach((shops, locationName) => {
      result.push({ locationName, shops });
    });

    // Sort location groups alphabetically
    result.sort((a, b) => a.locationName.localeCompare(b.locationName));
    return result;
  }

  isLocationExpanded(locName: string): boolean {
    // If user is searching, auto-expand so they can see results instantly
    if (this.searchTerm.trim().length > 0) return true;
    const saved = localStorage.getItem(`shop-admin-loc-${locName}-expanded`);
    if (saved !== null) {
      return JSON.parse(saved);
    }
    return false;
  }

  toggleLocationGroup(locName: string): void {
    const currentlyExpanded = this.isLocationExpanded(locName);
    const newState = !currentlyExpanded;
    if (newState) {
      this.expandedLocations.add(locName);
    } else {
      this.expandedLocations.delete(locName);
    }
    try {
      localStorage.setItem(`shop-admin-loc-${locName}-expanded`, JSON.stringify(newState));
    } catch {}
  }

  get isInventoryCollapsed(): boolean {
    const saved = localStorage.getItem('shop-admin-inv-collapsed');
    return saved !== null ? JSON.parse(saved) : true;
  }

  toggleInventoryCollapse(): void {
    const newState = !this.isInventoryCollapsed;
    localStorage.setItem('shop-admin-inv-collapsed', JSON.stringify(newState));
  }

  get isPickerCollapsed(): boolean {
    const saved = localStorage.getItem('shop-admin-picker-collapsed');
    return saved !== null ? JSON.parse(saved) : true;
  }

  togglePickerCollapse(): void {
    const newState = !this.isPickerCollapsed;
    localStorage.setItem('shop-admin-picker-collapsed', JSON.stringify(newState));
  }

  get isEditing(): boolean {
    return this.id !== null;
  }

  get canSubmit(): boolean {
    if (!this.isAdmin || this.isSaving || this.isDeleting) {
      return false;
    }
    return !!this.name.trim() && this.ownerId !== null && Number(this.ownerId) > 0;
  }

  get canDelete(): boolean {
    return this.isAdmin && this.isEditing && !this.isSaving && !this.isDeleting && this.id !== null;
  }

  // ── For Sale: weapons with shop prices applied ──────────────────────────────

  /** IDs of weapons currently in shop */
  get shopWeaponIds(): number[] {
    return this.shopItems.filter(si => si.type === 'weapon').map(si => si.id);
  }

  /**
   * Weapons for the "for sale" table, with shop-specific prices applied.
   * WeaponTableComponent shows price from weapon.price, so we override it here.
   */
  get shopWeaponsWithPrices(): Weapon[] {
    return this.shopItems
      .filter(si => si.type === 'weapon')
      .map(si => {
        const base = this.weaponsList.find(w => w.id === si.id);
        if (!base) return null;
        return { ...base, price: si.price };
      })
      .filter((w): w is Weapon => w !== null);
  }

  // ── For Sale: items by category with shop prices applied ─────────────────────

  /** Item categories that have at least one item currently in shop */
  get shopItemCategories(): Array<{ category: ItemCategory; data: any[] }> {
    const shopNonWeapons = this.shopItems.filter(si => si.type !== 'weapon');

    return this.itemCategories.map(cat => {
      const data = shopNonWeapons
        .filter(si => {
          const itemDef = this.itemsList.find(i => i.id === si.id);
          return itemDef?.type === cat.key;
        })
        .map(si => {
          const itemDef = this.itemsList.find(i => i.id === si.id);
          if (!itemDef) return null;
          // Override price with shop-specific price
          return { ...itemDef, price: si.price };
        })
        .filter((x): x is any => x !== null);

      return { category: cat, data };
    }).filter(c => c.data.length > 0);
  }

  // ── Catalog picker ──────────────────────────────────────────────────────────

  get catalogWeaponIds(): number[] {
    const addedWeaponIds = new Set(
      this.shopItems.filter(si => si.type === 'weapon').map(si => si.id)
    );
    const filtered = this.weaponsList.filter(w => {
      if (addedWeaponIds.has(w.id)) return false;
      if (this.pickerSearchTerm.trim()) {
        return w.name?.toLowerCase().includes(this.pickerSearchTerm.toLowerCase());
      }
      return true;
    });
    return filtered.map(w => w.id);
  }

  get catalogItemCategories(): Array<{ category: ItemCategory; data: any[] }> {
    const addedItemIds = new Set(
      this.shopItems.filter(si => si.type !== 'weapon').map(si => si.id)
    );
    const term = this.pickerSearchTerm.toLowerCase().trim();

    return this.itemCategories.map(cat => {
      const data = this.itemsList
        .filter(item => {
          if (item.type !== cat.key) return false;
          if (typeof item.id === 'number' && addedItemIds.has(item.id)) return false;
          if (term && !item.name?.toLowerCase().includes(term)) return false;
          return true;
        });
      return { category: cat, data };
    }).filter(c => c.data.length > 0);
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.navigationHistory.registerModalHandler(() => {
      if (this.priceEdit) {
        this.priceEdit = null;
        return true;
      }
      if (this.showDeleteConfirm) {
        this.showDeleteConfirm = false;
        return true;
      }
      return false;
    }, this.destroyRef);

    this.adminService.isAdmin$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(isAdmin => {
        this.isAdmin = isAdmin;
      });
    this.loadAllData();
    this.dataService.shops$
      ?.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(shops => {
        if (shops) {
          this.shops = shops;
          if (this.selectedShopId) {
            const updatedSelected = this.shops.find(s => s.id === this.selectedShopId);
            if (updatedSelected) {
              this.populateForm(updatedSelected);
            }
          }
        }
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialShop'] && this.initialShop) {
      this.populateForm(this.initialShop);
    }
  }

  loadAllData(): void {
    this.isLoading = true;
    forkJoin({
      shops: this.dataService.getShops(),
      npcs: this.dataService.getNpcs(),
      lore: this.dataService.getLore(),
      locations: this.dataService.getLocations(),
      items: this.dataService.getItems(),
      weapons: this.dataService.getWeapons(),
      itemCategories: this.dataService.getitemCategories(),
      weaponRules: this.dataService.getWeaponRules(),
      alteredStates: this.dataService.getAlteredStates()
    }).subscribe({
      next: res => {
        this.shops = res.shops || [];
        this.npcs = res.npcs || [];
        this.factions = res.lore?.factions || [];
        this.locations = res.locations?.locations || [];
        this.itemsList = res.items?.items || [];
        this.weaponsList = res.weapons || [];
        this.itemCategories = res.itemCategories || [];
        this.weaponRules = res.weaponRules || [];
        this.alteredStates = res.alteredStates || [];
        this.isLoading = false;

        if (this.initialShop) {
          this.populateForm(this.initialShop);
        } else if (this.shops.length > 0 && this.id === null) {
          this.populateForm(this.shops[0]);
        }
      },
      error: err => {
        this.isLoading = false;
        this.toastService.show(`Failed to load shop editor data: ${err?.message || err}`, 'error');
      }
    });
  }

  getNpcOwnerDescription(npc: NPC): string {
    const factionObj = this.factions.find(f => f.id === npc.factionId);
    const factionName = factionObj ? factionObj.name : '';
    const desc = npc.role || npc.description || npc.personality || npc.mission || (factionName ? `${factionName} - ${npc.subgroup}` : npc.subgroup);
    if (!desc) return 'NPC';
    return desc.length > 60 ? desc.substring(0, 60) + '...' : desc;
  }

  onWorldMapLocationSelect(locationIdVal: number | string): void {
    const locId = Number(locationIdVal);
    const selectedLoc = this.locations.find(l => l.id === locId);
    if (selectedLoc) {
      this.locationId = selectedLoc.id;
      this.locationName = selectedLoc.name;
      if (!this.location || this.location === this.locationName) {
        this.location = `${selectedLoc.name} Sky Bazaar`;
      }
    }
  }

  selectShop(shop: Shop): void {
    this.populateForm(shop);
  }

  startNewShop(): void {
    this.id = null;
    this.name = '';
    this.ownerId = this.npcs.length > 0 ? this.npcs[0].id : null;
    if (this.locations.length > 0) {
      this.locationId = this.locations[0].id;
      this.locationName = this.locations[0].name;
      this.location = `${this.locations[0].name} Sky Bazaar`;
    } else {
      this.locationId = null;
      this.locationName = '';
      this.location = '';
    }
    this.description = '';
    this.discovered = true;
    this.imgUrl = '';
    this.thumbnail = '';
    this.paymentDigital = true;
    this.paymentPhysical = true;
    this.shopItems = [];
    this.priceEdit = null;
    this.selectedShopId = null;
    this.showDeleteConfirm = false;
  }

  populateForm(shop: Shop): void {
    this.id = shop.id;
    this.selectedShopId = shop.id;
    this.name = shop.name || '';
    this.ownerId = shop.owner;
    this.locationId = shop.locationId ?? null;
    this.locationName = shop.locationName || '';
    this.location = shop.location || '';
    this.description = shop.description || '';
    this.discovered = shop.discovered !== false;
    this.imgUrl = shop.imgUrl || '';
    this.thumbnail = shop.thumbnail || '';
    this.paymentDigital = shop.paymentMethod?.digital ?? true;
    this.paymentPhysical = shop.paymentMethod?.physical ?? true;
    this.shopItems = (shop.items || []).map(i => ({ ...i }));
    this.priceEdit = null;
    this.showDeleteConfirm = false;

    // Expand location group of selected shop
    const loc = (shop.locationName || shop.location || 'Unassigned Location').trim();
    this.expandedLocations.add(loc);
  }

  // ── Catalog: Add items to shop ───────────────────────────────────────────────

  /** WeaponTable clone button → add weapon to shop */
  onAddWeaponFromCatalog(weapon: Weapon): void {
    if (this.shopItems.some(si => si.id === weapon.id && si.type === 'weapon')) {
      this.toastService.show('Weapon is already in this shop!', 'info');
      return;
    }
    this.shopItems = [...this.shopItems, { id: weapon.id, price: weapon.price ?? 0, type: 'weapon' }];
    this.toastService.show(`${weapon.name} added to shop!`, 'success');
  }

  /** GenericTable customAdd button → add item to shop */
  onAddItemFromCatalog(item: any): void {
    const itemId = item.id;
    if (typeof itemId !== 'number') return;
    if (this.shopItems.some(si => si.id === itemId && si.type !== 'weapon')) {
      this.toastService.show('Item is already in this shop!', 'info');
      return;
    }
    this.shopItems = [...this.shopItems, { id: itemId, price: item.price ?? 0, type: item.type || 'item' }];
    this.toastService.show(`${item.name} added to shop!`, 'success');
  }

  // ── For-sale table: Remove ────────────────────────────────────────────────────

  /** WeaponTable delete button → remove weapon from shop */
  onRemoveWeaponFromShop(weapon: Weapon): void {
    this.shopItems = this.shopItems.filter(si => !(si.id === weapon.id && si.type === 'weapon'));
    this.toastService.show(`${weapon.name} removed from shop.`, 'info');
  }

  /** GenericTable delete button → remove item from shop */
  onRemoveItemFromShop(item: any): void {
    this.shopItems = this.shopItems.filter(si => !(si.id === item.id && si.type !== 'weapon'));
    this.toastService.show(`${item.name} removed from shop.`, 'info');
  }

  // ── For-sale table: Price editing ───────────────────────────────────────────

  /** WeaponTable edit button → open price modal for that weapon */
  onEditWeaponPrice(weapon: Weapon): void {
    const shopItem = this.shopItems.find(si => si.id === weapon.id && si.type === 'weapon');
    if (!shopItem) return;
    const baseWeapon = this.weaponsList.find(w => w.id === weapon.id);
    this.priceEdit = {
      shopItem,
      name: weapon.name,
      basePrice: baseWeapon?.price ?? 0,
      tempPrice: shopItem.price
    };
  }

  /** GenericTable edit button → open price modal for that item */
  onEditItemPrice(item: any): void {
    const shopItem = this.shopItems.find(si => si.id === item.id && si.type !== 'weapon');
    if (!shopItem) return;
    const baseItem = this.itemsList.find(i => i.id === item.id);
    this.priceEdit = {
      shopItem,
      name: item.name,
      basePrice: baseItem?.price ?? 0,
      tempPrice: shopItem.price
    };
  }

  confirmPriceEdit(): void {
    if (!this.priceEdit) return;
    this.priceEdit.shopItem.price = Number(this.priceEdit.tempPrice);
    // Force re-evaluation of computed getters by creating a new array reference
    this.shopItems = [...this.shopItems];
    this.toastService.show(`Price for "${this.priceEdit.name}" set to ◈${this.priceEdit.tempPrice}`, 'success');
    this.priceEdit = null;
  }

  cancelPriceEdit(): void {
    this.priceEdit = null;
  }

  resetToBasePrice(): void {
    if (!this.priceEdit) return;
    this.priceEdit.tempPrice = this.priceEdit.basePrice;
  }

  // ── Save / Delete ─────────────────────────────────────────────────────────────

  saveShop(): void {
    if (!this.isAdmin) {
      this.toastService.show('Admin privileges required to manage shops.', 'error');
      return;
    }
    if (!this.name.trim()) {
      this.toastService.show('Shop Name is required.', 'error');
      return;
    }
    if (!this.ownerId || Number(this.ownerId) <= 0) {
      this.toastService.show('Owner NPC must be selected.', 'error');
      return;
    }

    if (!this.canSubmit) {
      return;
    }

    this.isSaving = true;

    // Collect all category IDs present in the shop
    const shopCategoryIds = new Set<number>();
    this.shopItems.filter(si => si.type !== 'weapon').forEach(si => {
      const itemDef = this.itemsList.find(i => i.id === si.id);
      if (itemDef?.type) {
        const cat = this.itemCategories.find(c => c.key === itemDef.type);
        if (cat) {
          shopCategoryIds.add(cat.id);
        }
      }
    });

    const shopData: Shop = {
      id: this.id ?? 0,
      name: this.name.trim(),
      owner: Number(this.ownerId),
      locationId: this.locationId !== null ? Number(this.locationId) : undefined,
      locationName: this.locationName.trim() || 'Zephyria',
      location: this.location.trim() || this.locationName.trim(),
      description: this.description.trim() || undefined,
      discovered: this.discovered,
      categories: Array.from(shopCategoryIds),
      imgUrl: this.imgUrl.trim() || undefined,
      thumbnail: this.thumbnail.trim() || undefined,
      paymentMethod: {
        digital: this.paymentDigital,
        physical: this.paymentPhysical
      },
      items: this.shopItems.map(si => ({
        id: si.id,
        price: Number(si.price),
        type: si.type || 'item'
      }))
    };

    if (this.isEditing) {
      this.dataService.updateShop(shopData).subscribe({
        next: saved => {
          this.isSaving = false;
          this.toastService.show(`Shop "${saved.name}" updated successfully!`, 'success');
          this.dataService.refreshShops().subscribe(updatedList => {
            this.shops = updatedList || [];
            this.populateForm(saved);
          });
        },
        error: err => {
          this.isSaving = false;
          this.toastService.show(`Error updating shop: ${err?.message || err}`, 'error');
        }
      });
    } else {
      this.dataService.createShop(shopData).subscribe({
        next: created => {
          this.isSaving = false;
          this.toastService.show(`Shop "${created.name}" created successfully!`, 'success');
          this.dataService.refreshShops().subscribe(updatedList => {
            this.shops = updatedList || [];
            this.populateForm(created);
          });
        },
        error: err => {
          this.isSaving = false;
          this.toastService.show(`Error creating shop: ${err?.message || err}`, 'error');
        }
      });
    }
  }

  promptDelete(): void {
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
  }

  confirmDelete(): void {
    if (!this.canDelete || this.id === null) return;
    this.isDeleting = true;
    const deletedId = this.id;
    const deletedName = this.name;

    this.dataService.deleteShop(deletedId).subscribe({
      next: () => {
        this.isDeleting = false;
        this.showDeleteConfirm = false;
        this.toastService.show(`Shop "${deletedName}" deleted successfully!`, 'info');
        this.dataService.refreshShops().subscribe(updatedList => {
          this.shops = updatedList || [];
          if (this.shops.length > 0) {
            this.populateForm(this.shops[0]);
          } else {
            this.startNewShop();
          }
        });
      },
      error: err => {
        this.isDeleting = false;
        this.showDeleteConfirm = false;
        this.toastService.show(`Error deleting shop: ${err?.message || err}`, 'error');
      }
    });
  }
}
