import { CommonModule } from '@angular/common';
import { Component, DestroyRef, Input, OnChanges, OnInit, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { AdminEditorSession } from '../admin-editor.models';
import { AdminService } from '../admin.service';
import { DataService } from '../data.service';
import { BestiaryEntry, Item, ItemCategory, SpecialRule, StatModification, Talent, TalentCategory, Weapon, WeaponProfile, WeaponRule } from '../model';
import { ToastService } from '../toast.service';

type StatName = StatModification['stat'];
type ApplyToType = NonNullable<StatModification['applyToType']>;
type DeployableSubtype = 'construct' | 'mob';
type BuildMaterial = { id: number; amount: number };
type TalentOption = Talent & { categoryName: string };
type CategoryKey =
  | 'armor'
  | 'consumable'
  | 'ammunition'
  | 'mistEngine'
  | 'shipHull'
  | 'cannon'
  | 'cannonball'
  | 'deployable'
  | 'modification'
  | 'material'
  | 'blueprint';

interface StatModificationDraft {
  stat: StatName;
  mod: number | null;
  applyToType: ApplyToType | '';
  applyToValue: string;
}

interface WeaponProfileDraftRule {
  ruleId: number;
  modValue: number | string | null;
}

interface WeaponProfileDraft {
  profileName: string;
  rngInput: string;
  attacks: number | null;
  ws: number | null;
  damageMin: number | null;
  damageMax: number | null;
  body: string;
  type: string;
  selectedRuleIds: number[];
  specialRules: WeaponProfileDraftRule[];
}

@Component({
  selector: 'app-item-admin-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatSelectModule],
  templateUrl: './item-admin-page.component.html',
  styleUrls: ['./item-admin-page.component.css']
})
export class ItemAdminPageComponent implements OnInit, OnChanges {
  @Input() editSession: AdminEditorSession | null = null;

  private readonly destroyRef = inject(DestroyRef);

  readonly statOptions: StatName[] = ['Movement', 'Wounds', 'Save', 'APL', 'hit', 'damage', 'attacks', 'crit'];
  readonly applyToTypeOptions: ApplyToType[] = ['body', 'type', 'range'];
  readonly deployableSubtypeOptions: DeployableSubtype[] = ['construct', 'mob'];
  readonly creatorModes = [
    { value: 'item', label: 'Item Creator' },
    { value: 'weapon', label: 'Weapon Creator' }
  ] as const;

  isAdmin = false;
  isSaving = false;
  optionsLoaded = false;
  pendingEditSession: AdminEditorSession | null = null;
  editingItemId: number | null = null;
  editingWeaponId: number | null = null;

  creatorMode: 'item' | 'weapon' = 'item';
  categories: ItemCategory[] = [];
  weapons: Weapon[] = [];
  weaponRules: WeaponRule[] = [];
  bestiary: BestiaryEntry[] = [];
  talents: TalentOption[] = [];

  bodyTypeOptions: string[] = [];
  ammoSubtypeOptions: string[] = [];
  modificationPartOptions: string[] = [];
  buildMaterialOptions: Item[] = [];

  selectedCategoryKey: CategoryKey | '' = '';

  name = '';
  price: number | null = null;
  description = '';
  quantity: number | null = null;
  isEquippable = false;
  raceReq = 'universal';
  ammunitionSubtype = '';
  modificationPart = 'Any';
  damage = '';
  optimalConditions = '';
  maxSpeed = '';
  maxWeight: number | null = null;
  weight: number | null = null;
  shipWounds: number | null = null;
  defense: number | null = null;
  maxCargo: number | null = null;
  ammoType = '';
  talentId = '';

  deployableSubtype: DeployableSubtype | '' = '';
  deployableWeaponSelection: number | null = null;
  deployableWeaponIds: number[] = [];
  deployableBestiaryId: number | null = null;

  blueprintFor: number | null = null;
  buildMaterialSelection: number | null = null;
  buildMaterialAmount = 1;
  buildMaterials: BuildMaterial[] = [];

  materialBestiaryId: number | null = null;

  statModifications: StatModificationDraft[] = [];
  lastCreatedItem: Item | null = null;
  weaponName = '';
  weaponPrice: number | null = null;
  weaponProfiles: WeaponProfileDraft[] = [];
  lastCreatedWeapon: Weapon | null = null;

  constructor(
    private readonly adminService: AdminService,
    private readonly dataService: DataService,
    private readonly toastService: ToastService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['editSession']) {
      this.pendingEditSession = this.editSession;
      this.applyPendingEditSession();
    }
  }

  ngOnInit(): void {
    this.adminService.isAdmin$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(isAdmin => {
        this.isAdmin = isAdmin;
      });

    forkJoin({
      categories: this.dataService.getitemCategories(),
      items: this.dataService.getItems(),
      weapons: this.dataService.getWeapons(),
      weaponRules: this.dataService.getWeaponRules(),
      bestiary: this.dataService.getBestiary(),
      talents: this.dataService.getTalents()
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ categories, items, weapons, weaponRules, bestiary, talents }) => {
        this.categories = categories;
        this.weapons = [...weapons].sort((a, b) => a.name.localeCompare(b.name));
        this.weaponRules = [...weaponRules].sort((a, b) => a.name.localeCompare(b.name));
        this.bestiary = [...bestiary].sort((a, b) => a.name.localeCompare(b.name));
        this.talents = talents
          .flatMap((category: TalentCategory) =>
            category.talents.map(talent => ({
              ...talent,
              categoryName: category.name
            }))
          )
          .sort((a, b) => a.name.localeCompare(b.name));

        const itemList = items.items ?? [];
        this.bodyTypeOptions = this.buildBodyTypeOptions(itemList, weapons, bestiary);
        this.ammoSubtypeOptions = this.buildUniqueOptions(
          itemList
            .filter(item => item.type === 'ammunition')
            .map(item => (item as any).subtype ?? (item as any).subType)
        );
        this.modificationPartOptions = this.buildUniqueOptions([
          'Any',
          ...itemList.filter(item => item.type === 'modification').map(item => item.part)
        ]);
        this.buildMaterialOptions = [...itemList]
          .filter(item => item.type === 'material')
          .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

        this.optionsLoaded = true;

        if (!this.weaponProfiles.length) {
          this.addWeaponProfile();
        }

        this.applyPendingEditSession();
      });
  }

  get canSubmit(): boolean {
    if (!this.isAdmin || this.isSaving) {
      return false;
    }

    if (this.creatorMode === 'item') {
      return !!this.selectedCategoryKey && !!this.name.trim();
    }

    return !!this.weaponName.trim() && this.weaponProfiles.length > 0;
  }

  get previewJson(): string {
    if (this.creatorMode === 'weapon') {
      const payload = this.buildWeaponPayload(false);
      if (!payload) {
        return '{\n  "type": "Define a weapon to preview it"\n}';
      }

      return JSON.stringify(payload, null, 2);
    }

    const payload = this.buildPayload(false);
    if (!payload) {
      return '{\n  "type": "Select a category to start"\n}';
    }

    return JSON.stringify(payload, null, 2);
  }

  get lastCreatedDeployableSubtype(): string {
    return ((this.lastCreatedItem as any)?.subType as string | undefined) ?? '';
  }

  get isEditing(): boolean {
    return this.editingItemId !== null || this.editingWeaponId !== null;
  }

  get headerTitle(): string {
    if (this.creatorMode === 'weapon') {
      return this.editingWeaponId !== null ? 'Edit Weapon' : 'Admin Creator';
    }

    return this.editingItemId !== null ? 'Edit Item' : 'Admin Creator';
  }

  get headerDescription(): string {
    if (this.creatorMode === 'weapon') {
      return this.editingWeaponId !== null
        ? 'Update an existing weapon using the same structured form as creation.'
        : 'Create valid items and weapons without editing JSON by hand. The API assigns the `id` automatically when you save.';
    }

    return this.editingItemId !== null
      ? 'Update an existing item using the same structured form as creation.'
      : 'Create valid items and weapons without editing JSON by hand. The API assigns the `id` automatically when you save.';
  }

  get submitLabel(): string {
    if (this.isSaving) {
      if (this.creatorMode === 'weapon') {
        return this.editingWeaponId !== null ? 'Saving...' : 'Creating...';
      }

      return this.editingItemId !== null ? 'Saving...' : 'Creating...';
    }

    if (this.creatorMode === 'weapon') {
      return this.editingWeaponId !== null ? 'Save Weapon' : 'Create Weapon';
    }

    return this.editingItemId !== null ? 'Save Item' : 'Create Item';
  }

  setCreatorMode(mode: 'item' | 'weapon'): void {
    this.creatorMode = mode;
  }

  onCategoryChange(): void {
    this.quantity = null;
    this.isEquippable = this.selectedCategoryKey === 'armor' || this.selectedCategoryKey === 'modification';
    this.raceReq = 'universal';
    this.ammunitionSubtype = '';
    this.modificationPart = 'Any';
    this.damage = '';
    this.optimalConditions = '';
    this.maxSpeed = '';
    this.maxWeight = null;
    this.weight = null;
    this.shipWounds = null;
    this.defense = null;
    this.maxCargo = null;
    this.ammoType = '';
    this.deployableSubtype = '';
    this.deployableWeaponSelection = null;
    this.deployableWeaponIds = [];
    this.deployableBestiaryId = null;
    this.blueprintFor = null;
    this.buildMaterialSelection = null;
    this.buildMaterialAmount = 1;
    this.buildMaterials = [];
    this.materialBestiaryId = null;
  }

  addStatModification(): void {
    this.statModifications.push({
      stat: 'Wounds',
      mod: 0,
      applyToType: '',
      applyToValue: ''
    });
  }

  removeStatModification(index: number): void {
    this.statModifications.splice(index, 1);
  }

  addWeaponProfile(): void {
    this.weaponProfiles.push(this.createEmptyWeaponProfile());
  }

  removeWeaponProfile(index: number): void {
    if (this.weaponProfiles.length === 1) {
      this.toastService.show('A weapon needs at least one profile', 'info');
      return;
    }

    this.weaponProfiles.splice(index, 1);
  }

  onWeaponRuleSelectionChange(profile: WeaponProfileDraft): void {
    const existingRuleMap = new Map(profile.specialRules.map(rule => [rule.ruleId, rule]));
    profile.specialRules = profile.selectedRuleIds.map(ruleId => {
      const existingRule = existingRuleMap.get(ruleId);
      return existingRule ?? { ruleId, modValue: this.ruleNeedsValue(ruleId) ? 1 : null };
    });
  }

  addDeployableWeapon(): void {
    if (this.deployableWeaponSelection === null || this.deployableWeaponIds.includes(this.deployableWeaponSelection)) {
      return;
    }

    this.deployableWeaponIds = [...this.deployableWeaponIds, this.deployableWeaponSelection];
    this.deployableWeaponSelection = null;
  }

  removeDeployableWeapon(weaponId: number): void {
    this.deployableWeaponIds = this.deployableWeaponIds.filter(id => id !== weaponId);
  }

  addBuildMaterial(): void {
    if (this.buildMaterialSelection === null || this.buildMaterialAmount <= 0) {
      return;
    }

    const existing = this.buildMaterials.find(material => material.id === this.buildMaterialSelection);
    if (existing) {
      existing.amount += this.buildMaterialAmount;
    } else {
      this.buildMaterials = [
        ...this.buildMaterials,
        { id: this.buildMaterialSelection, amount: this.buildMaterialAmount }
      ];
    }

    this.buildMaterialSelection = null;
    this.buildMaterialAmount = 1;
  }

  removeBuildMaterial(materialId: number): void {
    this.buildMaterials = this.buildMaterials.filter(material => material.id !== materialId);
  }

  submit(): void {
    if (!this.canSubmit) {
      return;
    }

    if (this.creatorMode === 'weapon') {
      const weaponPayload = this.buildWeaponPayload(true);
      if (!weaponPayload) {
        return;
      }

      this.isSaving = true;
      const request$ = this.editingWeaponId !== null
        ? this.dataService.updateWeapon(weaponPayload)
        : this.dataService.createWeapon(weaponPayload);

      request$.subscribe({
        next: savedWeapon => {
          this.lastCreatedWeapon = savedWeapon;
          this.toastService.show(
            `${this.editingWeaponId !== null ? 'Updated' : 'Created'} ${savedWeapon.name ?? 'weapon'} successfully`,
            'success'
          );
          this.dataService.refreshWeapons().subscribe(weapons => {
            this.weapons = [...weapons].sort((a, b) => a.name.localeCompare(b.name));
          });
          if (this.editingWeaponId !== null) {
            this.loadWeaponIntoForm(savedWeapon);
          } else {
            this.resetWeaponForm();
          }
          this.isSaving = false;
        },
        error: err => {
          const message = err?.error?.error || err?.message || 'Unknown error';
          this.toastService.show(
            `Failed to ${this.editingWeaponId !== null ? 'update' : 'create'} weapon: ${message}`,
            'error'
          );
          this.isSaving = false;
        }
      });
      return;
    }

    const payload = this.buildPayload(true);
    if (!payload) {
      return;
    }

    this.isSaving = true;
    const request$ = this.editingItemId !== null
      ? this.dataService.updateItem(payload)
      : this.dataService.createItem(payload);

    request$.subscribe({
      next: savedItem => {
        this.lastCreatedItem = savedItem;
        this.toastService.show(
          `${this.editingItemId !== null ? 'Updated' : 'Created'} ${savedItem.name ?? 'item'} successfully`,
          'success'
        );
        this.dataService.refreshItems().subscribe();
        if (this.editingItemId !== null) {
          this.loadItemIntoForm(savedItem);
        } else {
          this.resetForm();
        }
        this.isSaving = false;
      },
      error: err => {
        const message = err?.error?.error || err?.message || 'Unknown error';
        this.toastService.show(
          `Failed to ${this.editingItemId !== null ? 'update' : 'create'} item: ${message}`,
          'error'
        );
        this.isSaving = false;
      }
    });
  }

  getWeaponName(id: number): string {
    return this.weapons.find(weapon => weapon.id === id)?.name ?? `Weapon ${id}`;
  }

  getCreatureName(id: number | null): string {
    if (id === null) {
      return 'None';
    }

    return this.bestiary.find(entry => entry.id === id)?.name ?? `Creature ${id}`;
  }

  getTalentLabel(talentId: string): string {
    const talent = this.talents.find(option => option.id === talentId);
    return talent ? `${talent.name} (${talent.categoryName})` : talentId;
  }

  getMaterialName(id: number): string {
    return this.buildMaterialOptions.find(material => material.id === id)?.name ?? `Material ${id}`;
  }

  getRuleName(ruleId: number): string {
    return this.weaponRules.find(rule => rule.id === ruleId)?.name ?? `Rule ${ruleId}`;
  }

  ruleNeedsValue(ruleId: number): boolean {
    const rule = this.weaponRules.find(entry => entry.id === ruleId);
    return !!rule && /<x>/i.test(rule.name);
  }

  private applyPendingEditSession(): void {
    if (!this.optionsLoaded) {
      return;
    }

    if (!this.pendingEditSession) {
      this.startCreateMode();
      return;
    }

    if (this.pendingEditSession.mode === 'item') {
      this.loadItemIntoForm(this.pendingEditSession.item);
      return;
    }

    this.loadWeaponIntoForm(this.pendingEditSession.weapon);
  }

  private startCreateMode(): void {
    this.clearEditState();
    this.creatorMode = 'item';
    this.resetForm();
    this.resetWeaponForm();
  }

  private clearEditState(): void {
    this.editingItemId = null;
    this.editingWeaponId = null;
  }

  private loadItemIntoForm(item: Item): void {
    this.clearEditState();
    this.creatorMode = 'item';
    this.resetForm();

    this.editingItemId = item.id ?? null;
    this.selectedCategoryKey = (item.type as CategoryKey | undefined) ?? '';
    this.name = item.name ?? '';
    this.price = item.price ?? null;
    this.description = item.description ?? '';
    this.quantity = item.quantity ?? null;
    this.isEquippable = !!item.isEquippable;
    this.raceReq = item.raceReq ?? 'universal';
    this.ammunitionSubtype = item.subtype ?? '';
    this.modificationPart = item.part ?? 'Any';
    this.damage = item.damage ?? '';
    this.optimalConditions = item.optimalConditions ?? '';
    this.maxSpeed = item.maxSpeed ?? '';
    this.maxWeight = item.maxWeight ?? null;
    this.weight = item.weight ?? null;
    this.shipWounds = item.shipWounds ?? null;
    this.defense = item.defense ?? null;
    this.maxCargo = item.maxCargo ?? null;
    this.ammoType = item.ammoType ?? '';
    this.talentId = item.talentId ?? '';
    this.deployableSubtype = ((item as any).subType as DeployableSubtype | undefined) ?? '';
    this.deployableWeaponSelection = null;
    this.deployableWeaponIds = [...(item.weapons ?? [])];
    this.deployableBestiaryId = item.bestiaryId ?? null;
    this.blueprintFor = item.blueprintFor ?? null;
    this.buildMaterialSelection = null;
    this.buildMaterialAmount = 1;
    this.buildMaterials = (item.buildMaterials ?? []).map(material => ({
      id: material.id,
      amount: material.amount
    }));
    this.materialBestiaryId = item.bestiaryId ?? null;
    this.statModifications = (item.statModifications ?? []).map(modification => ({
      stat: modification.stat,
      mod: modification.mod,
      applyToType: modification.applyToType ?? '',
      applyToValue: modification.applyToValue ?? ''
    }));
  }

  private loadWeaponIntoForm(weapon: Weapon): void {
    this.clearEditState();
    this.creatorMode = 'weapon';
    this.resetWeaponForm();

    this.editingWeaponId = weapon.id ?? null;
    this.weaponName = weapon.name ?? '';
    this.weaponPrice = weapon.price ?? null;
    this.weaponProfiles = weapon.profiles.length
      ? weapon.profiles.map(profile => this.mapWeaponProfileToDraft(profile))
      : [this.createEmptyWeaponProfile()];
  }

  private resetForm(): void {
    this.selectedCategoryKey = '';
    this.name = '';
    this.price = null;
    this.description = '';
    this.quantity = null;
    this.isEquippable = false;
    this.raceReq = 'universal';
    this.ammunitionSubtype = '';
    this.modificationPart = 'Any';
    this.damage = '';
    this.optimalConditions = '';
    this.maxSpeed = '';
    this.maxWeight = null;
    this.weight = null;
    this.shipWounds = null;
    this.defense = null;
    this.maxCargo = null;
    this.ammoType = '';
    this.talentId = '';
    this.deployableSubtype = '';
    this.deployableWeaponSelection = null;
    this.deployableWeaponIds = [];
    this.deployableBestiaryId = null;
    this.blueprintFor = null;
    this.buildMaterialSelection = null;
    this.buildMaterialAmount = 1;
    this.buildMaterials = [];
    this.materialBestiaryId = null;
    this.statModifications = [];
  }

  private resetWeaponForm(): void {
    this.weaponName = '';
    this.weaponPrice = null;
    this.weaponProfiles = [this.createEmptyWeaponProfile()];
  }

  private buildPayload(validate: boolean): Item | null {
    if (!this.selectedCategoryKey) {
      return null;
    }

    const name = this.name.trim();
    if (validate && !name) {
      this.toastService.show('Name is required', 'error');
      return null;
    }

    const payload: Record<string, any> = {
      name,
      type: this.selectedCategoryKey
    };

    if (this.editingItemId !== null) {
      payload['id'] = this.editingItemId;
    }

    this.assignIfPresent(payload, 'description', this.description);
    this.assignIfPresent(payload, 'price', this.price);
    this.assignIfPresent(payload, 'talentId', this.talentId);

    if (this.isEquippable) {
      payload['isEquippable'] = true;
    }

    switch (this.selectedCategoryKey) {
      case 'armor':
        payload['raceReq'] = this.raceReq;
        break;
      case 'ammunition':
        this.assignIfPresent(payload, 'quantity', this.quantity);
        this.assignIfPresent(payload, 'subtype', this.ammunitionSubtype);
        break;
      case 'mistEngine':
        this.assignIfPresent(payload, 'optimalConditions', this.optimalConditions);
        this.assignIfPresent(payload, 'maxSpeed', this.maxSpeed);
        this.assignIfPresent(payload, 'maxWeight', this.maxWeight);
        break;
      case 'shipHull':
        this.assignIfPresent(payload, 'weight', this.weight);
        this.assignIfPresent(payload, 'shipWounds', this.shipWounds);
        this.assignIfPresent(payload, 'defense', this.defense);
        this.assignIfPresent(payload, 'maxCargo', this.maxCargo);
        break;
      case 'cannon':
        this.assignIfPresent(payload, 'ammoType', this.ammoType);
        this.assignIfPresent(payload, 'weight', this.weight);
        break;
      case 'cannonball':
        this.assignIfPresent(payload, 'damage', this.damage);
        break;
      case 'deployable':
        if (validate && !this.deployableSubtype) {
          this.toastService.show('Deployable subtype is required', 'error');
          return null;
        }

        if (this.deployableSubtype) {
          payload['subType'] = this.deployableSubtype;
        }

        if (this.deployableSubtype === 'construct') {
          payload['weapons'] = [...this.deployableWeaponIds];
        }

        if (this.deployableSubtype === 'mob') {
          if (validate && this.deployableBestiaryId === null) {
            this.toastService.show('Select a creature for mob deployables', 'error');
            return null;
          }

          this.assignIfPresent(payload, 'bestiaryId', this.deployableBestiaryId);
        }
        break;
      case 'modification':
        payload['part'] = this.modificationPart || 'Any';
        break;
      case 'material':
        this.assignIfPresent(payload, 'bestiaryId', this.materialBestiaryId);
        break;
      case 'blueprint':
        if (validate && this.blueprintFor === null) {
          this.toastService.show('Blueprint weapon is required', 'error');
          return null;
        }

        this.assignIfPresent(payload, 'blueprintFor', this.blueprintFor);
        if (this.buildMaterials.length) {
          payload['buildMaterials'] = this.buildMaterials.map(material => ({
            id: material.id,
            amount: material.amount
          }));
        }
        break;
      default:
        break;
    }

    const statModifications = this.statModifications
      .filter(modification => modification.mod !== null)
      .map(modification => {
        const item: StatModification = {
          stat: modification.stat,
          mod: Number(modification.mod)
        };

        if (modification.applyToType) {
          item.applyToType = modification.applyToType;
          if (modification.applyToValue.trim()) {
            item.applyToValue = modification.applyToValue.trim();
          }
        }

        return item;
      });

    if (statModifications.length) {
      payload['statModifications'] = statModifications;
    }

    return payload as Item;
  }

  private buildWeaponPayload(validate: boolean): Weapon | null {
    const name = this.weaponName.trim();
    if (validate && !name) {
      this.toastService.show('Weapon name is required', 'error');
      return null;
    }

    const profiles = this.weaponProfiles
      .map(profile => this.mapWeaponProfileDraft(profile, validate))
      .filter((profile): profile is WeaponProfile => profile !== null);

    if (validate && profiles.length === 0) {
      this.toastService.show('Add at least one valid weapon profile', 'error');
      return null;
    }

    const payload: Partial<Weapon> = {
      name,
      profiles
    };

    if (this.editingWeaponId !== null) {
      payload.id = this.editingWeaponId;
    }

    if (typeof this.weaponPrice === 'number' && !Number.isNaN(this.weaponPrice)) {
      payload.price = this.weaponPrice;
    }

    return payload as Weapon;
  }

  private assignIfPresent(target: Record<string, any>, key: string, value: string | number | null): void {
    if (typeof value === 'number' && !Number.isNaN(value)) {
      target[key] = value;
      return;
    }

    if (typeof value === 'string' && value.trim()) {
      target[key] = value.trim();
    }
  }

  private buildBodyTypeOptions(items: Item[], weapons: Weapon[], bestiary: BestiaryEntry[]): string[] {
    const itemBodies = items.map(item => item.raceReq);
    const weaponBodies = weapons.flatMap(weapon => weapon.profiles.map(profile => profile.body));
    const creatureBodies = bestiary.flatMap(entry => entry.attributes?.body ?? []);

    return this.buildUniqueOptions([
      'universal',
      'human',
      'astartes',
      'construct',
      'spell',
      ...itemBodies,
      ...weaponBodies,
      ...creatureBodies
    ]);
  }

  private buildUniqueOptions(values: Array<string | undefined>): string[] {
    return [...new Set(values.filter((value): value is string => !!value && value.trim().length > 0))]
      .sort((a, b) => a.localeCompare(b));
  }

  private createEmptyWeaponProfile(): WeaponProfileDraft {
    return {
      profileName: '',
      rngInput: '',
      attacks: 4,
      ws: 4,
      damageMin: 3,
      damageMax: 4,
      body: this.bodyTypeOptions[0] ?? 'universal',
      type: '',
      selectedRuleIds: [],
      specialRules: []
    };
  }

  private mapWeaponProfileToDraft(profile: WeaponProfile): WeaponProfileDraft {
    return {
      profileName: profile.profileName ?? '',
      rngInput: profile.rng === null ? '' : String(profile.rng),
      attacks: profile.attacks ?? null,
      ws: profile.ws ?? null,
      damageMin: profile.damage?.min ?? null,
      damageMax: profile.damage?.max ?? null,
      body: profile.body ?? (this.bodyTypeOptions[0] ?? 'universal'),
      type: profile.type ?? '',
      selectedRuleIds: profile.specialRules.map(rule => rule.ruleId),
      specialRules: profile.specialRules.map(rule => ({
        ruleId: rule.ruleId,
        modValue: rule.modValue
      }))
    };
  }

  private mapWeaponProfileDraft(profile: WeaponProfileDraft, validate: boolean): WeaponProfile | null {
    if (validate) {
      if (profile.attacks === null || profile.ws === null || profile.damageMin === null || profile.damageMax === null) {
        this.toastService.show('Each weapon profile needs attacks, WS, and damage values', 'error');
        return null;
      }

      if (!profile.body) {
        this.toastService.show('Each weapon profile needs a body type', 'error');
        return null;
      }
    }

    const specialRules: SpecialRule[] = profile.specialRules.map(rule => {
      if (!this.ruleNeedsValue(rule.ruleId)) {
        return { ruleId: rule.ruleId, modValue: null };
      }

      return {
        ruleId: rule.ruleId,
        modValue: rule.modValue ?? null
      };
    });

    return {
      profileName: profile.profileName.trim(),
      rng: this.parseRangeInput(profile.rngInput),
      attacks: Number(profile.attacks ?? 0),
      ws: Number(profile.ws ?? 0),
      damage: {
        min: Number(profile.damageMin ?? 0),
        max: Number(profile.damageMax ?? 0)
      },
      specialRules,
      body: profile.body,
      type: profile.type.trim() || undefined
    };
  }

  private parseRangeInput(value: string): number | null {
    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized === 'null' || normalized === 'infinite' || normalized === 'inf') {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? null : parsed;
  }
}
