import { Component, OnDestroy, OnInit, ViewEncapsulation, Output, EventEmitter, TemplateRef, ViewChild, ChangeDetectorRef, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../data.service';
import { WeaponTableComponent } from '../weapon-table/weapon-table.component';
import { GenericTableComponent } from '../generic-table/generic-table.component';
import { ScrollNavComponent } from '../scroll-nav/scroll-nav.component';
import { BestiaryEntry, ItemCategory, Items, NPC, Player, ScrollSection, Shop, Weapon, WeaponRule, AlteredState, CartItem, Location } from '../model';
import { ActivePlayerService } from '../active-player.service';
import { ThemeService } from '../theme.service';
import { Subscription } from 'rxjs';
import { CartService } from '../cart.service';

import { MatTooltipModule } from '@angular/material/tooltip';
import { ToastService } from '../toast.service';
import { ModalService } from '../modal.service';
import { AdminService } from '../admin.service';

import { AdminEditorSession } from '../admin-editor.models';

interface ShopCategoryData {
  category: ItemCategory;
  items: any[];
}

interface ProcessedShop extends Shop {
  categoriesData: ShopCategoryData[];
  weaponsData: Weapon[];
  weaponIds: number[];
  hasWeapons: boolean;
}

interface ShopLocationGroup {
  key: string;
  locationId: number | null;
  locationName: string;
  locationImageUrl?: string;
  locationThumbnail?: string;
  locationDescription?: string;
  shops: ProcessedShop[];
}

@Component({
  selector: 'app-shops',
  standalone: true,
  imports: [
    CommonModule,
    WeaponTableComponent,
    GenericTableComponent,
    ScrollNavComponent,
    MatTooltipModule
  ],
  templateUrl: './shops.component.html',
  styleUrls: ['./shops.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class ShopsComponent implements OnInit, OnDestroy {
  @Input() initialShopName: string | null = null;
  @Output() navigateToLocation = new EventEmitter<string>();
  @Output() navigateToNpc = new EventEmitter<{ npcId?: number; npcName?: string }>();
  @Output() openAdminEditor = new EventEmitter<AdminEditorSession>();
  selectedCreatureId: number | null = null;
  selectedCreature: BestiaryEntry | Player | null= null;
  factions: string[] = [];
  selectedFaction: string = "null";
  itemsData!: Items;
  weaponsData: Weapon[] = [];
  weaponRulesData: WeaponRule[] = [];
  alteredStates: AlteredState[] = [];
  itemsCategories: ItemCategory[] = [];
  locations: Location[] = [];
  shops: Shop[] = [];
  processedShopGroups: ShopLocationGroup[] = [];
  shopDisplayImages: { [shopId: number]: string } = {};
  locationGroupColors: { [groupKey: string]: string } = {};
  private readonly shopImageMaxWidth = 640;
  private readonly shopImageAspectRatio = 21 / 9;
  npcs: NPC[] = [];
  isLoading = true;
  scrollSections: ScrollSection[] = [];
  isDarkMode: boolean = false;
  isAdmin: boolean = false;
  activePlayerBodyTypes: string[] = [];
  private themeSubscription: Subscription = new Subscription();
  private cartSubscription: Subscription = new Subscription();
  private adminSubscription: Subscription = new Subscription();

  // Shopping Cart
  cart: { [shopId: number]: CartItem[] } = {};
  showCartSidebar: boolean = false;
  
  @ViewChild('confirmPurchaseModal') confirmPurchaseModal!: TemplateRef<any>;
  @ViewChild('shopImageModal') shopImageModal!: TemplateRef<any>;
  pendingTransaction: { shopId: number, method: 'digital' | 'physical' } | null = null;
  selectedShopImageUrl: string | null = null;
  selectedShopImageAlt = '';
  shopImageLandscapeMode = false;
  selectedShopImageNaturalWidth = 0;
  selectedShopImageNaturalHeight = 0;

  constructor(
    private dataService: DataService,
    private activePlayerService: ActivePlayerService,
    private themeService: ThemeService,
    private toastService: ToastService,
    private modalService: ModalService,
    private cartService: CartService,
    public adminService: AdminService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.themeSubscription = this.themeService.darkMode$.subscribe(isDark => {
      this.isDarkMode = isDark;
    });

    this.adminSubscription = this.adminService.isAdmin$.subscribe(isAdmin => {
      this.isAdmin = isAdmin;
      this.processShops();
    });
    
    this.activePlayerService.activePlayer$.subscribe(player => {
      if (player) {
        this.activePlayerBodyTypes = player.attributes?.body || [];
      } else {
        this.activePlayerBodyTypes = [];
      }
      this.processShops();
    });

    this.cartSubscription = this.cartService.cart$.subscribe(cart => {
      this.cart = cart;
    });
    
    this.dataService.getAllData().subscribe(response => {
      this.itemsData = response.items;
      this.weaponsData = response.weapons;
      this.weaponRulesData = response.weaponRules;
      this.alteredStates = response.alteredStates;
      this.shops = response.shops;
      this.itemsCategories = response.itemCategories;
      this.locations = response.locations.locations;
      this.npcs = response.npcs || [];
      this.processShops();

      if (this.initialShopName) {
        const targetShop = this.shops.find(s => s.name.toLowerCase() === this.initialShopName?.toLowerCase());
        if (targetShop) {
          const matchedGroup = this.processedShopGroups.find(g => g.shops.some(s => s.id === targetShop.id));
          if (matchedGroup) {
            localStorage.setItem(`${matchedGroup.key}-collapsed`, 'false');
          }
          setTimeout(() => {
            const el = document.getElementById(`shop-${targetShop.id}`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              el.classList.add('highlight-shop');
              setTimeout(() => el.classList.remove('highlight-shop'), 2500);
            }
          }, 200);
        }
      }
    });

    this.dataService.shops$?.subscribe(shops => {
      if (shops && shops.length > 0) {
        this.shops = [...shops];
        this.processShops();
        this.cdr.markForCheck();
      }
    });

    this.dataService.locations$?.subscribe(data => {
      if (data && data.locations) {
        this.locations = data.locations;
        this.processShops();
        this.cdr.markForCheck();
      }
    });

    this.dataService.items$?.subscribe(items => {
      if (items && items.items) {
        this.itemsData = { ...items };
        this.processShops();
        this.cdr.markForCheck();
      }
    });

    this.dataService.weapons$?.subscribe(weapons => {
      if (weapons && weapons.length > 0) {
        this.weaponsData = [...weapons];
        this.processShops();
        this.cdr.markForCheck();
      }
    });
  }

  ngOnDestroy() {
    this.themeSubscription.unsubscribe();
    this.cartSubscription.unsubscribe();
    this.adminSubscription.unsubscribe();
  }

  toggleShopDiscovered(shop: Shop, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    if (!this.isAdmin || !shop) {
      return;
    }

    const nextDiscovered = shop.discovered === false ? true : false;
    const updatedShop: Shop = {
      ...shop,
      discovered: nextDiscovered
    };

    this.dataService.updateShop(updatedShop).subscribe({
      next: saved => {
        const index = this.shops.findIndex(s => s.id === saved.id);
        if (index !== -1) {
          this.shops[index] = { ...saved };
        } else {
          this.shops.push({ ...saved });
        }
        this.processShops();

        this.toastService.show(
          saved.discovered !== false
            ? `Shop "${saved.name}" is now DISCOVERED (Visible to Players).`
            : `Shop "${saved.name}" is now UNDISCOVERED (Hidden from Players).`,
          'info'
        );

        this.dataService.refreshShops().subscribe({
          next: refreshedShops => {
            if (refreshedShops) {
              this.shops = refreshedShops;
              this.processShops();
            }
          }
        });
        this.cdr.markForCheck();
      },
      error: err => {
        this.toastService.show(`Failed to update shop discovery status: ${err?.message || err}`, 'error');
      }
    });
  }

  editShopInEditor(shop: Shop, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.openAdminEditor.emit({ mode: 'shop', shop });
  }

  processShops() {
    if (!this.shops || !this.itemsCategories || !this.locations) return;

    const visibleShops = this.shops.filter(shop => {
      if (this.isAdmin) {
        return true;
      }
      if (shop.discovered === false) {
        return false;
      }
      const matchedLocation = this.findShopLocation(shop);
      if (matchedLocation && matchedLocation.discovered === false) {
        return false;
      }
      return true;
    });

    const processedShops = visibleShops.map(shop => {
      const categoriesData: ShopCategoryData[] = (shop.categories || []).map(catId => {
        const category = this.findCategory(catId);
        if (!category) return null;
        return {
          category,
          items: this.getShopItemsWithPrices(shop, category.key)
        };
      }).filter((d): d is ShopCategoryData => d !== null);

      const weaponsData = this.getShopWeaponsWithPrices(shop);
      const weaponIds = weaponsData.map(w => w.id);

      return {
        ...shop,
        categoriesData,
        weaponsData,
        weaponIds,
        hasWeapons: weaponsData.length > 0
      };
    });

    const groupsMap = new Map<string, ShopLocationGroup>();

    const worldMapLoc = this.locations.find(l => l.isWorldMap || (l as any).isworldMap || l.id === 0);
    const defaultWorldMapImage = 'https://iili.io/3R2Be6u.png';
    const worldMapImageUrl = worldMapLoc?.imgUrl || defaultWorldMapImage;
    const worldMapThumbnail = worldMapLoc?.thumbnail || worldMapLoc?.imgUrl || defaultWorldMapImage;

    processedShops.forEach(shop => {
      const matchedLocation = this.findShopLocation(shop);
      const isUnbound = !matchedLocation;

      let groupKey: string;
      let locationId: number | null;
      let locationName: string;
      let locationImageUrl: string | undefined;
      let locationThumbnail: string | undefined;
      let locationDescription: string | undefined;

      if (isUnbound) {
        groupKey = 'unbound';
        locationId = 0;
        locationName = 'Unbound';
        locationImageUrl = worldMapImageUrl;
        locationThumbnail = worldMapThumbnail;
        locationDescription = 'Wandering merchants, traveling traders, and elusive sanctuaries with no fixed location across Nebryss.';
      } else {
        locationId = typeof matchedLocation?.id === 'number'
          ? matchedLocation.id
          : (typeof shop.locationId === 'number' ? shop.locationId : null);
        locationName = matchedLocation?.name || shop.locationName || shop.location || 'Unknown Location';
        groupKey = locationId !== null
          ? `location-${locationId}`
          : `location-name-${locationName.toLowerCase()}`;
        locationImageUrl = matchedLocation?.imgUrl;
        locationThumbnail = matchedLocation?.thumbnail;
        locationDescription = matchedLocation?.description;
      }

      if (!groupsMap.has(groupKey)) {
        groupsMap.set(groupKey, {
          key: groupKey,
          locationId,
          locationName,
          locationImageUrl,
          locationThumbnail,
          locationDescription,
          shops: []
        });
      }

      groupsMap.get(groupKey)!.shops.push(shop);
    });

    this.processedShopGroups = Array.from(groupsMap.values());
    this.processedShopGroups.sort((a, b) => {
      if (a.key === 'unbound') return 1;
      if (b.key === 'unbound') return -1;
      return 0;
    });

    this.scrollSections = this.processedShopGroups.map(group => ({
      title: group.locationName,
      id: this.getLocationGroupElementId(group)
    }));
    this.cdr.markForCheck();
  }

  trackByLocationGroup(index: number, group: ShopLocationGroup): string {
    return group.key;
  }

  trackByShop(index: number, shop: ProcessedShop): number {
    return shop.id;
  }

  trackByCategory(index: number, item: ShopCategoryData): number {
    return item.category.id;
  }

  getLocationGroupElementId(group: ShopLocationGroup): string {
    if (group.key === 'unbound') {
      return 'shop-location-unbound';
    }
    return group.locationId !== null ? `shop-location-${group.locationId}` : group.key;
  }

  getLocationGroupStyles(group: ShopLocationGroup): Record<string, string> {
    return {
      '--shop-group-color-rgb': this.locationGroupColors[group.key] || '27, 42, 51'
    };
  }

  isLocationGroupCollapsed(group: ShopLocationGroup): boolean {
    const saved = localStorage.getItem(`${group.key}-collapsed`);
    return saved !== null ? JSON.parse(saved) : true;
  }

  toggleLocationGroup(group: ShopLocationGroup): void {
    const newState = !this.isLocationGroupCollapsed(group);
    localStorage.setItem(`${group.key}-collapsed`, JSON.stringify(newState));
  }

  onLocationGroupImageLoad(event: Event, group: ShopLocationGroup) {
    if (this.locationGroupColors[group.key]) return;

    const img = event.target as HTMLImageElement;
    if (!img.naturalWidth || !img.naturalHeight) return;

    try {
      const targetWidth = Math.min(72, img.naturalWidth);
      const targetHeight = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * targetWidth));
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      const { data } = ctx.getImageData(0, 0, targetWidth, targetHeight);
      const buckets = new Map<string, { score: number; r: number; g: number; b: number }>();

      for (let y = 0; y < targetHeight; y += 2) {
        for (let x = 0; x < targetWidth; x += 2) {
          const pixelIndex = (y * targetWidth + x) * 4;
          const alpha = data[pixelIndex + 3];
          if (alpha < 200) continue;

          const r = data[pixelIndex];
          const g = data[pixelIndex + 1];
          const b = data[pixelIndex + 2];
          const { saturation, lightness } = this.getRgbStats(r, g, b);

          if (lightness < 0.08 || lightness > 0.9) continue;

          const bucketR = Math.round(r / 24) * 24;
          const bucketG = Math.round(g / 24) * 24;
          const bucketB = Math.round(b / 24) * 24;
          const key = `${bucketR},${bucketG},${bucketB}`;
          const current = buckets.get(key) || { score: 0, r: 0, g: 0, b: 0 };

          const centerBiasX = 1 - Math.abs((x / Math.max(targetWidth - 1, 1)) - 0.5) * 0.55;
          const centerBiasY = 1 - Math.abs((y / Math.max(targetHeight - 1, 1)) - 0.5) * 0.35;
          const vividnessWeight = 0.45 + (saturation * 1.25);
          const lightnessWeight = 1 - Math.min(Math.abs(lightness - 0.52), 0.52);
          const weight = centerBiasX * centerBiasY * vividnessWeight * lightnessWeight;

          current.score += weight;
          current.r += r * weight;
          current.g += g * weight;
          current.b += b * weight;
          buckets.set(key, current);
        }
      }

      const topBuckets = Array.from(buckets.values())
        .filter(bucket => bucket.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      if (!topBuckets.length) return;

      let totalScore = 0;
      let totalR = 0;
      let totalG = 0;
      let totalB = 0;

      topBuckets.forEach(bucket => {
        const avgR = bucket.r / bucket.score;
        const avgG = bucket.g / bucket.score;
        const avgB = bucket.b / bucket.score;

        totalScore += bucket.score;
        totalR += avgR * bucket.score;
        totalG += avgG * bucket.score;
        totalB += avgB * bucket.score;
      });

      if (!totalScore) return;

      const softened = this.softenGroupColor(
        Math.round(totalR / totalScore),
        Math.round(totalG / totalScore),
        Math.round(totalB / totalScore)
      );

      this.locationGroupColors[group.key] = `${softened.r}, ${softened.g}, ${softened.b}`;
      this.cdr.markForCheck();
    } catch {
      // Cross-origin or decode failure: keep the default group tint.
    }
  }

  private getRgbStats(r: number, g: number, b: number): { saturation: number; lightness: number } {
    const red = r / 255;
    const green = g / 255;
    const blue = b / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const lightness = (max + min) / 2;

    if (max === min) {
      return { saturation: 0, lightness };
    }

    const delta = max - min;
    const saturation = lightness > 0.5
      ? delta / (2 - max - min)
      : delta / (max + min);

    return { saturation, lightness };
  }

  private softenGroupColor(r: number, g: number, b: number): { r: number; g: number; b: number } {
    const mix = 0.18;
    return {
      r: Math.round(r * (1 - mix) + 27 * mix),
      g: Math.round(g * (1 - mix) + 42 * mix),
      b: Math.round(b * (1 - mix) + 51 * mix)
    };
  }

  // Re-encodes the loaded photo at a lower resolution so the wide banner isn't served at full source size.
  onShopImageLoad(event: Event, shopId: number) {
    if (this.shopDisplayImages[shopId]) return;
    const img = event.target as HTMLImageElement;
    if (!img.naturalWidth || !img.naturalHeight) return;

    try {
      const targetWidth = Math.min(this.shopImageMaxWidth, img.naturalWidth);
      const targetHeight = Math.round(targetWidth / this.shopImageAspectRatio);

      const srcRatio = img.naturalWidth / img.naturalHeight;
      let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
      if (srcRatio > this.shopImageAspectRatio) {
        sw = img.naturalHeight * this.shopImageAspectRatio;
        sx = (img.naturalWidth - sw) / 2;
      } else {
        sh = img.naturalWidth / this.shopImageAspectRatio;
        sy = (img.naturalHeight - sh) / 2;
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);

      this.shopDisplayImages[shopId] = canvas.toDataURL('image/jpeg', 0.75);
    } catch {
      // Cross-origin or decode failure: keep showing the original source image.
    }
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

  private findShopLocation(shop: Shop): Location | undefined {
    if (shop.locationName && shop.locationName.trim().toLowerCase() === 'unbound') {
      return undefined;
    }
    if (shop.location && shop.location.trim().toLowerCase() === 'unbound') {
      return undefined;
    }
    if (typeof shop.locationId === 'number') {
      if (shop.locationId === 0) {
        return undefined;
      }
      const locationById = this.locations.find(location => location.id === shop.locationId);
      if (locationById && !locationById.isWorldMap && !(locationById as any).isworldMap && locationById.id !== 0) {
        return locationById;
      }
    }

    const normalizedLocationName = this.normalizeText(shop.locationName || shop.location);
    if (!normalizedLocationName || normalizedLocationName === 'unbound') {
      return undefined;
    }

    return this.locations.find(location =>
      !location.isWorldMap &&
      !(location as any).isworldMap &&
      location.id !== 0 &&
      this.normalizeText(location.name) === normalizedLocationName
    );
  }

  private normalizeText(value?: string): string {
    return (value || '')
      .normalize('NFKD')
      .replace(/[’']/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  getShopItemsWithPrices(shop: Shop, categoryKey: string) {
    const shopItems = this.dataService.getShopItems(shop.id).map((shopItem) => {
      const itemInfo = this.dataService.getItemById(shopItem.id);
      if (!itemInfo) return shopItem;
      return {
        ...itemInfo,
        ...shopItem,
        type: itemInfo.type // Restore correct type from item definition
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

  getShopWeaponsWithPrices(shop: Shop): Weapon[] {
    const shopWeaponsStock = this.dataService.getShopWeapons(shop.id);
    
    // Filter and map global weapons to include shop-specific pricing
    return this.weaponsData.filter(weapon => 
      shopWeaponsStock.some(stockItem => stockItem.id === weapon.id)
    ).map(weapon => {
      const stockItem = shopWeaponsStock.find(item => item.id === weapon.id);
      return {
        ...weapon,
        price: (stockItem && stockItem.price !== undefined) ? stockItem.price : weapon.price
      };
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

  getOwnerNpc(ownerId: number | null): NPC | null {
    if (!ownerId) return null;
    return this.npcs.find(n => n.id === ownerId) || null;
  }

  onNpcOwnerClick(ownerId: number | null, event?: Event): void {
    if (event) event.stopPropagation();
    if (!ownerId) return;
    const npc = this.npcs.find(n => n.id === ownerId);
    if (npc) {
      this.navigateToNpc.emit({ npcId: npc.id, npcName: npc.name });
    }
  }

  openShopImageModal(shop: Shop) {
    if (!shop.imgUrl) return;

    this.selectedShopImageUrl = shop.imgUrl;
    this.selectedShopImageAlt = shop.name;
    this.shopImageLandscapeMode = false;
    this.selectedShopImageNaturalWidth = 0;
    this.selectedShopImageNaturalHeight = 0;

    this.modalService.openFromTemplate(this.shopImageModal, null, {
      width: 'auto',
      height: 'auto',
      overlayClass: 'shop-image-overlay',
      contentClass: 'shop-image-content',
      showCloseButton: false,
      onClose: () => this.resetShopImageModalState()
    });
  }

  toggleShopImageOrientation() {
    this.shopImageLandscapeMode = !this.shopImageLandscapeMode;
  }

  onShopImageModalLoad(event: Event) {
    const img = event.target as HTMLImageElement;
    if (!img.naturalWidth || !img.naturalHeight) return;

    this.selectedShopImageNaturalWidth = img.naturalWidth;
    this.selectedShopImageNaturalHeight = img.naturalHeight;
    this.cdr.markForCheck();
  }

  getShopImageViewportStyles(): Record<string, string> {
    const size = this.getShopImageRenderSize();
    return {
      width: `${Math.round(size.viewportWidth)}px`,
      height: `${Math.round(size.viewportHeight)}px`
    };
  }

  getShopImageStyles(): Record<string, string> {
    const size = this.getShopImageRenderSize();
    return {
      width: `${Math.round(size.imageWidth)}px`,
      height: `${Math.round(size.imageHeight)}px`
    };
  }

  private getShopImageRenderSize() {
    if (!this.selectedShopImageNaturalWidth || !this.selectedShopImageNaturalHeight) {
      return {
        viewportWidth: 0,
        viewportHeight: 0,
        imageWidth: 0,
        imageHeight: 0
      };
    }

    const compactLayout = window.innerWidth <= 640;
    const framePadding = compactLayout ? 16 : 24;
    const controlReserve = compactLayout ? 60 : 68;
    const maxWidth = Math.max(
      window.innerWidth - framePadding - (this.shopImageLandscapeMode ? controlReserve : 0),
      120
    );
    const maxHeight = Math.max(
      window.innerHeight - framePadding - (this.shopImageLandscapeMode ? 0 : controlReserve),
      120
    );

    const sourceWidth = this.shopImageLandscapeMode ? this.selectedShopImageNaturalHeight : this.selectedShopImageNaturalWidth;
    const sourceHeight = this.shopImageLandscapeMode ? this.selectedShopImageNaturalWidth : this.selectedShopImageNaturalHeight;
    const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1);
    const viewportWidth = sourceWidth * scale;
    const viewportHeight = sourceHeight * scale;

    return {
      viewportWidth,
      viewportHeight,
      imageWidth: this.selectedShopImageNaturalWidth * scale,
      imageHeight: this.selectedShopImageNaturalHeight * scale
    };
  }

  private resetShopImageModalState() {
    this.selectedShopImageUrl = null;
    this.selectedShopImageAlt = '';
    this.shopImageLandscapeMode = false;
    this.selectedShopImageNaturalWidth = 0;
    this.selectedShopImageNaturalHeight = 0;
  }

  hasActivePlayer(): boolean {
    return this.activePlayerService.activePlayer !== null;
  }

  toggleCartSidebar() {
    this.showCartSidebar = !this.showCartSidebar;
  }

  get cartItemsCount(): number {
    return this.cartService.getCartItemsCount();
  }

  get cartShopIds(): number[] {
    return this.cartService.getCartShopIds();
  }

  getShopName(shopId: number): string {
    const shop = this.shops.find(s => s.id === shopId);
    return shop ? shop.name : 'Unknown Shop';
  }

  getShopTotal(shopId: number): number {
    return this.cartService.getShopTotal(shopId);
  }

  onAddToCart(data: any, shopId: number, type: 'item' | 'weapon') {
    let itemToAdd: CartItem;

    if (type === 'item') {
      // data is the item object
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
      const weapon = this.weaponsData.find(w => w.id === weaponId);
      if (!weapon) return;

      // Find shop specific price
      const shopWeapons = this.dataService.getShopWeapons(shopId);
      const shopItem = shopWeapons.find(i => i.id === weaponId);
      const price = (shopItem && shopItem.price !== undefined) ? shopItem.price : (weapon.price || 0);

      itemToAdd = {
        id: weaponId,
        name: weapon.name,
        price: price,
        quantity: 1,
        type: 'weapon'
      };
    }

    this.cartService.addToCart(itemToAdd, shopId);
  }

  removeFromCart(item: CartItem, shopId: number) {
    this.cartService.removeFromCart(item, shopId);
    if (this.cartItemsCount === 0) {
        this.showCartSidebar = false;
    }
  }

  shopSupportsPayment(shopId: number, method: 'digital' | 'physical'): boolean {
    const shop = this.shops.find(s => s.id === shopId);
    return !!(shop && shop.paymentMethod && shop.paymentMethod[method]);
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
        talents: [],
        afflictions: [],
        equipment: [],
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
    this.cartService.clearCart(shopId);

    // Close sidebar if no carts remain
    if (this.cartItemsCount === 0) {
      this.showCartSidebar = false;
    }

    this.toastService.show(`Purchased items for ${totalCost} ${method} mistrals`, 'success');
  }
}
