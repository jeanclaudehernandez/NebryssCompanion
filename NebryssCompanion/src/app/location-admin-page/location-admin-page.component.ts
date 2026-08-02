import { CommonModule } from '@angular/common';
import { Component, DestroyRef, ElementRef, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, TemplateRef, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminService } from '../admin.service';
import { DataService } from '../data.service';
import { Location, SecretBlock } from '../model';
import { ModalService } from '../modal.service';
import { ToastService } from '../toast.service';
import { getLocationIconSrc } from '../location-icon-utils';

@Component({
  selector: 'app-location-admin-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './location-admin-page.component.html',
  styleUrls: ['./location-admin-page.component.css']
})
export class LocationAdminPageComponent implements OnInit, OnChanges {
  @Input() initialMapX: number | null = null;
  @Input() initialMapY: number | null = null;
  @Input() initialLocation: Location | null = null;
  @Output() navigateToWorldMap = new EventEmitter<string>();
  @ViewChild('deleteLocationConfirmDialog') deleteLocationConfirmDialog?: TemplateRef<any>;
  @ViewChild('mapPickerViewport') mapPickerViewportRef?: ElementRef<HTMLDivElement>;
  @ViewChild('mapPickerSurface') mapPickerSurfaceRef?: ElementRef<HTMLDivElement>;

  pickerScale = 1;
  pickerTranslateX = 0;
  pickerTranslateY = 0;
  isPickerPanning = false;

  private readonly minPickerScale = 0.6;
  private readonly maxPickerScale = 4;
  private pickerPointerStart = { x: 0, y: 0 };
  private pickerLastTranslate = { x: 0, y: 0 };
  private pickerDragDistance = 0;
  private activePickerPointerId: number | null = null;

  readonly categoryOptions = [
    'city',
    'forest',
    'fortress',
    'harbor',
    'industrial-zone',
    'mountain',
    'mystical-site',
    'ruins',
    'shrine',
    'swamp',
    'village',
    'volcanic-area',
    'wasteland'
  ];
  readonly categorySizeOptions = [
    { value: 1, label: 'Small' },
    { value: 2, label: 'Medium' },
    { value: 3, label: 'Big' },
    { value: 4, label: 'Immense' }
  ];

  private readonly destroyRef = inject(DestroyRef);

  isAdmin = false;
  isSaving = false;
  isDeleting = false;
  lastCreatedLocation: Location | null = null;
  factionOptions: string[] = [];
  showFactionOptions = false;
  worldMapImageUrl = 'https://iili.io/3R2Be6u.png';
  private locationDeleted = false;

  locationId: number | null = null;
  name = '';
  description = '';
  rpgMapLayout = '';
  privateNotes = '';
  secrets: SecretBlock[] = [];
  isSecret = false;
  isSecretRevealed = false;
  faction = '';
  category = '';
  categorySize: number | null = null;
  imgUrl = '';
  thumbnail = '';
  mapX: number | null = null;
  mapY: number | null = null;
  discovered = true;
  isCapital = false;
  isWorldMap = false;

  get isEditing(): boolean {
    return !!this.initialLocation && !this.locationDeleted;
  }

  get pageTitle(): string {
    return this.isEditing ? 'Location Editor' : 'Location Creator';
  }

  get submitLabel(): string {
    if (this.isSaving) {
      return this.isEditing ? 'Saving...' : 'Creating...';
    }

    return this.isEditing ? 'Save Changes' : 'Create Location';
  }

  get canDelete(): boolean {
    return this.isAdmin && this.isEditing && !this.isSaving && !this.isDeleting && typeof this.locationId === 'number';
  }

  get previewPinIconSrc(): string {
    return getLocationIconSrc(this.category, this.categorySize);
  }

  constructor(
    private readonly adminService: AdminService,
    private readonly dataService: DataService,
    private readonly modalService: ModalService,
    private readonly toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.adminService.isAdmin$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(isAdmin => {
        this.isAdmin = isAdmin;
      });

    this.dataService.getLore()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(lore => {
        this.factionOptions = [...new Set((lore.factions ?? []).map(faction => faction.name).filter(Boolean))]
          .sort((left, right) => left.localeCompare(right));
      });

    this.dataService.getLocations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => {
        const locations = data.locations || [];
        const worldMap = locations.find(l => l.isWorldMap || (l as any).isworldMap);
        if (worldMap?.imgUrl) {
          this.worldMapImageUrl = worldMap.imgUrl;
        }
      });

    this.applyInitialValues();
  }

  onFactionSelect(value: string): void {
    if (!value) {
      return;
    }

    this.faction = value;
    this.showFactionOptions = false;
  }

  onFactionFieldFocusOut(event: FocusEvent): void {
    const nextTarget = event.relatedTarget as Node | null;
    const currentTarget = event.currentTarget as HTMLElement | null;

    if (currentTarget?.contains(nextTarget)) {
      return;
    }

    this.showFactionOptions = false;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialMapX'] || changes['initialMapY'] || changes['initialLocation']) {
      this.applyInitialValues();
    }
  }

  get canSubmit(): boolean {
    if (!this.isAdmin || this.isSaving || this.isDeleting) {
      return false;
    }

    return !!this.name.trim() && !!this.description.trim() && this.hasValidCoordinatePair();
  }

  get previewJson(): string {
    return JSON.stringify(this.buildPayload(false), null, 2);
  }

  get filteredFactionOptions(): string[] {
    const query = this.faction.trim().toLowerCase();
    if (!query) {
      return this.factionOptions;
    }

    return this.factionOptions.filter(option => option.toLowerCase().includes(query));
  }

  formatOptionLabel(value: string): string {
    return value
      .split('-')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  getCategorySizeLabel(value: number | string | null | undefined): string {
    const numericValue = Number(value);
    return this.categorySizeOptions.find(option => option.value === numericValue)?.label ?? 'n/a';
  }

  get pickerZoomPercent(): number {
    return Math.round(this.pickerScale * 100);
  }

  get pickerTransform(): string {
    return `translate(${this.pickerTranslateX}px, ${this.pickerTranslateY}px) scale(${this.pickerScale})`;
  }

  openLocationOnWorldMap(): void {
    const locationName = this.name.trim();
    if (!locationName) {
      this.toastService.show('Please enter a location name to view it on the map', 'info');
      return;
    }

    this.navigateToWorldMap.emit(locationName);
  }

  zoomInPicker(): void {
    this.setPickerScale(this.pickerScale * 1.25);
  }

  zoomOutPicker(): void {
    this.setPickerScale(this.pickerScale / 1.25);
  }

  resetPickerView(): void {
    this.pickerScale = 1;
    this.pickerTranslateX = 0;
    this.pickerTranslateY = 0;
  }

  private setPickerScale(targetScale: number): void {
    this.pickerScale = Number(Math.min(this.maxPickerScale, Math.max(this.minPickerScale, targetScale)).toFixed(2));
    if (this.pickerScale === 1) {
      this.pickerTranslateX = 0;
      this.pickerTranslateY = 0;
    }
  }

  onPickerWheel(event: WheelEvent): void {
    event.preventDefault();
    const zoomFactor = event.deltaY < 0 ? 1.15 : 0.85;
    this.setPickerScale(this.pickerScale * zoomFactor);
  }

  onPickerPointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }

    const viewport = this.mapPickerViewportRef?.nativeElement;
    if (viewport) {
      viewport.setPointerCapture(event.pointerId);
    }

    this.activePickerPointerId = event.pointerId;
    this.isPickerPanning = true;
    this.pickerPointerStart = { x: event.clientX, y: event.clientY };
    this.pickerLastTranslate = { x: this.pickerTranslateX, y: this.pickerTranslateY };
    this.pickerDragDistance = 0;
  }

  onPickerPointerMove(event: PointerEvent): void {
    if (!this.isPickerPanning || this.activePickerPointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - this.pickerPointerStart.x;
    const deltaY = event.clientY - this.pickerPointerStart.y;
    this.pickerDragDistance = Math.hypot(deltaX, deltaY);

    if (this.pickerScale > 1 || this.pickerDragDistance > 5) {
      this.pickerTranslateX = this.pickerLastTranslate.x + deltaX;
      this.pickerTranslateY = this.pickerLastTranslate.y + deltaY;
    }
  }

  onPickerPointerUp(event: PointerEvent): void {
    if (this.activePickerPointerId !== event.pointerId) {
      return;
    }

    const viewport = this.mapPickerViewportRef?.nativeElement;
    if (viewport && viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }

    this.isPickerPanning = false;
    this.activePickerPointerId = null;

    if (this.pickerDragDistance <= 5) {
      this.setPinCoordinatesFromPointer(event.clientX, event.clientY);
    }
  }

  private setPinCoordinatesFromPointer(clientX: number, clientY: number): void {
    const surface = this.mapPickerSurfaceRef?.nativeElement;
    if (!surface) {
      return;
    }

    const rect = surface.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const relativeX = ((clientX - rect.left) / rect.width) * 100;
    const relativeY = ((clientY - rect.top) / rect.height) * 100;

    this.mapX = Number(Math.min(100, Math.max(0, relativeX)).toFixed(2));
    this.mapY = Number(Math.min(100, Math.max(0, relativeY)).toFixed(2));
  }

  addSecretBlock(): void {
    this.secrets.push({
      id: `sec-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title: '',
      content: '',
      isRevealed: false
    });
  }

  removeSecretBlock(index: number): void {
    if (index >= 0 && index < this.secrets.length) {
      this.secrets.splice(index, 1);
    }
  }

  toggleSecretBlockReveal(index: number): void {
    if (index >= 0 && index < this.secrets.length) {
      this.secrets[index].isRevealed = !this.secrets[index].isRevealed;
    }
  }

  submit(): void {
    if (!this.canSubmit) {
      return;
    }

    const payload = this.buildPayload(true);
    if (!payload) {
      return;
    }

    this.isSaving = true;
    const request$ = this.isEditing
      ? this.dataService.updateLocation(payload as Location)
      : this.dataService.createLocation(payload);

    request$.subscribe({
      next: savedLocation => {
        this.lastCreatedLocation = savedLocation;
        this.locationId = savedLocation.id;
        this.toastService.show(
          `${this.isEditing ? 'Updated' : 'Created'} ${savedLocation.name} successfully`,
          'success'
        );
        this.dataService.refreshLocations().subscribe();
        this.isSaving = false;
      },
      error: err => {
        const message = err?.error?.error || err?.message || 'Unknown error';
        this.toastService.show(
          `Failed to ${this.isEditing ? 'update' : 'create'} location: ${message}`,
          'error'
        );
        this.isSaving = false;
      }
    });
  }

  promptDeleteLocation(): void {
    if (!this.canDelete || !this.deleteLocationConfirmDialog) {
      return;
    }

    this.modalService.openFromTemplate(this.deleteLocationConfirmDialog, {
      locationName: this.name.trim() || 'this location',
      confirm: () => this.confirmDeleteLocation(),
      cancel: () => this.modalService.close()
    });
  }

  private confirmDeleteLocation(): void {
    if (!this.canDelete || typeof this.locationId !== 'number') {
      this.modalService.close();
      return;
    }

    const deletedLocationName = this.name.trim() || 'Location';
    const deletedMapX = this.mapX;
    const deletedMapY = this.mapY;

    this.isDeleting = true;
    this.modalService.close();

    this.dataService.deleteLocation(this.locationId).subscribe({
      next: () => {
        this.locationDeleted = true;
        this.lastCreatedLocation = null;
        this.resetForm(deletedMapX, deletedMapY);
        this.toastService.show(`Deleted ${deletedLocationName} successfully`, 'success');
        this.dataService.refreshLocations().subscribe();
        this.isDeleting = false;
      },
      error: err => {
        const message = err?.error?.error || err?.message || 'Unknown error';
        this.toastService.show(`Failed to delete location: ${message}`, 'error');
        this.isDeleting = false;
      }
    });
  }

  private applyInitialValues(): void {
    this.locationDeleted = false;
    this.resetPickerView();

    if (this.initialLocation) {
      this.locationId = this.initialLocation.id;
      this.name = this.initialLocation.name ?? '';
      this.description = this.initialLocation.description ?? '';
      this.rpgMapLayout = this.initialLocation.rpgMapLayout ?? '';
      this.privateNotes = this.initialLocation.privateNotes ?? '';
      
      if (this.initialLocation.secrets && this.initialLocation.secrets.length > 0) {
        this.secrets = this.initialLocation.secrets.map(s => ({ ...s }));
      } else if (this.privateNotes.trim()) {
        this.secrets = [
          {
            id: `sec-${Date.now()}`,
            title: 'GM Secret Notes',
            content: this.privateNotes.trim(),
            isRevealed: !!this.initialLocation.isSecretRevealed
          }
        ];
      } else {
        this.secrets = [];
      }

      this.isSecret = !!this.initialLocation.isSecret;
      this.isSecretRevealed = !!this.initialLocation.isSecretRevealed;
      this.faction = this.initialLocation.faction ?? '';
      this.category = this.initialLocation.category ?? '';
      this.categorySize = this.normalizeCategorySize(this.initialLocation.categorySize);
      this.imgUrl = this.initialLocation.imgUrl ?? '';
      this.thumbnail = this.initialLocation.thumbnail ?? '';
      this.mapX = typeof this.initialLocation.mapX === 'number' ? Number(this.initialLocation.mapX.toFixed(2)) : null;
      this.mapY = typeof this.initialLocation.mapY === 'number' ? Number(this.initialLocation.mapY.toFixed(2)) : null;
      this.isCapital = !!this.initialLocation.isCapital;
      this.isWorldMap = !!this.initialLocation.isWorldMap;
      this.discovered = this.initialLocation.discovered !== false;
      return;
    }

    this.resetForm(this.initialMapX, this.initialMapY);
  }

  private resetForm(mapX: number | null = null, mapY: number | null = null): void {
    this.locationId = null;
    this.name = '';
    this.description = '';
    this.rpgMapLayout = '';
    this.privateNotes = '';
    this.secrets = [];
    this.isSecret = false;
    this.isSecretRevealed = false;
    this.faction = '';
    this.category = '';
    this.categorySize = null;
    this.imgUrl = '';
    this.thumbnail = '';
    this.mapX = null;
    this.mapY = null;
    this.discovered = true;
    this.isCapital = false;
    this.isWorldMap = false;
    this.showFactionOptions = false;
    this.resetPickerView();

    if (typeof mapX === 'number') {
      this.mapX = Number(mapX.toFixed(2));
    }

    if (typeof mapY === 'number') {
      this.mapY = Number(mapY.toFixed(2));
    }
  }

  private hasValidCoordinatePair(): boolean {
    const hasMapX = this.mapX !== null && !Number.isNaN(this.mapX);
    const hasMapY = this.mapY !== null && !Number.isNaN(this.mapY);
    return hasMapX === hasMapY;
  }

  private buildPayload(validate: boolean): Partial<Location> | null {
    const name = this.name.trim();
    const description = this.description.trim();
    const rpgMapLayout = this.rpgMapLayout.trim();
    const faction = this.faction.trim();
    const category = this.category.trim();
    const categorySize = this.categorySize;

    if (validate && !name) {
      this.toastService.show('Location name is required', 'error');
      return null;
    }

    if (validate && !description) {
      this.toastService.show('Description is required', 'error');
      return null;
    }

    if (!this.hasValidCoordinatePair()) {
      if (validate) {
        this.toastService.show('Map X and Map Y must be filled together', 'error');
        return null;
      }
    }

    const cleanSecrets = this.secrets
      .filter(s => s.content.trim())
      .map(s => ({
        id: s.id || `sec-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        title: s.title?.trim() || '',
        content: s.content.trim(),
        isRevealed: !!s.isRevealed
      }));

    const payload: Partial<Location> = {
      name,
      description,
      faction: faction || "",
      discovered: !!this.discovered,
      isCapital: !!this.isCapital,
      isWorldMap: !!this.isWorldMap,
      isSecret: !!this.isSecret,
      secrets: cleanSecrets
    };

    if (typeof this.locationId === 'number' && !Number.isNaN(this.locationId)) {
      payload.id = this.locationId;
    }

    if (rpgMapLayout) {
      payload.rpgMapLayout = rpgMapLayout;
    }

    if (this.imgUrl.trim()) {
      payload.imgUrl = this.imgUrl.trim();
    }

    if (this.thumbnail.trim()) {
      payload.thumbnail = this.thumbnail.trim();
    }

    if (category) {
      payload.category = category;
    }

    if (categorySize) {
      payload.categorySize = categorySize;
    }

    if (this.mapX !== null && this.mapY !== null) {
      payload.mapX = Number(this.mapX);
      payload.mapY = Number(this.mapY);
    }

    return payload;
  }

  private normalizeCategorySize(value: string | number | null | undefined): number | null {
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return value;
    }

    const normalized = String(value ?? '').trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    const numericValue = Number(normalized);
    if (!Number.isNaN(numericValue)) {
      return numericValue;
    }

    switch (normalized) {
      case 'small':
        return 1;
      case 'medium':
        return 2;
      case 'big':
        return 3;
      case 'immense':
        return 4;
      default:
        return null;
    }
  }
}
