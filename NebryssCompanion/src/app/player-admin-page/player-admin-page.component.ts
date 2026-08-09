import { CommonModule } from '@angular/common';
import { Component, DestroyRef, ElementRef, HostListener, ViewChild, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { AdminService } from '../admin.service';
import { ActivePlayerService } from '../active-player.service';
import { BodyTypeIconsComponent } from '../body-type-icons/body-type-icons.component';
import { DataService } from '../data.service';
import { GenericTableComponent } from '../generic-table/generic-table.component';
import { getEffectiveTalentApplications } from '../talent-stacks';
import { AlteredState, Items, Player, Weapon, WeaponRule } from '../model';
import { ToastService } from '../toast.service';
import { WeaponTableComponent } from '../weapon-table/weapon-table.component';
import { NavigationHistoryService } from '../navigation-history.service';

type EditableStatKey = 'Movement' | 'Wounds' | 'Save' | 'APL';
type EquipmentTableRow = {
  id: number;
  name: string;
  description: string;
};
type TalentTableRow = {
  name: string;
  effect: string;
};

@Component({
  selector: 'app-player-admin-page',
  standalone: true,
  imports: [CommonModule, FormsModule, BodyTypeIconsComponent, GenericTableComponent, WeaponTableComponent],
  templateUrl: './player-admin-page.component.html',
  styleUrls: ['./player-admin-page.component.css']
})
export class PlayerAdminPageComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly navigationHistory = inject(NavigationHistoryService);

  @ViewChild('bodyEditor') bodyEditorRef?: ElementRef<HTMLElement>;

  isAdmin = false;
  isSaving = false;
  players: Player[] = [];
  weapons: Weapon[] = [];
  itemsData: Items = { items: [] };
  weaponRules: WeaponRule[] = [];
  alteredStates: AlteredState[] = [];
  equipmentTableData: EquipmentTableRow[] = [];
  talentTableData: TalentTableRow[] = [];
  readonly equipmentTableHeaders = ['Name', 'Description'];
  readonly equipmentTableHeaderKeys = ['name', 'description'];
  readonly talentTableHeaders = ['Name', 'Effect'];
  readonly talentTableHeaderKeys = ['name', 'effect'];

  selectedPlayerId: number | null = null;
  editablePlayer: Player | null = null;
  lastSavedPlayer: Player | null = null;

  editingStat: EditableStatKey | null = null;
  statEditValue: number | null = null;

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

  constructor(
    private readonly adminService: AdminService,
    private readonly activePlayerService: ActivePlayerService,
    private readonly dataService: DataService,
    private readonly toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.navigationHistory.registerModalHandler(() => {
      if (this.isBodySelectorOpen) {
        this.isBodySelectorOpen = false;
        return true;
      }
      return false;
    }, this.destroyRef);

    this.adminService.isAdmin$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(isAdmin => {
        this.isAdmin = isAdmin;
      });

    forkJoin({
      players: this.dataService.getPlayers(),
      weapons: this.dataService.getWeapons(),
      items: this.dataService.getItems(),
      talents: this.dataService.getTalents(),
      weaponRules: this.dataService.getWeaponRules(),
      alteredStates: this.dataService.getAlteredStates()
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ players, weapons, items, weaponRules, alteredStates }) => {
        this.players = [...players].sort((left, right) => left.name.localeCompare(right.name));
        this.weapons = [...weapons].sort((left, right) => left.name.localeCompare(right.name));
        this.itemsData = items;
        this.weaponRules = weaponRules;
        this.alteredStates = alteredStates;
        this.selectInitialPlayer();
      });
  }

  get canSave(): boolean {
    return this.isAdmin && !!this.editablePlayer && !this.isSaving;
  }

  get previewJson(): string {
    if (!this.editablePlayer) {
      return '{\n  "player": "Select a player to start editing"\n}';
    }

    return JSON.stringify({
      id: this.editablePlayer.id,
      name: this.editablePlayer.name,
      attributes: this.editablePlayer.attributes,
      weapons: this.editablePlayer.weapons,
      abilities: this.buildAbilityPayload(false) ?? [],
      progression: {
        equipment: this.editablePlayer.progression?.equipment ?? [],
        talents: this.editablePlayer.progression?.talents ?? []
      }
    }, null, 2);
  }

  onPlayerSelect(playerId: number | null): void {
    if (playerId === null) {
      this.selectedPlayerId = null;
      this.editablePlayer = null;
      this.clearDisplayTables();
      this.cancelStatEdit();
      return;
    }

    const player = this.players.find(entry => entry.id === playerId);
    if (!player) {
      return;
    }

    this.selectedPlayerId = player.id;
    this.editablePlayer = this.clonePlayer(player);
    this.editablePlayer.weapons = [...(this.editablePlayer.weapons ?? [])];
    this.editablePlayer.abilities = [...(this.editablePlayer.abilities ?? [])];
    this.editablePlayer.attributes.body = [...(this.editablePlayer.attributes.body ?? [])];
    this.editablePlayer.progression = {
      talentPoints: this.editablePlayer.progression?.talentPoints ?? 0,
      mistrals: {
        digital: this.editablePlayer.progression?.mistrals?.digital ?? 0,
        physical: this.editablePlayer.progression?.mistrals?.physical ?? 0
      },
      talents: [...(this.editablePlayer.progression?.talents ?? [])],
      afflictions: [...(this.editablePlayer.progression?.afflictions ?? [])],
      equipment: [...(this.editablePlayer.progression?.equipment ?? [])]
    };
    this.rebuildDisplayTables(this.editablePlayer);
    this.cancelStatEdit();
  }

  addAbility(): void {
    if (!this.editablePlayer) {
      return;
    }

    this.editablePlayer.abilities = [
      ...(this.editablePlayer.abilities ?? []),
      { name: '', effect: '' }
    ];
  }

  removeAbility(index: number): void {
    if (!this.editablePlayer?.abilities) {
      return;
    }

    this.editablePlayer.abilities = this.editablePlayer.abilities.filter((_, abilityIndex) => abilityIndex !== index);
  }

  startStatEdit(stat: EditableStatKey): void {
    if (!this.editablePlayer) {
      return;
    }

    this.editingStat = stat;
    this.statEditValue = this.editablePlayer.attributes[stat];
  }

  commitStatEdit(): void {
    if (!this.editablePlayer || !this.editingStat) {
      return;
    }

    if (typeof this.statEditValue === 'number' && Number.isFinite(this.statEditValue)) {
      this.editablePlayer.attributes[this.editingStat] = Math.max(0, Math.round(this.statEditValue));
    }

    this.cancelStatEdit();
  }

  cancelStatEdit(): void {
    this.editingStat = null;
    this.statEditValue = null;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isBodySelectorOpen) {
      return;
    }

    const editor = this.bodyEditorRef?.nativeElement;
    if (!editor) {
      this.isBodySelectorOpen = false;
      return;
    }

    if (event.target instanceof Node && !editor.contains(event.target)) {
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
    if (!this.editablePlayer) {
      return;
    }

    const current = [...(this.editablePlayer.attributes.body ?? [])];

    if (checked) {
      if (!current.includes(bodyType)) {
        current.push(bodyType);
      }
    } else {
      const index = current.indexOf(bodyType);
      if (index >= 0) {
        current.splice(index, 1);
      }
    }

    const order = new Map<string, number>(
      this.bodyTypeOptions.map((key, index) => [key, index])
    );

    current.sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
    this.editablePlayer.attributes.body = current;
  }

  createNewPlayer(): void {
    const maxId = this.players.reduce((max, p) => (p.id > max ? p.id : max), 0);
    const newPlayer: Player = {
      id: maxId + 1,
      name: 'New Operative',
      race: 'Human',
      origin: 'Imperium of Man',
      attributes: {
        Movement: 6,
        Wounds: 10,
        Save: 4,
        APL: 3,
        body: ['human']
      },
      weapons: [],
      abilities: [
        { name: 'Core Training', effect: 'Standard operative conditioning.' }
      ],
      items: [],
      progression: {
        talentPoints: 0,
        mistrals: { digital: 0, physical: 0 },
        talents: [],
        afflictions: [],
        equipment: []
      }
    };

    this.selectedPlayerId = newPlayer.id;
    this.editablePlayer = newPlayer;
    this.lastSavedPlayer = null;
    this.rebuildDisplayTables(newPlayer);
  }

  deletePlayer(): void {
    if (!this.editablePlayer || !this.editablePlayer.id) return;
    const deletingId = this.editablePlayer.id;

    this.dataService.deletePlayer(deletingId).subscribe({
      next: () => {
        this.toastService.show('Player deleted successfully', 'info');
        if (this.activePlayerService.activePlayer?.id === deletingId) {
          this.activePlayerService.clearActivePlayer();
        }
        this.players = this.players.filter(p => p.id !== deletingId);
        this.selectInitialPlayer();
        this.dataService.refreshPlayers().subscribe();
      },
      error: () => {
        this.toastService.show('Failed to delete player', 'error');
      }
    });
  }

  save(): void {
    if (!this.editablePlayer || !this.canSave) {
      return;
    }

    const abilities = this.buildAbilityPayload(true);
    if (!abilities) {
      return;
    }

    const payload: Player = {
      ...this.clonePlayer(this.editablePlayer),
      weapons: [...(this.editablePlayer.weapons ?? [])],
      abilities
    };

    const isNew = !this.players.some(player => player.id === payload.id);
    this.isSaving = true;

    const request$ = isNew
      ? this.dataService.createPlayer(payload)
      : this.dataService.savePlayer(payload);

    request$.subscribe({
      next: savedPlayer => {
        this.lastSavedPlayer = savedPlayer;
        if (isNew) {
          this.players.push(savedPlayer);
        } else {
          this.players = this.players.map(player => player.id === savedPlayer.id ? savedPlayer : player);
        }
        this.players.sort((left, right) => left.name.localeCompare(right.name));
        this.onPlayerSelect(savedPlayer.id);

        if (this.activePlayerService.activePlayer?.id === savedPlayer.id) {
          this.activePlayerService.setActivePlayer(savedPlayer);
        }

        this.dataService.refreshPlayers().subscribe();
        this.toastService.show(`Saved ${savedPlayer.name} successfully`, 'success');
        this.isSaving = false;
      },
      error: err => {
        const message = err?.error?.error || err?.message || 'Unknown error';
        this.toastService.show(`Failed to save player: ${message}`, 'error');
        this.isSaving = false;
      }
    });
  }

  private selectInitialPlayer(): void {
    if (!this.players.length) {
      this.selectedPlayerId = null;
      this.editablePlayer = null;
      this.clearDisplayTables();
      return;
    }

    const preferredId = this.activePlayerService.activePlayer?.id ?? this.players[0].id;
    this.onPlayerSelect(this.players.some(player => player.id === preferredId) ? preferredId : this.players[0].id);
  }

  buildAbilityPayload(validate: boolean): Player['abilities'] | null {
    const abilities = this.editablePlayer?.abilities ?? [];
    const normalizedAbilities: Player['abilities'] = [];

    for (const ability of abilities) {
      const name = (ability.name ?? '').trim();
      const effect = (ability.effect ?? '').trim();

      if (!name && !effect) {
        continue;
      }

      if (!name || !effect) {
        if (validate) {
          this.toastService.show('Each ability needs both a name and an effect', 'error');
        }
        return null;
      }

      normalizedAbilities.push({ name, effect });
    }

    return normalizedAbilities;
  }

  private clonePlayer(player: Player): Player {
    return JSON.parse(JSON.stringify(player)) as Player;
  }

  private rebuildDisplayTables(player: Player): void {
    this.equipmentTableData = this.buildEquipmentTableData(player);
    this.talentTableData = this.buildTalentTableData(player);
  }

  private clearDisplayTables(): void {
    this.equipmentTableData = [];
    this.talentTableData = [];
  }

  private buildEquipmentTableData(player: Player): EquipmentTableRow[] {
    return (player.progression?.equipment ?? []).map(equipmentId => {
      const item = this.getItemById(equipmentId);
      return {
        id: equipmentId,
        name: item?.name || `Unknown Item (${equipmentId})`,
        description: this.processRichText(item?.description || 'No description available')
      };
    });
  }

  private buildTalentTableData(player: Player): TalentTableRow[] {
    const effectiveTalents = getEffectiveTalentApplications(
      player,
      itemId => this.getItemById(itemId),
      talentId => this.dataService.getTalentById(talentId)
    );

    const effectiveCounts = new Map<string, number>();
    effectiveTalents.forEach(talent => {
      effectiveCounts.set(talent.id, (effectiveCounts.get(talent.id) || 0) + 1);
    });

    return Array.from(effectiveCounts.entries())
      .map(([talentId, appliedCount]) => {
        const talent = this.dataService.getTalentById(talentId);
        if (!talent) {
          return null;
        }

        const equipmentProviders = (player.progression?.equipment || [])
          .map(itemId => this.getItemById(itemId))
          .filter(item => item?.talentId === talentId);

        const equipmentTags = equipmentProviders.map(item =>
          `<span class="talent-source-tag talent-source-equipment">🛡 ${item.name}</span>`
        );
        const acquiredTag = player.progression?.talents?.includes(talentId)
          ? '<span class="talent-source-tag talent-source-acquired">🏋 acquired</span>'
          : '';
        const stackTag = appliedCount > 1
          ? `<span class="talent-source-tag talent-source-stack">x${appliedCount}</span>`
          : '';
        const sourceTags = [...equipmentTags, acquiredTag, stackTag].filter(Boolean).join(' ');
        const sourceMarkup = sourceTags
          ? `<div class="talent-source-tags">${sourceTags}</div>`
          : '';

        return {
          name: `${talent.name}${sourceMarkup}`,
          effect: this.processRichText(talent.effect || '')
        };
      })
      .filter((row): row is TalentTableRow => !!row);
  }

  private getItemById(id: number): any {
    return this.itemsData.items.find(item => item.id === id) ?? null;
  }

  private processRichText(text: string): string {
    if (!text) {
      return '';
    }

    const withStatuses = text.replace(/\/status\/:(\d+)\//g, (match, idStr: string) => {
      const status = this.alteredStates.find(entry => entry.id === Number(idStr));
      return status ? `<span class="status-link" data-status="${status.name}">${status.name}</span>` : match;
    });

    return withStatuses.replace(/\/weaponRule\/:(\d+)\//g, (match, idStr: string) => {
      const rule = this.weaponRules.find(entry => entry.id === Number(idStr));
      return rule ? `<span class="weapon-rule-link" data-weapon-rule="${rule.name}">${rule.name}</span>` : match;
    });
  }
}
