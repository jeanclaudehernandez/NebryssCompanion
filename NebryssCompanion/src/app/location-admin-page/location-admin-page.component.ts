import { CommonModule } from '@angular/common';
import { Component, DestroyRef, Input, OnChanges, OnInit, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminService } from '../admin.service';
import { DataService } from '../data.service';
import { Location } from '../model';
import { ToastService } from '../toast.service';

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
  lastCreatedLocation: Location | null = null;
  factionOptions: string[] = [];
  showFactionOptions = false;

  locationId: number | null = null;
  name = '';
  description = '';
  faction = '';
  category = '';
  categorySize: number | null = null;
  imgUrl = '';
  thumbnail = '';
  mapX: number | null = null;
  mapY: number | null = null;
  isCapital = false;
  isWorldMap = false;

  get isEditing(): boolean {
    return !!this.initialLocation;
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

  constructor(
    private readonly adminService: AdminService,
    private readonly dataService: DataService,
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
    if (!this.isAdmin || this.isSaving) {
      return false;
    }

    return !!this.name.trim() && !!this.description.trim() && !!this.faction.trim() && this.hasValidCoordinatePair();
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

  private applyInitialValues(): void {
    if (this.initialLocation) {
      this.locationId = this.initialLocation.id;
      this.name = this.initialLocation.name ?? '';
      this.description = this.initialLocation.description ?? '';
      this.faction = this.initialLocation.faction ?? '';
      this.category = this.initialLocation.category ?? '';
      this.categorySize = this.normalizeCategorySize(this.initialLocation.categorySize);
      this.imgUrl = this.initialLocation.imgUrl ?? '';
      this.thumbnail = this.initialLocation.thumbnail ?? '';
      this.mapX = typeof this.initialLocation.mapX === 'number' ? Number(this.initialLocation.mapX.toFixed(2)) : null;
      this.mapY = typeof this.initialLocation.mapY === 'number' ? Number(this.initialLocation.mapY.toFixed(2)) : null;
      this.isCapital = !!this.initialLocation.isCapital;
      this.isWorldMap = !!this.initialLocation.isWorldMap;
      return;
    }

    this.locationId = null;
    this.name = '';
    this.description = '';
    this.faction = '';
    this.category = '';
    this.categorySize = null;
    this.imgUrl = '';
    this.thumbnail = '';
    this.mapX = null;
    this.mapY = null;
    this.isCapital = false;
    this.isWorldMap = false;

    if (typeof this.initialMapX === 'number') {
      this.mapX = Number(this.initialMapX.toFixed(2));
    }

    if (typeof this.initialMapY === 'number') {
      this.mapY = Number(this.initialMapY.toFixed(2));
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

    if (validate && !faction) {
      this.toastService.show('Faction is required', 'error');
      return null;
    }

    if (!this.hasValidCoordinatePair()) {
      if (validate) {
        this.toastService.show('Map X and Map Y must be filled together', 'error');
        return null;
      }
    }

    const payload: Partial<Location> = {
      name,
      description,
      faction,
      isCapital: this.isCapital,
      isWorldMap: this.isWorldMap
    };

    if (typeof this.locationId === 'number' && !Number.isNaN(this.locationId)) {
      payload.id = this.locationId;
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
