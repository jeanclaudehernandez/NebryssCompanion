import { Component, OnInit, OnDestroy, ChangeDetectorRef, Output, EventEmitter, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../data.service';
import { Location } from '../model';
import { WORLD_MAP_PIN_COORDINATES } from './world-map-pin-coordinates';
import { WorldMapStateService } from './world-map-state.service';
import { FACTION_COLORS, DEFAULT_FACTION_COLOR } from './world-map-faction-colors';

export interface MapPin {
  location: Location;
  x: number;
  y: number;
  animationDelay: string;
  factionIcon: string | null;
  factionColor: string;
}

@Component({
  selector: 'app-world-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './world-map.component.html',
  styleUrls: ['./world-map.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class WorldMapComponent implements OnInit, OnDestroy {
  @Output() navigateToLocation = new EventEmitter<string>();
  @Output() navigateToLore = new EventEmitter<string>();

  worldMapLocation: Location | null = null;
  pins: MapPin[] = [];
  selectedPin: Location | null = null;
  private locationsData: Location[] = [];
  private factionIcons = new Map<string, string>();

  // Pan & zoom state
  scale = 1;
  translateX = 0;
  translateY = 0;
  private readonly minScale = 0.5;
  private readonly maxScale = 4;
  private isPanning = false;
  private lastPointer = { x: 0, y: 0 };
  private readonly activePointers = new Map<number, { x: number; y: number }>();
  private pinchStartDistance = 0;
  private pinchStartScale = 1;

  constructor(
    private dataService: DataService,
    private cdr: ChangeDetectorRef,
    private mapState: WorldMapStateService
  ) {}

  ngOnInit(): void {
    // restore whatever focus (pan/zoom) was active last time this view was open
    this.scale = this.mapState.scale;
    this.translateX = this.mapState.translateX;
    this.translateY = this.mapState.translateY;

    this.dataService.getLocations().subscribe(data => {
      const locations = data.locations || [];
      // tolerate the "isworldMap" casing some DB docs were saved with
      this.worldMapLocation =
        locations.find(l => l.isWorldMap || (l as any).isworldMap) ??
        locations.find(l => l.faction === 'Planet') ??
        locations[locations.length - 1] ??
        null;

      this.locationsData = locations;
      this.rebuildPins();
      this.cdr.markForCheck();
    });

    this.dataService.getLore().subscribe(lore => {
      for (const faction of lore.factions || []) {
        const icon = faction.thumbnail || faction.image;
        if (icon) {
          this.factionIcons.set(faction.name, icon);
        }
      }
      this.rebuildPins();
      this.cdr.markForCheck();
    });
  }

  private rebuildPins(): void {
    // New location without a spot yet? Just add it to WORLD_MAP_PIN_COORDINATES.
    this.pins = this.locationsData
      .filter(l => l !== this.worldMapLocation)
      .map((l, i) => this.toPin(l, i))
      .filter((pin): pin is MapPin => pin !== null);
  }

  private toPin(location: Location, index: number): MapPin | null {
    const coords =
      location.mapX != null && location.mapY != null
        ? { x: location.mapX, y: location.mapY }
        : WORLD_MAP_PIN_COORDINATES[location.name];

    if (!coords) {
      return null;
    }
    return {
      location,
      x: coords.x,
      y: coords.y,
      animationDelay: `${index * 70}ms`,
      factionIcon: this.factionIcons.get(location.faction) ?? null,
      factionColor: FACTION_COLORS[location.faction] ?? DEFAULT_FACTION_COLOR
    };
  }

  trackByPin(index: number, item: MapPin): string {
    return item.location.name;
  }

  get mapTransform(): string {
    return `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
  }

  selectPin(pin: Location): void {
    this.selectedPin = pin;
    this.cdr.markForCheck();
  }

  closePopup(): void {
    this.selectedPin = null;
    this.cdr.markForCheck();
  }

  goToFullDetails(pin: Location): void {
    this.navigateToLocation.emit(pin.name);
  }

  onFactionClick(faction: string): void {
    this.navigateToLore.emit(faction);
  }

  zoomIn(): void {
    this.setScale(this.scale + 0.25);
  }

  zoomOut(): void {
    this.setScale(this.scale - 0.25);
  }

  resetView(): void {
    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;
  }

  onWheel(event: WheelEvent): void {
    event.preventDefault();
    this.setScale(this.scale + (event.deltaY > 0 ? -0.15 : 0.15));
  }

  onPointerDown(event: PointerEvent): void {
    (event.target as Element).setPointerCapture?.(event.pointerId);
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.activePointers.size === 1) {
      this.isPanning = true;
      this.lastPointer = { x: event.clientX, y: event.clientY };
    } else if (this.activePointers.size === 2) {
      this.isPanning = false;
      this.pinchStartDistance = this.getPointersDistance();
      this.pinchStartScale = this.scale;
    }
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.activePointers.has(event.pointerId)) {
      return;
    }
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.activePointers.size === 2) {
      const distance = this.getPointersDistance();
      if (this.pinchStartDistance > 0) {
        this.setScale(this.pinchStartScale * (distance / this.pinchStartDistance));
      }
      return;
    }

    if (this.isPanning) {
      this.translateX += event.clientX - this.lastPointer.x;
      this.translateY += event.clientY - this.lastPointer.y;
      this.lastPointer = { x: event.clientX, y: event.clientY };
    }
  }

  onPointerUp(event: PointerEvent): void {
    this.activePointers.delete(event.pointerId);
    this.pinchStartDistance = 0;

    const remaining = this.activePointers.values().next();
    if (!remaining.done) {
      this.lastPointer = remaining.value;
      this.isPanning = true;
    } else {
      this.isPanning = false;
    }
  }

  private getPointersDistance(): number {
    const points = Array.from(this.activePointers.values());
    if (points.length < 2) {
      return 0;
    }
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }

  private setScale(next: number): void {
    this.scale = Math.min(this.maxScale, Math.max(this.minScale, next));
  }

  ngOnDestroy(): void {
    this.mapState.scale = this.scale;
    this.mapState.translateX = this.translateX;
    this.mapState.translateY = this.translateY;
  }
}
