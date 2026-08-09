import { Component, OnInit, OnChanges, SimpleChanges, ViewEncapsulation, ChangeDetectionStrategy, ChangeDetectorRef, Output, EventEmitter, Input, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminService } from '../admin.service';
import { DataService } from '../data.service';
import { ToastService } from '../toast.service';
import { ImageViewerComponent } from '../image-viewer/image-viewer.component';
import { Location, Lore, SecretBlock, NPC, Shop } from '../model';

@Component({
  selector: 'app-locations',
  standalone: true,
  imports: [
    CommonModule,
    ImageViewerComponent
  ],
  templateUrl: './locations.component.html',
  styleUrls: ['./locations.component.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LocationsComponent implements OnInit, OnChanges {
  @Input() initialLocationName: string | null = null;
  @Input() backTarget: string | null = null;
  @Output() navigateTo = new EventEmitter<any>();
  @Output() navigateToLore = new EventEmitter<string>();
  @Output() navigateToWorldMap = new EventEmitter<string>();
  @Output() navigateToShop = new EventEmitter<{ shopId?: number; shopName?: string }>();
  @Output() navigateToNpc = new EventEmitter<{ npcId?: number; npcName?: string }>();
  @Output() locationSelected = new EventEmitter<string | null>();

  private readonly destroyRef = inject(DestroyRef);

  locations: Location[] = [];
  npcs: NPC[] = [];
  shops: Shop[] = [];
  selectedLocation: Location | null = null;
  deepLinkMode = false;
  private readonly STORAGE_KEY = 'selectedLocationName';
  loreData: Lore | null = null;
  uniqueFactions: string[] = [];
  shopNames: string[] = [];
  isAdmin = false;
  collapsedFactions = new Set<string>();
  factionColors: { [factionName: string]: string } = {};

  constructor(
    private dataService: DataService,
    private adminService: AdminService,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  toggleFactionCollapse(factionName: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    const currentlyCollapsed = this.isFactionCollapsed(factionName);
    const newState = !currentlyCollapsed;
    if (newState) {
      this.collapsedFactions.add(factionName);
    } else {
      this.collapsedFactions.delete(factionName);
    }
    try {
      localStorage.setItem(`loc-faction-${factionName}-collapsed`, JSON.stringify(newState));
    } catch {}
    this.cdr.markForCheck();
  }

  isFactionCollapsed(factionName: string): boolean {
    const saved = localStorage.getItem(`loc-faction-${factionName}-collapsed`);
    if (saved !== null) {
      return JSON.parse(saved);
    }
    return true;
  }

  onFactionEmblemClick(event: Event, factionName: string): void {
    event.stopPropagation();
    this.onFactionClick(factionName);
  }

  getFactionSectionStyles(factionName: string): { [key: string]: string } {
    return {
      '--faction-color-rgb': this.factionColors[factionName] || '27, 42, 51'
    };
  }

  onFactionEmblemLoad(event: Event, factionName: string): void {
    if (this.factionColors[factionName]) return;
    const img = event.target as HTMLImageElement;
    if (!img || !img.naturalWidth) return;

    try {
      const canvas = document.createElement('canvas');
      const targetWidth = 32;
      const targetHeight = 32;
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      const { data } = ctx.getImageData(0, 0, targetWidth, targetHeight);
      const buckets = new Map<string, { score: number; r: number; g: number; b: number }>();

      for (let y = 0; y < targetHeight; y++) {
        for (let x = 0; x < targetWidth; x++) {
          const pixelIndex = (y * targetWidth + x) * 4;
          const alpha = data[pixelIndex + 3];
          if (alpha < 150) continue;

          const r = data[pixelIndex];
          const g = data[pixelIndex + 1];
          const b = data[pixelIndex + 2];
          const { saturation, lightness } = this.getRgbStats(r, g, b);

          if (lightness < 0.08 || lightness > 0.92) continue;

          const bucketR = Math.round(r / 24) * 24;
          const bucketG = Math.round(g / 24) * 24;
          const bucketB = Math.round(b / 24) * 24;
          const key = `${bucketR},${bucketG},${bucketB}`;
          const current = buckets.get(key) || { score: 0, r: 0, g: 0, b: 0 };

          const centerBiasX = 1 - Math.abs((x / Math.max(targetWidth - 1, 1)) - 0.5) * 0.4;
          const centerBiasY = 1 - Math.abs((y / Math.max(targetHeight - 1, 1)) - 0.5) * 0.4;
          const vividnessWeight = 0.5 + (saturation * 1.5);
          const lightnessWeight = 1 - Math.min(Math.abs(lightness - 0.5), 0.5);
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

      const softened = this.softenFactionColor(
        Math.round(totalR / totalScore),
        Math.round(totalG / totalScore),
        Math.round(totalB / totalScore)
      );

      this.factionColors[factionName] = `${softened.r}, ${softened.g}, ${softened.b}`;
      this.cdr.markForCheck();
    } catch {
      // Keep default fallback color
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

  private softenFactionColor(r: number, g: number, b: number): { r: number; g: number; b: number } {
    const mix = 0.15;
    return {
      r: Math.round(r * (1 - mix) + 27 * mix),
      g: Math.round(g * (1 - mix) + 42 * mix),
      b: Math.round(b * (1 - mix) + 51 * mix)
    };
  }

  ngOnInit(): void {
    this.adminService.isAdmin$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(isAdmin => {
        this.isAdmin = isAdmin;
        this.uniqueFactions = this.getUniqueFactions();
        this.cdr.markForCheck();
      });

    this.dataService.getLocations().subscribe(data => {
      this.locations = data.locations;
      this.uniqueFactions = this.getUniqueFactions();

      if (this.initialLocationName) {
        const location = this.locations.find(l => l.name === this.initialLocationName);
        if (location) {
          this.selectLocation(location);
          this.deepLinkMode = true;
        } else {
          this.loadFromLocalStorage();
        }
      } else {
        this.loadFromLocalStorage();
      }

      this.cdr.markForCheck();
    });

    this.dataService.locations$
      ?.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => {
        if (data && data.locations) {
          this.locations = data.locations;
          this.uniqueFactions = this.getUniqueFactions();
          if (this.selectedLocation) {
            const updatedSelected = this.locations.find(l => l.id === this.selectedLocation?.id || l.name === this.selectedLocation?.name);
            this.selectedLocation = updatedSelected || null;
          }
          this.cdr.markForCheck();
        }
      });

    this.dataService.getLore().subscribe(data => {
      this.loreData = data;
      this.cdr.markForCheck();
    });

    this.dataService.getShops().subscribe(shops => {
      this.shops = shops || [];
      this.shopNames = this.shops.map(shop => shop.name);
      this.cdr.markForCheck();
    });

    this.dataService.getNpcs().subscribe(npcs => {
      this.npcs = npcs || [];
      this.cdr.markForCheck();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialLocationName']) {
      if (this.initialLocationName && this.locations.length > 0) {
        const location = this.locations.find(l => l.name === this.initialLocationName);
        if (location) {
          this.selectedLocation = location;
          this.deepLinkMode = true;
          this.cdr.markForCheck();
        }
      } else if (!this.initialLocationName) {
        this.selectedLocation = null;
        this.deepLinkMode = false;
        this.cdr.markForCheck();
      }
    }
  }

  selectLocation(location: Location): void {
    if (this.selectedLocation === location) {
      this.clearSelectedLocation();
    } else {
      this.selectedLocation = location;
      this.locationSelected.emit(location.name);
      this.saveToLocalStorage();
    }
    this.cdr.markForCheck();
  }

  clearSelectedLocation(): void {
    this.locationSelected.emit(null);
    if (this.deepLinkMode && this.backTarget) {
      this.navigateTo.emit(this.backTarget);
      return;
    }
    this.selectedLocation = null;
    this.deepLinkMode = false;
    localStorage.removeItem(this.STORAGE_KEY);
    this.cdr.markForCheck();
  }

  private saveToLocalStorage(): void {
    if (this.selectedLocation) {
      localStorage.setItem(this.STORAGE_KEY, this.selectedLocation.name);
    } else {
      localStorage.removeItem(this.STORAGE_KEY);
    }
  }

  private loadFromLocalStorage(): void {
    const savedLocationName = localStorage.getItem(this.STORAGE_KEY);
    if (savedLocationName && this.locations.length > 0) {
      const foundLocation = this.locations.find(location => location.name === savedLocationName);
      if (foundLocation && (this.isAdmin || !foundLocation.isSecret || foundLocation.isSecretRevealed)) {
        this.selectedLocation = foundLocation;
      }
    }
  }

  getLocationsByFaction(factionName: string): Location[] {
    return this.locations.filter(location =>
      location.faction === factionName &&
      (this.isAdmin || (location.discovered !== false && (!location.isSecret || location.isSecretRevealed)))
    );
  }

  toggleLocationDiscovered(location: Location, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    if (!this.isAdmin || !location) {
      return;
    }

    const nextDiscovered = location.discovered === false ? true : false;
    const updatedLocation: Location = {
      ...location,
      discovered: nextDiscovered
    };

    this.dataService.updateLocation(updatedLocation).subscribe({
      next: saved => {
        const index = this.locations.findIndex(l => l.id === saved.id);
        if (index !== -1) {
          this.locations[index] = { ...saved };
        } else {
          this.locations.push({ ...saved });
        }
        if (this.selectedLocation?.id === saved.id) {
          this.selectedLocation = { ...saved };
        }
        this.uniqueFactions = this.getUniqueFactions();

        this.toastService.show(
          saved.discovered !== false
            ? `Location "${saved.name}" is now DISCOVERED (Visible to Players).`
            : `Location "${saved.name}" is now UNDISCOVERED (Hidden from Players).`,
          'info'
        );

        this.dataService.refreshLocations().subscribe(data => {
          if (data?.locations) {
            this.locations = data.locations;
            this.uniqueFactions = this.getUniqueFactions();
            this.cdr.markForCheck();
          }
        });
        this.cdr.markForCheck();
      },
      error: err => {
        this.toastService.show(`Failed to update discovery status: ${err?.message || err}`, 'error');
      }
    });
  }

  getLocationSecrets(location: Location | null): SecretBlock[] {
    if (!location) {
      return [];
    }

    if (location.secrets && location.secrets.length > 0) {
      return location.secrets;
    }

    if (location.privateNotes && location.privateNotes.trim()) {
      return [
        {
          id: 'sec-legacy',
          title: 'GM Secret Notes',
          content: location.privateNotes.trim(),
          isRevealed: !!location.isSecretRevealed
        }
      ];
    }

    return [];
  }

  getRevealedSecrets(location: Location | null): SecretBlock[] {
    return this.getLocationSecrets(location).filter(s => !!s.isRevealed);
  }

  toggleSecretBlock(location: Location, secretIndex: number): void {
    if (!this.isAdmin || !location) {
      return;
    }

    const secrets = [...this.getLocationSecrets(location)];
    if (secretIndex < 0 || secretIndex >= secrets.length) {
      return;
    }

    secrets[secretIndex] = {
      ...secrets[secretIndex],
      isRevealed: !secrets[secretIndex].isRevealed
    };

    const updated: Location = {
      ...location,
      secrets
    };

    this.dataService.updateLocation(updated).subscribe({
      next: saved => {
        if (this.selectedLocation?.id === saved.id) {
          this.selectedLocation = saved;
        }
        const block = saved.secrets?.[secretIndex] || secrets[secretIndex];
        this.toastService.show(
          block.isRevealed
            ? `Secret "${block.title || 'Campaign Secret'}" is now REVEALED to players!`
            : `Secret "${block.title || 'Campaign Secret'}" is now HIDDEN (GM only).`,
          'info'
        );
        this.dataService.refreshLocations().subscribe();
        this.cdr.markForCheck();
      },
      error: err => {
        this.toastService.show(`Failed to update secret block reveal status: ${err?.message || err}`, 'error');
      }
    });
  }

  getFactionThumbnail(factionName: string): string {
    if (!this.loreData?.factions) return '';

    const faction = this.loreData.factions.find(
      faction => faction.name === factionName
    );

    return faction?.thumbnail || '';
  }

  onFactionClick(factionName: string) {
    this.navigateToLore.emit(factionName);
  }

  getFactionInitial(faction: string): string {
    return faction ? faction.charAt(0).toUpperCase() : '';
  }

  hasFactionName(faction: string | null | undefined): boolean {
    return !!faction?.trim();
  }

  getUniqueFactions(): string[] {
    const visibleLocations = this.locations.filter(l =>
      this.isAdmin || (l.discovered !== false && (!l.isSecret || l.isSecretRevealed))
    );
    const factions = visibleLocations.map(location => location.faction);
    return [...new Set(factions)];
  }

  openSelectedLocationOnWorldMap(): void {
    if (!this.selectedLocation) {
      return;
    }

    this.navigateToWorldMap.emit(this.selectedLocation.name);
  }

  onShopByNameClick(shopName: string) {
    this.navigateToShop.emit({ shopName });
  }

  getNpcsForSelectedLocation(): NPC[] {
    if (!this.selectedLocation) return [];
    const locName = this.selectedLocation.name.toLowerCase();
    return this.npcs.filter(npc =>
      (this.isAdmin || npc.discovered !== false) &&
      npc.location && npc.location.toLowerCase() === locName
    );
  }

  getShopsForSelectedLocation(): Shop[] {
    if (!this.selectedLocation) return [];
    const locName = this.selectedLocation.name.toLowerCase();
    const locId = this.selectedLocation.id;
    return this.shops.filter(shop =>
      (this.isAdmin || shop.discovered !== false) &&
      ((shop.location && shop.location.toLowerCase() === locName) ||
       (shop.locationName && shop.locationName.toLowerCase() === locName) ||
       (typeof shop.locationId === 'number' && shop.locationId === locId))
    );
  }

  getOwnerName(ownerId: number): string {
    if (!ownerId) return 'Unknown';
    const npc = this.npcs.find(n => n.id === ownerId);
    return npc ? npc.name : `NPC ${ownerId}`;
  }

  onNpcClick(npc: NPC): void {
    this.navigateToNpc.emit({ npcId: npc.id, npcName: npc.name });
  }

  onShopClick(shop: Shop): void {
    this.navigateToShop.emit({ shopId: shop.id, shopName: shop.name });
  }

  isShop(featureName: string): boolean {
    return this.shopNames.includes(featureName);
  }

  trackByFaction(index: number, item: string): string {
    return item;
  }

  trackByLocation(index: number, item: Location): string {
    return item.name;
  }

  trackByFeature(index: number, feature: any): string {
    return feature.name;
  }
}
