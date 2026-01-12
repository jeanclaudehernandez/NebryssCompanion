import { Component, OnInit, ViewEncapsulation, ChangeDetectionStrategy, ChangeDetectorRef, Output, EventEmitter, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../data.service';
import { ImageViewerComponent } from '../image-viewer/image-viewer.component';
import { Location, Locations, Lore } from '../model';

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
  @Output() navigateTo = new EventEmitter<any>();
  @Output() navigateToLore = new EventEmitter<string>();
  locations: Location[] = [];
  selectedLocation: Location | null = null;
  private readonly STORAGE_KEY = 'selectedLocationName';
  loreData: Lore | null = null;
  uniqueFactions: string[] = [];
  shopNames: string[] = [];
  
  constructor(
    private dataService: DataService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.dataService.getLocations().subscribe(data => {
      this.locations = data.locations;
      this.uniqueFactions = this.getUniqueFactions();

      if (this.initialLocationName) {
        const location = this.locations.find(l => l.name === this.initialLocationName);
        if (location) {
          this.selectLocation(location);
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
    // If clicking the already selected location, deselect it
    if (this.selectedLocation === location) {
      this.clearSelectedLocation();
    } else {
      this.selectedLocation = location;
      this.saveToLocalStorage();
    }
    this.cdr.markForCheck();
  }

  clearSelectedLocation(): void {
    this.selectedLocation = null;
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
      if (foundLocation) {
        this.selectedLocation = foundLocation;
      }
    }
  }

  getLocationsByFaction(factionName: string): Location[] {
    return this.locations.filter(location => location.faction === factionName);
  }

  getFactionThumbnail(factionName: string): string {
    if (!this.loreData) return '';
    
    const faction = this.loreData.planetOverview.factions.find(
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

  getUniqueFactions(): string[] {
    const factions = this.locations.map(location => location.faction);
    return [...new Set(factions)];
  }

  navigateToShop(shopName: string) {
    this.navigateTo.emit('shops');
    
    // Use setTimeout to allow the view to change before scrolling
    setTimeout(() => {
      // Find the shop element by text content since we don't have the ID here directly
      // Or we can fetch shops to get ID, but that requires more logic.
      // Better approach: Let's use DataService to find shop ID by name
      this.dataService.getShops().subscribe(shops => {
        const shop = shops.find(s => s.name === shopName);
        if (shop) {
          const elementId = `shop-${shop.id}`;
          const element = document.getElementById(elementId);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Add a highlight effect
            element.classList.add('highlight-shop');
            setTimeout(() => element.classList.remove('highlight-shop'), 2000);
          }
        }
      });
    }, 100);
  }

  isShop(featureName: string): boolean {
    // This is a simple check. A more robust way would be to check against the list of shops
    // But since we can't easily access the shops list synchronously here without pre-fetching,
    // we'll rely on a known list or fetch it on init.
    // Let's fetch shops on init and store their names.
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