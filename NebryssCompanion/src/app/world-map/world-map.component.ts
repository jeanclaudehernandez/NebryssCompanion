import { Component, OnInit, OnChanges, AfterViewInit, OnDestroy, ChangeDetectorRef, Output, EventEmitter, Input, SimpleChanges, ViewEncapsulation, DestroyRef, TemplateRef, ViewChild, ElementRef, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminService } from '../admin.service';
import { DataService } from '../data.service';
import { Location } from '../model';
import { ModalService } from '../modal.service';
import { WORLD_MAP_PIN_COORDINATES } from './world-map-pin-coordinates';
import { WorldMapStateService } from './world-map-state.service';
import { FACTION_COLORS, DEFAULT_FACTION_COLOR } from './world-map-faction-colors';

export interface MapPin {
  location: Location;
  x: number;
  y: number;
  animationDelay: string;
  locationIconSrc: string;
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
export class WorldMapComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
  @Input() focusLocationName: string | null = null;
  @Output() navigateToLocation = new EventEmitter<string>();
  @Output() navigateToLore = new EventEmitter<string>();
  @Output() navigateToAdminLocationCreator = new EventEmitter<{ mapX: number | null; mapY: number | null; location: Location | null }>();
  @ViewChild('mapViewport') mapViewportRef?: ElementRef<HTMLDivElement>;
  @ViewChild('mapSurface') mapSurfaceRef?: ElementRef<HTMLDivElement>;
  @ViewChild('createLocationConfirmDialog') createLocationConfirmDialog?: TemplateRef<any>;

  private readonly destroyRef = inject(DestroyRef);

  worldMapLocation: Location | null = null;
  pins: MapPin[] = [];
  selectedPin: Location | null = null;
  isAdmin = false;
  private locationsData: Location[] = [];

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
  private pendingCreateCoords: { x: number; y: number } | null = null;
  private longPressTimer: number | null = null;
  private longPressPointerId: number | null = null;
  private longPressStartPoint: { x: number; y: number } | null = null;
  private longPressTriggered = false;
  private mapImageLoaded = false;
  private readonly longPressDuration = 650;
  private readonly longPressMoveTolerance = 12;

  constructor(
    private dataService: DataService,
    private cdr: ChangeDetectorRef,
    private mapState: WorldMapStateService,
    private adminService: AdminService,
    private modalService: ModalService
  ) {}

  ngOnInit(): void {
    // restore whatever focus (pan/zoom) was active last time this view was open
    this.scale = this.mapState.scale;
    this.translateX = this.mapState.translateX;
    this.translateY = this.mapState.translateY;

    this.adminService.isAdmin$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(isAdmin => {
        this.isAdmin = isAdmin;
      });

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
      this.applyRequestedFocus();
      this.cdr.markForCheck();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['focusLocationName']) {
      this.applyRequestedFocus();
    }
  }

  ngAfterViewInit(): void {
    this.clampPan();
    this.applyRequestedFocus();
  }

  onMapImageLoad(): void {
    this.mapImageLoaded = true;
    this.clampPan();
    this.applyRequestedFocus();
    this.cdr.markForCheck();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.clampPan();
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
      locationIconSrc: this.getLocationIconSrc(location.category, location.categorySize),
      factionColor: FACTION_COLORS[location.faction] ?? DEFAULT_FACTION_COLOR
    };
  }

  private getLocationIconSrc(category?: string, categorySize?: string | number): string {
    const family = this.getLocationIconFamily(category);
    const size = this.getLocationIconSize(categorySize);
    const variantFolder = this.getLocationIconVariantFolder(family);

    return variantFolder
      ? `assets/icons/extracted/${family}/${variantFolder}/${family}-${size}.png`
      : `assets/icons/extracted/${family}/${family}-${size}.png`;
  }

  private getLocationIconFamily(category?: string): string {
    const normalizedCategory = (category ?? '').trim().toLowerCase();

    if (!normalizedCategory) {
      return 'city';
    }

    const iconMappings: Array<{ terms: string[]; family: string }> = [
      { terms: ['capital', 'city', 'metropolis', 'urban'], family: 'city' },
      { terms: ['village', 'town', 'settlement', 'hamlet', 'outpost'], family: 'village' },
      { terms: ['fortress', 'citadel', 'stronghold', 'bastion', 'keep', 'castle', 'garrison', 'military'], family: 'fortress' },
      { terms: ['port', 'harbor', 'harbour', 'dock', 'shipyard', 'anchorage'], family: 'harbor' },
      { terms: ['industrial', 'factory', 'forge', 'workshop', 'mine'], family: 'industrial-zone' },
      { terms: ['mystical', 'arcane', 'mist', 'ritual', 'temple'], family: 'mystical-site' },
      { terms: ['shrine', 'cathedral', 'church', 'sanctum'], family: 'shrine' },
      { terms: ['forest', 'grove', 'woods', 'jungle'], family: 'forest' },
      { terms: ['mountain', 'peak', 'cliff', 'highland'], family: 'mountain' },
      { terms: ['ruin', 'ancient'], family: 'ruins' },
      { terms: ['swamp', 'marsh', 'bog'], family: 'swamp' },
      { terms: ['volcanic', 'ember', 'ash', 'lava', 'fire'], family: 'volcanic-area' },
      { terms: ['wasteland', 'desert', 'barren'], family: 'wasteland' }
    ];

    const match = iconMappings.find(mapping =>
      mapping.terms.some(term => normalizedCategory.includes(term))
    );

    return match?.family ?? 'city';
  }

  private getLocationIconVariantFolder(family: string): string | null {
    if (family === 'mystical-site' || family === 'wasteland') {
      return 'variant-1';
    }

    return null;
  }

  private getLocationIconSize(categorySize?: string | number): string {
    if (typeof categorySize === 'number') {
      if (categorySize <= 1) {
        return 'small';
      }
      if (categorySize >= 4) {
        return 'immense';
      }
      if (categorySize >= 3) {
        return 'big';
      }
      return 'medium';
    }

    const normalizedSize = String(categorySize ?? '').trim().toLowerCase();
    const parsedNumericSize = Number(normalizedSize);

    if (normalizedSize && !Number.isNaN(parsedNumericSize)) {
      if (parsedNumericSize <= 1) {
        return 'small';
      }
      if (parsedNumericSize >= 4) {
        return 'immense';
      }
      if (parsedNumericSize >= 3) {
        return 'big';
      }
      return 'medium';
    }

    if (
      ['tiny', 'small', 'minor', 'outpost', 'hamlet'].some(term => normalizedSize.includes(term)) ||
      ['xs', 's'].includes(normalizedSize)
    ) {
      return 'small';
    }

    if (
      ['large', 'major', 'grand', 'huge'].some(term => normalizedSize.includes(term)) ||
      ['xl', 'l'].includes(normalizedSize)
    ) {
      return 'big';
    }

    if (['immense', 'gigantic', 'massive'].some(term => normalizedSize.includes(term))) {
      return 'immense';
    }

    return 'medium';
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

  editLocation(pin: Location): void {
    if (!this.isAdmin) {
      return;
    }

    this.navigateToAdminLocationCreator.emit({
      mapX: pin.mapX ?? null,
      mapY: pin.mapY ?? null,
      location: pin
    });
    this.closePopup();
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
    this.clampPan();
  }

  onWheel(event: WheelEvent): void {
    event.preventDefault();
    this.setScale(this.scale + (event.deltaY > 0 ? -0.15 : 0.15));
  }

  onPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    (event.target as Element).setPointerCapture?.(event.pointerId);
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.activePointers.size === 1) {
      this.isPanning = true;
      this.lastPointer = { x: event.clientX, y: event.clientY };
      this.startLongPress(event);
    } else if (this.activePointers.size === 2) {
      this.isPanning = false;
      this.pinchStartDistance = this.getPointersDistance();
      this.pinchStartScale = this.scale;
      this.cancelLongPress();
    }
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.activePointers.has(event.pointerId)) {
      return;
    }
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.longPressPointerId === event.pointerId && this.longPressStartPoint) {
      const movedDistance = Math.hypot(
        event.clientX - this.longPressStartPoint.x,
        event.clientY - this.longPressStartPoint.y
      );
      if (movedDistance > this.longPressMoveTolerance) {
        this.cancelLongPress();
      }
    }

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
      this.clampPan();
    }
  }

  onPointerUp(event: PointerEvent): void {
    this.activePointers.delete(event.pointerId);
    this.pinchStartDistance = 0;
    if (this.longPressPointerId === event.pointerId || this.longPressTriggered) {
      this.cancelLongPress();
    }

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
    this.clampPan();
  }

  private applyRequestedFocus(): void {
    const requestedName = this.focusLocationName?.trim();
    if (!requestedName || !this.mapImageLoaded) {
      return;
    }

    const targetPin = this.pins.find(pin => pin.location.name === requestedName);
    if (!targetPin) {
      if (this.worldMapLocation?.name === requestedName) {
        this.resetView();
      }
      return;
    }

    this.focusPin(targetPin);
  }

  private focusPin(pin: MapPin): void {
    const surface = this.mapSurfaceRef?.nativeElement;
    const viewport = this.mapViewportRef?.nativeElement;
    if (!surface || !viewport || !surface.offsetWidth || !surface.offsetHeight) {
      return;
    }

    const targetScale = Math.max(this.scale, 1.35);
    this.scale = Math.min(this.maxScale, Math.max(this.minScale, targetScale));

    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    const baseLeft = (viewportWidth - surface.offsetWidth) / 2;
    const baseTop = (viewportHeight - surface.offsetHeight) / 2;
    const targetX = (pin.x / 100) * surface.offsetWidth;
    const targetY = (pin.y / 100) * surface.offsetHeight;

    this.translateX = viewportWidth / 2 - baseLeft - (targetX * this.scale);
    this.translateY = viewportHeight / 2 - baseTop - (targetY * this.scale);
    this.selectedPin = pin.location;
    this.clampPan();
    this.cdr.markForCheck();
  }

  // keeps the map image from being panned/zoomed past its own edges, leaving empty space in the viewport
  private clampPan(): void {
    const surface = this.mapSurfaceRef?.nativeElement;
    const viewport = this.mapViewportRef?.nativeElement;
    if (!surface || !viewport || !surface.offsetWidth || !surface.offsetHeight) {
      return;
    }

    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    const baseLeft = (viewportWidth - surface.offsetWidth) / 2;
    const baseTop = (viewportHeight - surface.offsetHeight) / 2;

    this.translateX = this.clampAxis(this.translateX, baseLeft, viewportWidth, surface.offsetWidth * this.scale);
    this.translateY = this.clampAxis(this.translateY, baseTop, viewportHeight, surface.offsetHeight * this.scale);
  }

  private clampAxis(translate: number, base: number, viewportSize: number, scaledSize: number): number {
    if (scaledSize <= viewportSize) {
      // smaller than the viewport: always centered, no free panning range that could park it in a corner
      return (viewportSize - scaledSize) / 2 - base;
    }
    const clampedEdge = Math.min(0, Math.max(viewportSize - scaledSize, base + translate));
    return clampedEdge - base;
  }

  private startLongPress(event: PointerEvent): void {
    this.cancelLongPress();

    if (!this.isAdmin) {
      return;
    }

    const target = event.target as Element | null;
    if (!target?.closest('.map-surface') || target.closest('.map-pin')) {
      return;
    }

    this.longPressPointerId = event.pointerId;
    this.longPressStartPoint = { x: event.clientX, y: event.clientY };
    this.longPressTriggered = false;
    this.longPressTimer = window.setTimeout(() => {
      const coords = this.getCoordinatesFromPointer(event.clientX, event.clientY);
      if (!coords || !this.createLocationConfirmDialog) {
        return;
      }

      this.longPressTriggered = true;
      this.isPanning = false;
      this.pendingCreateCoords = coords;
      this.modalService.openFromTemplate(this.createLocationConfirmDialog, {
        coords,
        confirm: () => this.confirmCreateLocation(),
        cancel: () => this.cancelCreateLocationPrompt()
      });
    }, this.longPressDuration);
  }

  private cancelLongPress(): void {
    if (this.longPressTimer !== null) {
      window.clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.longPressPointerId = null;
    this.longPressStartPoint = null;
    this.longPressTriggered = false;
  }

  private getCoordinatesFromPointer(clientX: number, clientY: number): { x: number; y: number } | null {
    const surface = this.mapSurfaceRef?.nativeElement;
    if (!surface) {
      return null;
    }

    const rect = surface.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return null;
    }

    const relativeX = ((clientX - rect.left) / rect.width) * 100;
    const relativeY = ((clientY - rect.top) / rect.height) * 100;

    return {
      x: Number(Math.min(100, Math.max(0, relativeX)).toFixed(2)),
      y: Number(Math.min(100, Math.max(0, relativeY)).toFixed(2))
    };
  }

  private confirmCreateLocation(): void {
    if (!this.pendingCreateCoords) {
      this.cancelCreateLocationPrompt();
      return;
    }

    this.navigateToAdminLocationCreator.emit({
      mapX: this.pendingCreateCoords.x,
      mapY: this.pendingCreateCoords.y,
      location: null
    });
    this.cancelCreateLocationPrompt();
  }

  private cancelCreateLocationPrompt(): void {
    this.pendingCreateCoords = null;
    this.modalService.close();
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.cancelLongPress();
    this.modalService.close();
    this.mapState.scale = this.scale;
    this.mapState.translateX = this.translateX;
    this.mapState.translateY = this.translateY;
  }
}
