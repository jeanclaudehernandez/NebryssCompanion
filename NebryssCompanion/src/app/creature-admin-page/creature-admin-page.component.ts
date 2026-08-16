import { CommonModule } from '@angular/common';
import { Component, DestroyRef, ElementRef, HostListener, ViewChild, inject, OnInit, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { AdminService } from '../admin.service';
import { BodyTypeIconsComponent } from '../body-type-icons/body-type-icons.component';
import { DataService } from '../data.service';
import { GenericTableComponent } from '../generic-table/generic-table.component';
import { AlteredState, BestiaryEntry, Campaign, ItemCategory, Items, Lore, Weapon, WeaponRule } from '../model';
import { ToastService } from '../toast.service';
import { WeaponTableComponent } from '../weapon-table/weapon-table.component';
import { NavigationHistoryService } from '../navigation-history.service';

type EditableStatKey = 'Movement' | 'Wounds' | 'Save' | 'APL';

type ItemTableRow = {
  id: number;
  name: string;
  type: string;
  price: number;
  quant: number;
  description: string;
};

@Component({
  selector: 'app-creature-admin-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    BodyTypeIconsComponent,
    GenericTableComponent,
    WeaponTableComponent
  ],
  templateUrl: './creature-admin-page.component.html',
  styleUrls: ['./creature-admin-page.component.css']
})
export class CreatureAdminPageComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly navigationHistory = inject(NavigationHistoryService);

  @ViewChild('bodyEditor') bodyEditorRef?: ElementRef<HTMLElement>;
  @Input() initialCreature?: BestiaryEntry;

  isAdmin = false;
  isLoading = true;
  isSaving = false;
  isDeleting = false;
  showDeleteConfirm = false;

  loreData: Lore | null = null;
  bestiary: BestiaryEntry[] = [];
  campaigns: Campaign[] = [];
  weapons: Weapon[] = [];
  itemsData: Items = { items: [] };
  itemCategories: ItemCategory[] = [];
  weaponRules: WeaponRule[] = [];
  alteredStates: AlteredState[] = [];

  // Bestiary Cascading Filters (Matching BestiaryComponent)
  factions: { id: number; name: string }[] = [];
  subgroups: string[] = [];
  selectedFactionId: number | null = null;
  selectedSubGroup: string | null = null;
  filteredCreatures: BestiaryEntry[] = [];
  selectedCreatureId: number | null = null;

  // Editable Creature State
  isEditing = false;
  editableCreature: BestiaryEntry | null = null;
  lastSavedCreature: BestiaryEntry | null = null;

  // Stat Inline Editing (Matching PlayerAdminPageComponent)
  editingStat: EditableStatKey | null = null;
  statEditValue: number | null = null;

  // Body Type Selector (Matching PlayerAdminPageComponent)
  isBodySelectorOpen = false;
  readonly bodyTypeOptions = [
    'universal',
    'human',
    'astartes',
    'fellgor',
    'spell',
    'ork',
    'aetherwing',
    'plant',
    'rat'
  ] as const;

  // Collapsible Sections (Abilities & Catalog Picker collapsed by default)
  isAbilitiesCollapsed = true;
  isCatalogCollapsed = true;

  // Catalog Picker (Shop Editor style)
  pickerSearchTerm = '';
  pickerTypeFilter: 'weapon' | 'item' = 'weapon';

  // Display Table for Assigned Items (Matching PlayerAdminPageComponent)
  assignedItemsTableData: ItemTableRow[] = [];
  readonly itemTableHeaders = ['Name', 'Type', 'Qty', 'Description'];
  readonly itemTableHeaderKeys = ['name', 'type', 'quant', 'description'];

  constructor(
    private readonly adminService: AdminService,
    private readonly dataService: DataService,
    private readonly toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.navigationHistory.registerModalHandler(() => {
      if (this.isBodySelectorOpen) {
        this.isBodySelectorOpen = false;
        return true;
      }
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

    this.dataService.lore$
      ?.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(lore => {
        if (lore && lore.factions) {
          this.loreData = lore;
          this.factions = lore.factions.map(f => ({ id: f.id, name: f.name }));
        }
      });

    this.loadAllData();
  }

  getFactionName(factionId: number | null | undefined): string {
    if (!factionId || !this.loreData?.factions) return '';
    const found = this.loreData.factions.find(f => f.id === factionId);
    return found ? found.name : '';
  }

  private loadAllData(): void {
    this.isLoading = true;
    forkJoin({
      bestiary: this.dataService.getBestiary(),
      campaigns: this.dataService.getCampaigns(),
      weapons: this.dataService.getWeapons(),
      items: this.dataService.getItems(),
      categories: this.dataService.getitemCategories(),
      weaponRules: this.dataService.getWeaponRules(),
      alteredStates: this.dataService.getAlteredStates(),
      lore: this.dataService.getLore()
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ bestiary, campaigns, weapons, items, categories, weaponRules, alteredStates, lore }) => {
          this.bestiary = [...bestiary].sort((a, b) => a.name.localeCompare(b.name));
          this.campaigns = [...(campaigns || [])];
          this.weapons = [...weapons].sort((a, b) => a.name.localeCompare(b.name));
          this.itemsData = items;
          this.itemCategories = categories;
          this.weaponRules = weaponRules;
          this.alteredStates = alteredStates;
          this.loreData = lore || null;
          if (lore && lore.factions) {
            this.factions = lore.factions.map(f => ({ id: f.id, name: f.name }));
          }
          this.isLoading = false;

          this.applyFilters();
          this.subgroups = this.getUniqueValues(this.filteredCreatures, 'subgroup');

          if (this.initialCreature) {
            this.selectCreature(this.initialCreature);
          } else if (this.bestiary.length > 0) {
            this.selectCreature(this.bestiary[0]);
          } else {
            this.startNewCreature();
          }
        },
        error: () => {
          this.isLoading = false;
          this.toastService.show('Failed to load creature editor data', 'error');
        }
      });
  }

  private getUniqueValues(array: any[], property: string): string[] {
    return [...new Set(array.map(item => item[property]))].filter(Boolean).sort();
  }

  // Bestiary Cascading Filter Handlers (Matching BestiaryComponent)
  onFactionSelected(): void {
    this.selectedSubGroup = null;
    this.applyFilters();
    this.subgroups = this.getUniqueValues(this.filteredCreatures, 'subgroup');
  }

  onSubGroupSelected(): void {
    this.applyFilters();
  }

  private applyFilters(): void {
    this.filteredCreatures = this.bestiary.filter(c => {
      const factionMatch = this.selectedFactionId === null || c.factionId === this.selectedFactionId;
      const subgroupMatch = !this.selectedSubGroup || c.subgroup === this.selectedSubGroup;
      return factionMatch && subgroupMatch;
    });
  }

  onCreatureSelectDropdown(eventVal: any): void {
    const rawVal = eventVal;
    if (rawVal === null || rawVal === 'null' || rawVal === undefined) {
      this.selectedCreatureId = null;
      this.editableCreature = null;
      this.clearDisplayTables();
      this.cancelStatEdit();
      return;
    }
    const targetId = Number(rawVal);
    const creature = this.bestiary.find(c => c.id === targetId);
    if (creature) {
      this.selectCreature(creature);
    }
  }

  selectCreature(creature: BestiaryEntry): void {
    this.selectedCreatureId = creature.id;
    this.isEditing = true;
    this.editableCreature = this.cloneCreature(creature);
    this.editableCreature.factionId = creature.factionId ?? (this.factions.length > 0 ? this.factions[0].id : 1);
    this.editableCreature.discoveredCampaignIds = Array.isArray(creature.discoveredCampaignIds)
      ? [...creature.discoveredCampaignIds]
      : (creature.isDiscovered !== false ? (this.campaigns.length > 0 ? this.campaigns.map(c => c.id) : [1]) : []);
    this.editableCreature.isDiscovered = this.editableCreature.discoveredCampaignIds.length > 0;
    this.editableCreature.weapons = [...(this.editableCreature.weapons ?? [])]
      .map(w => (typeof w === 'number' ? w : (w as any)?.id || (w as any)?.weapon?.id))
      .filter((id): id is number => typeof id === 'number' && !isNaN(id));
    this.editableCreature.abilities = (this.editableCreature.abilities ?? []).map(a => ({ ...a }));
    this.editableCreature.items = (this.editableCreature.items ?? []).map(i => ({ ...i }));
    const rawBody = creature.attributes?.body;
    const bodyArray = Array.isArray(rawBody)
      ? [...rawBody]
      : (typeof rawBody === 'string' && rawBody ? [rawBody] : ['human']);
    this.editableCreature.attributes = {
      Movement: creature.attributes?.Movement ?? 6,
      Wounds: creature.attributes?.Wounds ?? 10,
      Save: creature.attributes?.Save ?? 4,
      APL: creature.attributes?.APL ?? 2,
      body: bodyArray
    };
    this.rebuildAssignedItemsTable();
    this.cancelStatEdit();
  }

  startNewCreature(): void {
    this.selectedCreatureId = null;
    this.isEditing = false;
    const maxId = this.bestiary.reduce((max, b) => (b.id > max ? b.id : max), 0);
    this.editableCreature = {
      id: maxId + 1,
      name: '',
      factionId: this.selectedFactionId ?? (this.factions.length > 0 ? this.factions[0].id : 1),
      subgroup: this.selectedSubGroup || '',
      pr: 10,
      isDiscovered: true,
      discoveredCampaignIds: this.campaigns.length > 0 ? this.campaigns.map(c => c.id) : [1],
      attributes: {
        Movement: 6,
        Wounds: 10,
        Save: 4,
        APL: 2,
        body: ['human']
      },
      weapons: [],
      abilities: [],
      items: []
    };
    this.rebuildAssignedItemsTable();
    this.cancelStatEdit();
  }

  isCampaignDiscovered(campId: number): boolean {
    if (!this.editableCreature?.discoveredCampaignIds) return false;
    return this.editableCreature.discoveredCampaignIds.includes(campId);
  }

  toggleCampaignDiscovery(campId: number): void {
    if (!this.editableCreature) return;
    const current = this.editableCreature.discoveredCampaignIds ?? [];
    if (current.includes(campId)) {
      this.editableCreature.discoveredCampaignIds = current.filter(id => id !== campId);
    } else {
      this.editableCreature.discoveredCampaignIds = [...current, campId];
    }
    this.editableCreature.isDiscovered = this.editableCreature.discoveredCampaignIds.length > 0;
  }

  setAllCampaignsDiscovered(discovered: boolean): void {
    if (!this.editableCreature) return;
    if (discovered) {
      this.editableCreature.discoveredCampaignIds = this.campaigns.map(c => c.id);
    } else {
      this.editableCreature.discoveredCampaignIds = [];
    }
    this.editableCreature.isDiscovered = this.editableCreature.discoveredCampaignIds.length > 0;
  }

  get canSave(): boolean {
    return this.isAdmin && !!this.editableCreature && !this.isSaving;
  }

  get previewJson(): string {
    if (!this.editableCreature) {
      return '{\n  "creature": "Select or create a creature"\n}';
    }

    return JSON.stringify({
      id: this.editableCreature.id,
      name: this.editableCreature.name,
      factionId: this.editableCreature.factionId,
      subgroup: this.editableCreature.subgroup,
      pr: this.editableCreature.pr,
      discoveredCampaignIds: this.editableCreature.discoveredCampaignIds ?? [],
      isDiscovered: this.editableCreature.isDiscovered !== false,
      attributes: this.editableCreature.attributes,
      weapons: this.editableCreature.weapons,
      abilities: this.editableCreature.abilities,
      items: this.editableCreature.items
    }, null, 2);
  }

  // Stat Inline Editing (Matching PlayerAdminPageComponent)
  startStatEdit(stat: EditableStatKey): void {
    if (!this.editableCreature) {
      return;
    }
    this.editingStat = stat;
    this.statEditValue = this.editableCreature.attributes[stat];
  }

  commitStatEdit(): void {
    if (!this.editableCreature || !this.editingStat) {
      return;
    }
    if (typeof this.statEditValue === 'number' && Number.isFinite(this.statEditValue)) {
      this.editableCreature.attributes[this.editingStat] = Math.max(0, Math.round(this.statEditValue));
    }
    this.cancelStatEdit();
  }

  cancelStatEdit(): void {
    this.editingStat = null;
    this.statEditValue = null;
  }

  // Body Type Selector (Matching PlayerAdminPageComponent)
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isBodySelectorOpen) {
      return;
    }
    const editor = this.bodyEditorRef?.nativeElement;
    if (editor && event.target instanceof Node && !editor.contains(event.target)) {
      this.isBodySelectorOpen = false;
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.isBodySelectorOpen = false;
  }

  toggleBodySelector(event?: Event): void {
    event?.stopPropagation();
    this.isBodySelectorOpen = !this.isBodySelectorOpen;
  }

  onBodyTypeToggle(bodyType: string, checked: boolean): void {
    if (!this.editableCreature) {
      return;
    }
    const current = [...(this.editableCreature.attributes.body ?? [])];
    if (checked) {
      if (!current.includes(bodyType)) {
        current.push(bodyType);
      }
    } else {
      const idx = current.indexOf(bodyType);
      if (idx >= 0) {
        current.splice(idx, 1);
      }
    }
    const order = new Map<string, number>(this.bodyTypeOptions.map((k, i) => [k, i]));
    current.sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
    this.editableCreature.attributes.body = current;
  }

  // Abilities Management (Matching PlayerAdminPageComponent)
  addAbility(): void {
    if (!this.editableCreature) {
      return;
    }
    this.editableCreature.abilities = [
      ...(this.editableCreature.abilities ?? []),
      { name: '', effect: '', prModifier: null }
    ];
  }

  removeAbility(index: number): void {
    if (!this.editableCreature?.abilities) {
      return;
    }
    this.editableCreature.abilities = this.editableCreature.abilities.filter((_, i) => i !== index);
  }

  // Weapons Assignment
  get assignedWeaponIds(): number[] {
    return this.editableCreature?.weapons ?? [];
  }

  onAddWeaponFromCatalog(weaponArg: any): void {
    if (!this.editableCreature) {
      return;
    }

    let targetId: number | null = null;
    if (typeof weaponArg === 'number') {
      targetId = weaponArg;
    } else if (weaponArg && typeof weaponArg.id === 'number') {
      targetId = weaponArg.id;
    } else if (weaponArg && weaponArg.weapon && typeof weaponArg.weapon.id === 'number') {
      targetId = weaponArg.weapon.id;
    }

    if (targetId === null || isNaN(targetId)) {
      return;
    }

    if (!this.editableCreature.weapons) {
      this.editableCreature.weapons = [];
    }

    // Clean any non-number entries
    this.editableCreature.weapons = this.editableCreature.weapons
      .map(w => (typeof w === 'number' ? w : (w as any)?.id || (w as any)?.weapon?.id))
      .filter((id): id is number => typeof id === 'number' && !isNaN(id));

    if (!this.editableCreature.weapons.includes(targetId)) {
      this.editableCreature.weapons = [...this.editableCreature.weapons, targetId];
      const weaponObj = this.weapons.find(w => w.id === targetId);
      this.toastService.show(`Added weapon "${weaponObj?.name || targetId}" to creature`, 'success');
    } else {
      this.toastService.show('Creature already has this weapon assigned', 'info');
    }
  }

  onRemoveWeapon(weaponArg: any): void {
    if (!this.editableCreature || !this.editableCreature.weapons) {
      return;
    }
    const targetId = typeof weaponArg === 'number' ? weaponArg : (weaponArg?.id || weaponArg?.weapon?.id || weaponArg);
    this.editableCreature.weapons = this.editableCreature.weapons
      .map(w => (typeof w === 'number' ? w : (w as any)?.id || (w as any)?.weapon?.id))
      .filter(id => id !== targetId);
    this.toastService.show('Removed weapon from creature', 'info');
  }

  // Items Assignment & Table Rebuild (Matching PlayerAdminPageComponent)
  onAddItemFromCatalog(eventItem: any): void {
    if (!this.editableCreature) {
      return;
    }
    const itemId = typeof eventItem === 'number' ? eventItem : (eventItem?.id || eventItem);
    if (!itemId) {
      return;
    }

    if (!this.editableCreature.items) {
      this.editableCreature.items = [];
    }

    const existing = this.editableCreature.items.find(i => i.id === itemId);
    if (existing) {
      existing.quant = (existing.quant || 1) + 1;
    } else {
      this.editableCreature.items.push({ id: itemId, quant: 1 });
    }

    this.rebuildAssignedItemsTable();
    const itemObj = this.itemsData.items.find(i => i.id === itemId);
    this.toastService.show(`Added item "${itemObj?.name || itemId}" to creature`, 'success');
  }

  onRemoveItem(itemRow: any): void {
    if (!this.editableCreature || !this.editableCreature.items) {
      return;
    }
    const itemId = typeof itemRow === 'number' ? itemRow : itemRow?.id;
    this.editableCreature.items = this.editableCreature.items.filter(i => i.id !== itemId);
    this.rebuildAssignedItemsTable();
    this.toastService.show('Removed item from creature', 'info');
  }

  private rebuildAssignedItemsTable(): void {
    if (!this.editableCreature) {
      this.assignedItemsTableData = [];
      return;
    }
    this.assignedItemsTableData = (this.editableCreature.items ?? []).map(inv => {
      const baseItem = this.itemsData.items.find(i => i.id === inv.id);
      return {
        id: inv.id,
        name: baseItem?.name || `Item ${inv.id}`,
        type: baseItem?.type || 'item',
        price: baseItem?.price || 0,
        quant: inv.quant || 1,
        description: baseItem?.description || ''
      };
    });
  }

  private clearDisplayTables(): void {
    this.assignedItemsTableData = [];
  }

  // Catalog Picker Filtering (Shop Editor style)
  get catalogWeaponIds(): number[] {
    const term = this.pickerSearchTerm.trim().toLowerCase();
    const creatureBodies = this.editableCreature?.attributes?.body ?? [];

    return this.weapons
      .filter(w => {
        const matchesSearch = !term || w.name.toLowerCase().includes(term);

        let matchesBody = true;
        if (creatureBodies.length > 0) {
          matchesBody = w.profiles.length > 0 && w.profiles.every(profile => {
            if (!profile.body || profile.body === 'universal' || profile.body === 'all') {
              return true;
            }
            return creatureBodies.includes(profile.body);
          });
        }

        return matchesSearch && matchesBody;
      })
      .map(w => w.id);
  }

  get catalogItemCategories(): Array<{ category: ItemCategory; data: any[] }> {
    const term = this.pickerSearchTerm.trim().toLowerCase();
    const result: Array<{ category: ItemCategory; data: any[] }> = [];

    for (const category of this.itemCategories) {
      const itemsInCat = this.itemsData.items.filter(item => {
        const matchesCategory = item.type === category.key || item.subtype === category.key;
        const matchesSearch = !term ||
          (item.name && item.name.toLowerCase().includes(term)) ||
          (item.description && item.description.toLowerCase().includes(term));
        return matchesCategory && matchesSearch;
      });

      if (itemsInCat.length > 0) {
        result.push({ category, data: itemsInCat });
      }
    }

    return result;
  }

  // Auto PR Recalculation
  recalculatePR(): void {
    if (!this.editableCreature) {
      return;
    }

    const attrs = this.editableCreature.attributes;
    const wounds = attrs.Wounds || 0;
    const save = attrs.Save || 4;
    const movement = attrs.Movement || 0;
    const apl = attrs.APL || 0;

    const basePR = (wounds * 2.2) + ((6 - save) * 7) + (movement * 4) + (apl * 6);

    let weaponThreat = 0;
    if (this.editableCreature.weapons && this.editableCreature.weapons.length > 0) {
      this.editableCreature.weapons.forEach(wId => {
        const weapon = this.weapons.find(w => w.id === wId);
        if (weapon && weapon.profiles) {
          weapon.profiles.forEach(profile => {
            const attacks = profile.attacks || 0;
            const minDamage = profile.damage?.min || 0;
            const ws = profile.ws || 0;
            const threatFromStats = attacks * minDamage * (7 - ws);

            let rulesSum = 0;
            if (profile.specialRules) {
              profile.specialRules.forEach(rule => {
                const ruleDef = this.weaponRules.find(r => r.id === rule.ruleId);
                if (ruleDef && typeof ruleDef.prModifier === 'number') {
                  rulesSum += ruleDef.prModifier;
                }
              });
            }
            const totalThreat = threatFromStats + rulesSum;
            if (totalThreat > weaponThreat) {
              weaponThreat = totalThreat;
            }
          });
        }
      });
    }

    let abilityScore = 0;
    if (this.editableCreature.abilities) {
      this.editableCreature.abilities.forEach(ability => {
        if (typeof ability.prModifier === 'number') {
          abilityScore += ability.prModifier;
        }
      });
    }

    const calculated = Math.round(basePR + weaponThreat + abilityScore);
    this.editableCreature.pr = calculated;
    this.toastService.show(`Calculated PR: ${calculated}`, 'info');
  }

  // Save / Delete
  saveCreature(): void {
    if (!this.editableCreature || !this.canSave) {
      return;
    }

    if (!this.editableCreature.name.trim()) {
      this.toastService.show('Creature name is required', 'error');
      return;
    }

    const payload: BestiaryEntry = {
      ...this.cloneCreature(this.editableCreature),
      name: this.editableCreature.name.trim(),
      factionId: Number(this.editableCreature.factionId) || (this.factions.length > 0 ? this.factions[0].id : 1),
      subgroup: this.editableCreature.subgroup.trim() || 'General',
      pr: Number(this.editableCreature.pr) || 10,
      discoveredCampaignIds: this.editableCreature.discoveredCampaignIds ?? [],
      isDiscovered: (this.editableCreature.discoveredCampaignIds ?? []).length > 0,
      weapons: [...(this.editableCreature.weapons ?? [])]
        .map(w => (typeof w === 'number' ? w : (w as any)?.id || (w as any)?.weapon?.id))
        .filter((id): id is number => typeof id === 'number' && !isNaN(id)),
      abilities: (this.editableCreature.abilities ?? []).filter(a => a.name.trim() || a.effect.trim()),
      items: (this.editableCreature.items ?? []).filter(i => i.id && i.quant > 0)
    };

    this.isSaving = true;
    this.dataService.saveBestiary(payload).subscribe({
      next: saved => {
        this.isSaving = false;
        this.lastSavedCreature = saved;
        this.toastService.show(`Saved creature "${saved.name}" successfully`, 'success');

        const idx = this.bestiary.findIndex(b => b.id === saved.id);
        if (idx !== -1) {
          this.bestiary[idx] = saved;
        } else {
          this.bestiary.push(saved);
        }
        this.bestiary.sort((a, b) => a.name.localeCompare(b.name));
        this.applyFilters();
        this.subgroups = this.getUniqueValues(this.filteredCreatures, 'subgroup');
        this.selectCreature(saved);

        this.dataService.refreshBestiary().subscribe();
      },
      error: err => {
        this.isSaving = false;
        const msg = err?.error?.error || err?.message || 'Failed to save creature';
        this.toastService.show(msg, 'error');
      }
    });
  }

  promptDelete(): void {
    if (!this.editableCreature || !this.isEditing) {
      return;
    }
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
  }

  confirmDelete(): void {
    if (!this.editableCreature || !this.isEditing) {
      return;
    }
    const idToDelete = this.editableCreature.id;
    const nameToDelete = this.editableCreature.name;

    this.isDeleting = true;
    this.dataService.deleteBestiary(idToDelete).subscribe({
      next: () => {
        this.isDeleting = false;
        this.showDeleteConfirm = false;
        this.toastService.show(`Deleted creature "${nameToDelete}"`, 'success');
        this.bestiary = this.bestiary.filter(b => b.id !== idToDelete);
        this.applyFilters();
        this.subgroups = this.getUniqueValues(this.filteredCreatures, 'subgroup');
        if (this.bestiary.length > 0) {
          this.selectCreature(this.bestiary[0]);
        } else {
          this.startNewCreature();
        }
        this.dataService.refreshBestiary().subscribe();
      },
      error: err => {
        this.isDeleting = false;
        this.showDeleteConfirm = false;
        const msg = err?.error?.error || err?.message || 'Failed to delete creature';
        this.toastService.show(msg, 'error');
      }
    });
  }

  private cloneCreature(creature: BestiaryEntry): BestiaryEntry {
    return JSON.parse(JSON.stringify(creature)) as BestiaryEntry;
  }
}
