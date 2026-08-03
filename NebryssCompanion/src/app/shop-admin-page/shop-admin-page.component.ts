import { CommonModule } from '@angular/common';
import { Component, DestroyRef, Input, OnChanges, OnInit, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DataService } from '../data.service';
import { AdminService } from '../admin.service';
import { ToastService } from '../toast.service';
import { Item, Location, NPC, Shop, ShopItem, Weapon } from '../model';
import { forkJoin } from 'rxjs';

export interface ShopForSaleRow {
  shopItem: ShopItem;
  name: string;
  basePrice: number;
  categoryOrType: string;
}

@Component({
  selector: 'app-shop-admin-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './shop-admin-page.component.html',
  styleUrls: ['./shop-admin-page.component.css']
})
export class ShopAdminPageComponent implements OnInit, OnChanges {
  @Input() initialShop: Shop | null = null;

  private readonly destroyRef = inject(DestroyRef);
  private readonly dataService = inject(DataService);
  private readonly adminService = inject(AdminService);
  private readonly toastService = inject(ToastService);

  isAdmin = false;
  isLoading = true;
  isSaving = false;
  isDeleting = false;
  showDeleteConfirm = false;

  shops: Shop[] = [];
  npcs: NPC[] = [];
  locations: Location[] = [];
  itemsList: Item[] = [];
  weaponsList: Weapon[] = [];

  searchTerm = '';
  selectedShopId: number | null = null;

  // Picker & Item Adding State
  pickerSearchTerm = '';
  pickerTypeFilter: 'all' | 'item' | 'weapon' = 'all';

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

  // Items for sale in this shop
  shopItems: ShopItem[] = [];

  get filteredShops(): Shop[] {
    if (!this.searchTerm.trim()) {
      return this.shops;
    }
    const term = this.searchTerm.toLowerCase();
    return this.shops.filter(s =>
      s.name.toLowerCase().includes(term) ||
      (s.location && s.location.toLowerCase().includes(term)) ||
      (s.locationName && s.locationName.toLowerCase().includes(term))
    );
  }

  get isEditing(): boolean {
    return this.id !== null;
  }

  get forSaleRows(): ShopForSaleRow[] {
    return this.shopItems.map(si => {
      if (si.type === 'weapon') {
        const w = this.weaponsList.find(weapon => weapon.id === si.id);
        return {
          shopItem: si,
          name: w ? w.name : `Weapon #${si.id}`,
          basePrice: w?.price ?? 0,
          categoryOrType: 'Weapon'
        };
      } else {
        const item = this.itemsList.find(i => i.id === si.id);
        return {
          shopItem: si,
          name: item?.name || `Item #${si.id}`,
          basePrice: item?.price ?? 0,
          categoryOrType: item?.type || 'Item'
        };
      }
    });
  }

  get availableCatalog(): Array<{ id: number; name: string; basePrice: number; type: 'item' | 'weapon'; detail: string }> {
    const list: Array<{ id: number; name: string; basePrice: number; type: 'item' | 'weapon'; detail: string }> = [];

    if (this.pickerTypeFilter === 'all' || this.pickerTypeFilter === 'item') {
      this.itemsList.forEach(item => {
        if (typeof item.id === 'number') {
          list.push({
            id: item.id,
            name: item.name || `Item #${item.id}`,
            basePrice: item.price ?? 0,
            type: 'item',
            detail: item.type || 'Item'
          });
        }
      });
    }

    if (this.pickerTypeFilter === 'all' || this.pickerTypeFilter === 'weapon') {
      this.weaponsList.forEach(w => {
        if (typeof w.id === 'number') {
          list.push({
            id: w.id,
            name: w.name || `Weapon #${w.id}`,
            basePrice: w.price ?? 0,
            type: 'weapon',
            detail: 'Weapon'
          });
        }
      });
    }

    if (!this.pickerSearchTerm.trim()) {
      return list;
    }

    const term = this.pickerSearchTerm.toLowerCase();
    return list.filter(c => c.name.toLowerCase().includes(term) || c.detail.toLowerCase().includes(term));
  }

  ngOnInit(): void {
    this.adminService.isAdmin$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(isAdmin => {
        this.isAdmin = isAdmin;
      });

    this.loadAllData();
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
      locations: this.dataService.getLocations(),
      items: this.dataService.getItems(),
      weapons: this.dataService.getWeapons()
    }).subscribe({
      next: res => {
        this.shops = res.shops || [];
        this.npcs = res.npcs || [];
        this.locations = res.locations?.locations || [];
        this.itemsList = res.items?.items || [];
        this.weaponsList = res.weapons || [];
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
    const desc = npc.role || npc.description || npc.personality || npc.mission || `${npc.faction} - ${npc.subgroup}`;
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
    this.showDeleteConfirm = false;
  }

  addItemToShop(catalogItem: { id: number; basePrice: number; type: 'item' | 'weapon' }): void {
    const existingIndex = this.shopItems.findIndex(si => si.id === catalogItem.id && si.type === catalogItem.type);
    if (existingIndex !== -1) {
      this.toastService.show('Item is already in this shop!', 'info');
      return;
    }

    this.shopItems.push({
      id: catalogItem.id,
      price: catalogItem.basePrice,
      type: catalogItem.type
    });
    this.toastService.show(`Added to shop for sale!`, 'success');
  }

  removeItemFromShop(index: number): void {
    this.shopItems.splice(index, 1);
  }

  saveShop(): void {
    if (!this.name.trim()) {
      this.toastService.show('Shop Name is required.', 'info');
      return;
    }

    if (!this.ownerId) {
      this.toastService.show('Owner NPC must be selected.', 'info');
      return;
    }

    this.isSaving = true;

    const shopData: Shop = {
      id: this.id ?? 0,
      name: this.name.trim(),
      owner: Number(this.ownerId),
      locationId: this.locationId !== null ? Number(this.locationId) : undefined,
      locationName: this.locationName.trim() || 'Zephyria',
      location: this.location.trim() || this.locationName.trim(),
      description: this.description.trim() || undefined,
      discovered: this.discovered,
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
    if (this.id === null) return;

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
