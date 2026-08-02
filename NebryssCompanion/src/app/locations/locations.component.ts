import { Component, OnInit, ViewEncapsulation, ChangeDetectionStrategy, ChangeDetectorRef, Output, EventEmitter, Input, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminService } from '../admin.service';
import { DataService } from '../data.service';
import { ToastService } from '../toast.service';
import { ImageViewerComponent } from '../image-viewer/image-viewer.component';
import { Location, Lore, SecretBlock } from '../model';

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
export class LocationsComponent implements OnInit {
  @Input() initialLocationName: string | null = null;
  @Input() backTarget: string | null = null;
  @Output() navigateTo = new EventEmitter<any>();
  @Output() navigateToLore = new EventEmitter<string>();
  @Output() navigateToWorldMap = new EventEmitter<string>();

  private readonly destroyRef = inject(DestroyRef);

  locations: Location[] = [];
  selectedLocation: Location | null = null;
  deepLinkMode = false;
  private readonly STORAGE_KEY = 'selectedLocationName';
  loreData: Lore | null = null;
  uniqueFactions: string[] = [];
  shopNames: string[] = [];
  isAdmin = false;
  collapsedFactions = new Set<string>();

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
    if (this.collapsedFactions.has(factionName)) {
      this.collapsedFactions.delete(factionName);
    } else {
      this.collapsedFactions.add(factionName);
    }
    this.cdr.markForCheck();
  }

  isFactionCollapsed(factionName: string): boolean {
    return this.collapsedFactions.has(factionName);
  }

  onFactionEmblemClick(event: Event, factionName: string): void {
    event.stopPropagation();
    this.onFactionClick(factionName);
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

    this.dataService.getLore().subscribe(data => {
      this.loreData = data;
      this.cdr.markForCheck();
    });

    this.dataService.getShops().subscribe(shops => {
      this.shopNames = shops.map(shop => shop.name);
      this.cdr.markForCheck();
    });
  }

  selectLocation(location: Location): void {
    if (this.selectedLocation === location) {
      this.clearSelectedLocation();
    } else {
      this.selectedLocation = location;
      this.saveToLocalStorage();
    }
    this.cdr.markForCheck();
  }

  clearSelectedLocation(): void {
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
      (this.isAdmin || !location.isSecret || location.isSecretRevealed)
    );
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
      this.isAdmin || !l.isSecret || l.isSecretRevealed
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

  navigateToShop(shopName: string) {
    this.navigateTo.emit('shops');

    setTimeout(() => {
      this.dataService.getShops().subscribe(shops => {
        const shop = shops.find(s => s.name === shopName);
        if (shop) {
          const elementId = `shop-${shop.id}`;
          const element = document.getElementById(elementId);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            element.classList.add('highlight-shop');
            setTimeout(() => element.classList.remove('highlight-shop'), 2000);
          }
        }
      });
    }, 100);
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
