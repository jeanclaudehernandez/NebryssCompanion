import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { AdminService } from '../admin.service';
import { DataService } from '../data.service';
import { ToastService } from '../toast.service';
import { NavigationHistoryService } from '../navigation-history.service';
import { AlteredState, WeaponRule, MistEffect, Terrain } from '../model';

type RuleTab = 'alteredStates' | 'weaponRules' | 'terrains' | 'mistEffects';

interface TabDefinition {
  key: RuleTab;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-rules-admin-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './rules-admin-page.component.html',
  styleUrls: ['./rules-admin-page.component.css']
})
export class RulesAdminPageComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly dataService = inject(DataService);
  private readonly adminService = inject(AdminService);
  private readonly toastService = inject(ToastService);
  private readonly navigationHistory = inject(NavigationHistoryService);

  isAdmin = false;
  isLoading = true;
  isSaving = false;
  isDeleting = false;
  showDeleteConfirm = false;

  activeTab: RuleTab = 'alteredStates';
  searchTerm = '';
  isSelectorCollapsed = false;

  toggleSelectorCollapse(): void {
    this.isSelectorCollapsed = !this.isSelectorCollapsed;
  }

  readonly tabs: TabDefinition[] = [
    { key: 'alteredStates', label: 'Altered States', icon: 'bolt' },
    { key: 'weaponRules', label: 'Weapon Rules', icon: 'gavel' },
    { key: 'terrains', label: 'Terrains', icon: 'terrain' },
    { key: 'mistEffects', label: 'Mist Effects', icon: 'cloud' }
  ];

  // Data arrays
  alteredStates: AlteredState[] = [];
  weaponRules: WeaponRule[] = [];
  terrains: Terrain[] = [];
  mistEffects: MistEffect[] = [];

  // Selected entry id (null = create new)
  selectedId: number | string | null = null;

  // --- Altered State form fields ---
  asName = '';
  asEffect = '';

  // --- Weapon Rule form fields ---
  wrName = '';
  wrEffect = '';
  wrPrModifier: number | string | null = null;

  // --- Terrain form fields ---
  trName = '';
  trDescription = '';
  trImageUrl = '';
  trThumbnailUrl = '';

  // --- Mist Effect form fields ---
  meEffectName = '';
  meDensityLevel = '';
  meDescription = '';

  get filteredList(): any[] {
    const term = this.searchTerm.toLowerCase().trim();
    let list: any[];
    let nameKey: string;

    switch (this.activeTab) {
      case 'alteredStates':
        list = this.alteredStates;
        nameKey = 'name';
        break;
      case 'weaponRules':
        list = this.weaponRules;
        nameKey = 'name';
        break;
      case 'terrains':
        list = this.terrains;
        nameKey = 'name';
        break;
      case 'mistEffects':
        list = this.mistEffects;
        nameKey = 'effectName';
        break;
      default:
        return [];
    }

    if (!term) {
      return [...list].sort((a, b) => (a[nameKey] || '').localeCompare(b[nameKey] || ''));
    }

    return list
      .filter(item => (item[nameKey] || '').toLowerCase().includes(term))
      .sort((a, b) => (a[nameKey] || '').localeCompare(b[nameKey] || ''));
  }

  get isEditing(): boolean {
    return this.selectedId !== null;
  }

  get canSubmit(): boolean {
    if (!this.isAdmin || this.isSaving) {
      return false;
    }

    switch (this.activeTab) {
      case 'alteredStates':
        return !!this.asName.trim();
      case 'weaponRules':
        return !!this.wrName.trim();
      case 'terrains':
        return !!this.trName.trim();
      case 'mistEffects':
        return !!this.meEffectName.trim();
      default:
        return false;
    }
  }

  get formTitle(): string {
    const tabLabel = this.tabs.find(t => t.key === this.activeTab)?.label || '';
    const singular = tabLabel.replace(/s$/, '');
    return this.isEditing ? `Edit ${singular}` : `Create New ${singular}`;
  }

  get formIcon(): string {
    return this.isEditing ? 'edit' : 'add_circle';
  }

  getDisplayName(item: any): string {
    if (this.activeTab === 'mistEffects') {
      return item.effectName || '(unnamed)';
    }
    return item.name || '(unnamed)';
  }

  getSubtitle(item: any): string {
    switch (this.activeTab) {
      case 'alteredStates':
        return this.stripHtml(item.effect || '').slice(0, 60);
      case 'weaponRules': {
        const parts: string[] = [];
        if (item.prModifier !== null && item.prModifier !== undefined) {
          parts.push(`PR: ${item.prModifier}`);
        }
        parts.push(this.stripHtml(item.effect || '').slice(0, 50));
        return parts.join(' · ');
      }
      case 'terrains':
        return this.stripHtml(item.description || '').slice(0, 60);
      case 'mistEffects':
        return `${item.densityLevel || 'Unknown'} · ${this.stripHtml(item.description || '').slice(0, 40)}`;
      default:
        return '';
    }
  }

  private stripHtml(html: string): string {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || '';
  }

  ngOnInit(): void {
    this.navigationHistory.registerModalHandler(() => {
      if (this.showDeleteConfirm) {
        this.showDeleteConfirm = false;
        return true;
      }
      return false;
    }, this.destroyRef);

    this.adminService.isAdmin$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(isAdmin => {
        this.isAdmin = isAdmin;
      });

    this.loadAllData();
  }

  private loadAllData(): void {
    this.isLoading = true;
    forkJoin({
      alteredStates: this.dataService.getAlteredStates(),
      weaponRules: this.dataService.getWeaponRules(),
      terrains: this.dataService.getTerrains(),
      mistEffects: this.dataService.getMistEffects()
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ alteredStates, weaponRules, terrains, mistEffects }) => {
          this.alteredStates = alteredStates || [];
          this.weaponRules = weaponRules || [];
          this.terrains = terrains || [];
          this.mistEffects = mistEffects || [];
          this.isLoading = false;
        },
        error: () => {
          this.isLoading = false;
          this.toastService.show('Failed to load rules data', 'error');
        }
      });
  }

  switchTab(tab: RuleTab): void {
    this.activeTab = tab;
    this.resetForm();
    this.searchTerm = '';
  }

  selectEntry(item: any): void {
    if (this.selectedId === item.id) {
      this.resetForm();
      return;
    }

    this.showDeleteConfirm = false;

    switch (this.activeTab) {
      case 'alteredStates':
        this.selectedId = item.id;
        this.asName = item.name || '';
        this.asEffect = item.effect || '';
        break;
      case 'weaponRules':
        this.selectedId = item.id;
        this.wrName = item.name || '';
        this.wrEffect = item.effect || '';
        this.wrPrModifier = item.prModifier ?? null;
        break;
      case 'terrains':
        this.selectedId = item.id;
        this.trName = item.name || '';
        this.trDescription = item.description || '';
        this.trImageUrl = item.imageUrl || '';
        this.trThumbnailUrl = item.thumbnailUrl || '';
        break;
      case 'mistEffects':
        this.selectedId = item.id;
        this.meEffectName = item.effectName || '';
        this.meDensityLevel = item.densityLevel || '';
        this.meDescription = item.description || '';
        break;
    }
  }

  resetForm(): void {
    this.selectedId = null;
    this.showDeleteConfirm = false;

    this.asName = '';
    this.asEffect = '';

    this.wrName = '';
    this.wrEffect = '';
    this.wrPrModifier = null;

    this.trName = '';
    this.trDescription = '';
    this.trImageUrl = '';
    this.trThumbnailUrl = '';

    this.meEffectName = '';
    this.meDensityLevel = '';
    this.meDescription = '';
  }

  save(): void {
    if (!this.canSubmit) {
      return;
    }

    this.isSaving = true;

    switch (this.activeTab) {
      case 'alteredStates':
        this.saveAlteredState();
        break;
      case 'weaponRules':
        this.saveWeaponRule();
        break;
      case 'terrains':
        this.saveTerrain();
        break;
      case 'mistEffects':
        this.saveMistEffect();
        break;
    }
  }

  private saveAlteredState(): void {
    const payload: AlteredState = {
      id: (this.selectedId as number) || 0,
      name: this.asName.trim(),
      effect: this.asEffect.trim()
    };

    const request$ = this.isEditing
      ? this.dataService.updateAlteredState(payload)
      : this.dataService.createAlteredState(payload);

    request$.subscribe({
      next: (saved) => {
        this.isSaving = false;
        this.toastService.show(
          `${this.isEditing ? 'Updated' : 'Created'} "${saved.name}" successfully`,
          'success'
        );
        this.dataService.refreshAlteredStates().subscribe(states => {
          this.alteredStates = states;
        });
        if (this.isEditing) {
          this.selectEntry(saved);
        } else {
          this.resetForm();
        }
      },
      error: (err) => {
        this.isSaving = false;
        const message = err?.error?.error || err?.message || 'Unknown error';
        this.toastService.show(`Failed to save altered state: ${message}`, 'error');
      }
    });
  }

  private saveWeaponRule(): void {
    const payload: WeaponRule = {
      id: (this.selectedId as number) || 0,
      name: this.wrName.trim(),
      effect: this.wrEffect.trim(),
      prModifier: this.wrPrModifier
    };

    const request$ = this.isEditing
      ? this.dataService.updateWeaponRule(payload)
      : this.dataService.createWeaponRule(payload);

    request$.subscribe({
      next: (saved) => {
        this.isSaving = false;
        this.toastService.show(
          `${this.isEditing ? 'Updated' : 'Created'} "${saved.name}" successfully`,
          'success'
        );
        this.dataService.refreshWeaponRules().subscribe(rules => {
          this.weaponRules = rules;
        });
        if (this.isEditing) {
          this.selectEntry(saved);
        } else {
          this.resetForm();
        }
      },
      error: (err) => {
        this.isSaving = false;
        const message = err?.error?.error || err?.message || 'Unknown error';
        this.toastService.show(`Failed to save weapon rule: ${message}`, 'error');
      }
    });
  }

  private saveTerrain(): void {
    const payload: Terrain = {
      id: (this.selectedId as number) || 0,
      name: this.trName.trim(),
      description: this.trDescription.trim(),
      imageUrl: this.trImageUrl.trim(),
      thumbnailUrl: this.trThumbnailUrl.trim()
    };

    const request$ = this.isEditing
      ? this.dataService.updateTerrain(payload)
      : this.dataService.createTerrain(payload);

    request$.subscribe({
      next: (saved) => {
        this.isSaving = false;
        this.toastService.show(
          `${this.isEditing ? 'Updated' : 'Created'} "${saved.name}" successfully`,
          'success'
        );
        this.dataService.refreshTerrains().subscribe(terrains => {
          this.terrains = terrains;
        });
        if (this.isEditing) {
          this.selectEntry(saved);
        } else {
          this.resetForm();
        }
      },
      error: (err) => {
        this.isSaving = false;
        const message = err?.error?.error || err?.message || 'Unknown error';
        this.toastService.show(`Failed to save terrain: ${message}`, 'error');
      }
    });
  }

  private saveMistEffect(): void {
    const payload: MistEffect = {
      id: (this.selectedId as number) || 0,
      effectName: this.meEffectName.trim(),
      densityLevel: this.meDensityLevel.trim(),
      description: this.meDescription.trim()
    };

    const request$ = this.isEditing
      ? this.dataService.updateMistEffect(payload)
      : this.dataService.createMistEffect(payload);

    request$.subscribe({
      next: (saved) => {
        this.isSaving = false;
        this.toastService.show(
          `${this.isEditing ? 'Updated' : 'Created'} "${saved.effectName}" successfully`,
          'success'
        );
        this.dataService.refreshMistEffects().subscribe(effects => {
          this.mistEffects = effects;
        });
        if (this.isEditing) {
          this.selectEntry(saved);
        } else {
          this.resetForm();
        }
      },
      error: (err) => {
        this.isSaving = false;
        const message = err?.error?.error || err?.message || 'Unknown error';
        this.toastService.show(`Failed to save mist effect: ${message}`, 'error');
      }
    });
  }

  confirmDelete(): void {
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
  }

  deleteEntry(): void {
    if (!this.selectedId) {
      return;
    }

    this.isDeleting = true;
    const id = this.selectedId;

    let request$;
    let entityLabel: string;

    switch (this.activeTab) {
      case 'alteredStates':
        request$ = this.dataService.deleteAlteredState(id as number);
        entityLabel = 'Altered state';
        break;
      case 'weaponRules':
        request$ = this.dataService.deleteWeaponRule(id as number);
        entityLabel = 'Weapon rule';
        break;
      case 'terrains':
        request$ = this.dataService.deleteTerrain(id as number);
        entityLabel = 'Terrain';
        break;
      case 'mistEffects':
        request$ = this.dataService.deleteMistEffect(id);
        entityLabel = 'Mist effect';
        break;
      default:
        return;
    }

    request$.subscribe({
      next: () => {
        this.isDeleting = false;
        this.toastService.show(`${entityLabel} deleted successfully`, 'info');
        this.resetForm();
        this.refreshCurrentTab();
      },
      error: (err) => {
        this.isDeleting = false;
        const message = err?.error?.error || err?.message || 'Unknown error';
        this.toastService.show(`Failed to delete: ${message}`, 'error');
      }
    });
  }

  private refreshCurrentTab(): void {
    switch (this.activeTab) {
      case 'alteredStates':
        this.dataService.refreshAlteredStates().subscribe(data => {
          this.alteredStates = data;
        });
        break;
      case 'weaponRules':
        this.dataService.refreshWeaponRules().subscribe(data => {
          this.weaponRules = data;
        });
        break;
      case 'terrains':
        this.dataService.refreshTerrains().subscribe(data => {
          this.terrains = data;
        });
        break;
      case 'mistEffects':
        this.dataService.refreshMistEffects().subscribe(data => {
          this.mistEffects = data;
        });
        break;
    }
  }
}
