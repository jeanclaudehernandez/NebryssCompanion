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
  readonly categorySizeOptions = ['small', 'medium', 'big', 'immense'];

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
  categorySize = '';
  imgUrl = '';
  thumbnail = '';
  mapX: number | null = null;
  mapY: number | null = null;
  isCapital = false;
  isWorldMap = false;

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

    this.applyInitialCoordinates();
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
    if (changes['initialMapX'] || changes['initialMapY']) {
      this.applyInitialCoordinates();
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

  submit(): void {
    if (!this.canSubmit) {
      return;
    }

    const payload = this.buildPayload(true);
    if (!payload) {
      return;
    }

    this.isSaving = true;
    this.dataService.createLocation(payload).subscribe({
      next: savedLocation => {
        this.lastCreatedLocation = savedLocation;
        this.locationId = savedLocation.id;
        this.toastService.show(`Created ${savedLocation.name} successfully`, 'success');
        this.dataService.refreshLocations().subscribe();
        this.isSaving = false;
      },
      error: err => {
        const message = err?.error?.error || err?.message || 'Unknown error';
        this.toastService.show(`Failed to create location: ${message}`, 'error');
        this.isSaving = false;
      }
    });
  }

  private applyInitialCoordinates(): void {
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
    const categorySize = this.categorySize.trim();

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
      isCapital: this.isCapital
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

    if (this.isWorldMap) {
      payload.isWorldMap = true;
    }

    return payload;
  }
}
