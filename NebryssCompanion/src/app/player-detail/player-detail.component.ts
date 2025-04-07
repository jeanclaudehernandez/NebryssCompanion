import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WeaponTableComponent } from '../weapon-table/weapon-table.component';
import { DataService } from '../data.service';
import { AlteredState, BestiaryEntry, Character, Items, Player, ScrollSection, Talent, Weapon, WeaponRule } from '../model';
import { SanitizeHtmlPipe } from '../sanitizeHtml.pipe';
import { GenericTableComponent } from '../generic-table/generic-table.component';
import { ActivePlayerService } from '../active-player.service';
import { ScrollNavComponent } from '../scroll-nav/scroll-nav.component';
import { ToastService } from '../toast.service';

@Component({
  selector: 'app-player-detail',
  standalone: true,
  imports: [CommonModule, WeaponTableComponent, SanitizeHtmlPipe, GenericTableComponent, ScrollNavComponent],
  templateUrl: './player-detail.component.html',
  styleUrls: ['./player-detail.component.css']
})
export class PlayerDetailComponent implements OnChanges {
  @Input() character!: Character;
  @Input() weaponsData: Weapon[] = [];
  @Input() weaponRulesData: WeaponRule[] = [];
  @Input() alteredStates: AlteredState[] = [];
  @Input() itemsData!: Items;
  bodyString = "";
  activeTooltip: string | null = null;
  tooltipX = 0;
  tooltipY = 0;
  itemTableData: any[] = [];
  itemTableHeaders: string[] = ['Name', 'Description', 'Quantity'];
  itemTableHeaderKeys: string[] = ['name', 'description', 'quant'];
  
  // Talent table properties
  talentTableData: any[] = [];
  talentTableHeaders: string[] = ['Name', 'Effect'];
  talentTableHeaderKeys: string[] = ['name', 'effect'];
  
  // Scroll nav
  scrollSections: ScrollSection[] = [];

  constructor(
    private dataService: DataService,
    private activePlayerService: ActivePlayerService,
    private toastService: ToastService
  ) {}

  ngOnChanges(): void {
    // Body parts formatting
    this.bodyString = this.character.attributes.body.join(', ');
    
    // Update talent table data if character is a player
    if (this.isPlayer(this.character) && this.character.progression?.talents) {
      this.talentTableData = this.character.progression.talents.map((talentId: string) => {
        // Get talent info from id
        const talent = this.dataService.getTalentById(talentId);
        return {
          name: talent?.name,
          effect: talent?.effect
        };
      });
    }
    
    // Update item table data
    if (this.character.items && this.character.items.length > 0) {
      this.itemTableData = this.character.items.map(inventory => {
        const item = this.getItemById(inventory.id);
        return {
          id: inventory.id,
          name: item?.name || 'Unknown Item',
          description: item?.description || 'No description available',
          quant: inventory.quant
        };
      });
    }
    
    // Set up scroll sections
    this.scrollSections = [
      { title: 'Attributes', id: 'attributes' },
      { title: 'Weapons', id: 'weapons' },
    ];
    if (this.isPlayer(this.character) && this.talentTableData.length > 0) {
      this.scrollSections.push({ title: 'Talents', id: 'talents' });
    }
    if (this.character.abilities && this.character.abilities.length > 0) {
      this.scrollSections.push({ title: 'Abilities', id: 'abilities' });
    }
    if ((this.isPlayer(this.character) || this.isBestiary(this.character)) && this.character.items?.length) {
      this.scrollSections.push({ title: 'Items', id: 'items' });
    }
    if (this.character.deployables?.length) {
      this.scrollSections.push({ title: 'Deployables', id: 'deployables' });
    }
  }

  isPlayer(character: Character): character is Player {
    return !!(character as Player).race;
  }

  isBeast(character: Character): boolean {
    return !(character as Player).race;
  }

  isBestiary(character: Character): boolean {
    return !!(character as BestiaryEntry).faction && !!(character as BestiaryEntry).subgroup;
  }

  getFaction(character: Character): string {
    return (character as BestiaryEntry).faction || '';
  }

  getSubgroup(character: Character): string {
    return (character as BestiaryEntry).subgroup || '';
  }

  getPR(character: Character): number {
    return (character as BestiaryEntry).pr || 0;
  }

  getMobById(bestiaryId: number): any {
    return this.dataService.getBestiaryById(bestiaryId);
  }

  getItemById(id: number): any {
    // Search in all item categories
    for (const category of Object.values(this.itemsData)) {
      const foundItem = (category as any[]).find((item: any) => item.id === id);
      if (foundItem) return foundItem;
    }
    return null;
  }

  isActivePlayer(character: Character): boolean {
    const activePlayer = this.activePlayerService.activePlayer;
    return activePlayer !== null && activePlayer.id === character.id;
  }

  isActionAllowed(character: Character): boolean {
    return this.isPlayer(character) && this.isActivePlayer(character);
  }

  copyToClipboard(): void {
    if (!this.isActivePlayer(this.character)) {
      return;
    }

    const player = this.activePlayerService.activePlayer;
    if (player) {
      const playerJson = JSON.stringify(player, null, 2);
      navigator.clipboard.writeText(playerJson)
        .then(() => {
          this.toastService.show('Active player changes copied to clipboard', 'success');
        })
        .catch(err => {
          console.error('Failed to copy to clipboard:', err);
          this.toastService.show('Failed to copy to clipboard', 'error');
        });
    }
  }
}