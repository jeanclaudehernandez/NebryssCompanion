import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, OnInit } from '@angular/core';
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

  constructor(
    private readonly adminService: AdminService,
    private readonly activePlayerService: ActivePlayerService,
    private readonly dataService: DataService,
    private readonly toastService: ToastService
  ) {}

  ngOnInit(): void {
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

    this.isSaving = true;
    this.dataService.savePlayer(payload).subscribe({
      next: savedPlayer => {
        this.lastSavedPlayer = savedPlayer;
        this.players = this.players.map(player => player.id === savedPlayer.id ? savedPlayer : player);
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
