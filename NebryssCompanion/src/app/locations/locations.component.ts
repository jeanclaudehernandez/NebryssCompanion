import { Component, OnInit, ViewEncapsulation, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
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
  locations: Location[] = [];
  selectedLocation: Location | null = null;
  private readonly STORAGE_KEY = 'selectedLocationName';
  loreData: Lore | null = null;
  uniqueFactions: string[] = [];
  
  constructor(
    private dataService: DataService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.dataService.getLocations().subscribe(data => {
      this.locations = data.locations;
      this.uniqueFactions = this.getUniqueFactions();
      this.loadFromLocalStorage();
      this.cdr.markForCheck();
    });
    
    this.dataService.getLore().subscribe(data => {
      this.loreData = data;
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

  getFactionInitial(faction: string): string {
    return faction ? faction.charAt(0).toUpperCase() : '';
  }

  getUniqueFactions(): string[] {
    const factions = this.locations.map(location => location.faction);
    return [...new Set(factions)];
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