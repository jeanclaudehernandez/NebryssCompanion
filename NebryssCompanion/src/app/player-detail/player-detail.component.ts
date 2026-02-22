import { Component, Input, OnChanges, Output, EventEmitter, TemplateRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WeaponTableComponent } from '../weapon-table/weapon-table.component';
import { DataService } from '../data.service';
import { AlteredState, BestiaryEntry, Character, Inventory, Items, Player, ScrollSection, Talent, Weapon, WeaponRule } from '../model';
import { SanitizeHtmlPipe } from '../sanitizeHtml.pipe';
import { GenericTableComponent } from '../generic-table/generic-table.component';
import { ActivePlayerService } from '../active-player.service';
import { ScrollNavComponent } from '../scroll-nav/scroll-nav.component';
import { ToastService } from '../toast.service';
import { ModalService } from '../modal.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-player-detail',
  standalone: true,
  imports: [CommonModule, WeaponTableComponent, SanitizeHtmlPipe, GenericTableComponent, ScrollNavComponent, FormsModule],
  templateUrl: './player-detail.component.html',
  styleUrls: ['./player-detail.component.css']
})
export class PlayerDetailComponent implements OnChanges {
  @Input() character!: Character;
  @Input() weaponsData: Weapon[] = [];
  @Input() weaponRulesData: WeaponRule[] = [];
  @Input() alteredStates: AlteredState[] = [];
  @Input() itemsData!: Items;
  @Input() hideScrollNav = false;
  @Output() scrollSectionsChange = new EventEmitter<ScrollSection[]>();
  
  bodyString = "";
  activeTooltip: string | null = null;
  tooltipX = 0;
  tooltipY = 0;
  itemTableData: any[] = [];
  itemTableHeaders: string[] = ['Name', 'Description', 'Quantity'];
  itemTableHeaderKeys: string[] = ['name', 'description', 'quant'];
  modItems: { inventory: Inventory; item: any }[] = [];
  ownedWeapons: Weapon[] = [];
  
  // Talent table properties
  talentTableData: any[] = [];
  talentTableHeaders: string[] = ['Name', 'Effect'];
  talentTableHeaderKeys: string[] = ['name', 'effect'];
  
  // Process abilities for display
  processedAbilities: {name: string, effect: string}[] = [];
  
  // Scroll nav
  scrollSections: ScrollSection[] = [];

  @ViewChild('mistralDialog', { read: TemplateRef }) mistralDialogTemplate!: TemplateRef<any>;
  mistralModalType: 'digital' | 'physical' | null = null;
  mistralModalAmount = 0;

  constructor(
    private dataService: DataService,
    private activePlayerService: ActivePlayerService,
    private toastService: ToastService,
    private modalService: ModalService
  ) {}

  ngOnChanges(): void {
    this.bodyString = this.character.attributes.body.join(', ');
    
    if (this.isPlayer(this.character) && this.character.progression?.talents) {
      this.talentTableData = this.character.progression.talents.map((talentId: string) => {
        const talent = this.dataService.getTalentById(talentId);
        return {
          name: talent?.name,
          effect: talent?.effect
        };
      });
    }
    
    if (this.character.items && this.character.items.length > 0) {
      this.itemTableData = this.character.items.map(inventory => {
        const item = this.getItemById(inventory.id);
        const rawDescription = item?.description || 'No description available';
        return {
          id: inventory.id,
          name: item?.name || 'Unknown Item',
          description: this.processItemDescription(rawDescription),
          quant: inventory.quant,
          type: item?.type
        };
      });
    }

    if (this.isPlayer(this.character)) {
      const player = this.character as Player;
      this.ownedWeapons = this.weaponsData.filter(w => player.weapons?.includes(w.id));
      if (player.items && player.items.length > 0) {
        this.modItems = player.items
          .map((inventory: Inventory) => {
            const item = this.getItemById(inventory.id);
            if (!item || item.type !== 'modification') {
              return null;
            }
            return { inventory, item };
          })
          .filter((entry): entry is { inventory: Inventory; item: any } => !!entry);
      } else {
        this.modItems = [];
      }
    } else {
      this.modItems = [];
      this.ownedWeapons = [];
    }
    
    if (this.character.abilities && this.character.abilities.length > 0) {
      this.processedAbilities = this.character.abilities.map(ability => ({
        name: ability.name,
        effect: this.processAbilityEffect(ability.effect)
      }));
    } else {
      this.processedAbilities = [];
    }
    
    this.scrollSections = [
      { title: `${(this.isBeast(this.character) ? this.character.name : '')} Attributes`, id: `attributes-${this.character.id}`},
      { title: `${(this.isBeast(this.character) ? this.character.name : '')} Weapons`, id: `weapons-${this.character.id}`},
    ];
    if (this.isPlayer(this.character) && this.modItems.length > 0) {
      this.scrollSections.push({ title: 'Mods', id: `mods-${this.character.id}` });
    }
    if (this.isPlayer(this.character) && this.talentTableData.length > 0) {
      this.scrollSections.push({ title: 'Talents', id: `talents-${this.character.id}` });
    }
    if (this.character.abilities && this.character.abilities.length > 0) {
      this.scrollSections.push({ title: `${(this.isBeast(this.character) ? this.character.name : '')} Abilities`, id: `abilities-${this.character.id}`});
    }
    if ((this.isPlayer(this.character) || this.isBestiary(this.character)) && this.character.items?.length) {
      this.scrollSections.push({ title: `${(this.isBeast(this.character) ? this.character.name : '')} Items`, id: `items-${this.character.id}` });
    }
    if (this.character.deployables?.length) {
      this.scrollSections.push({ title: `${(this.isBeast(this.character) ? this.character.name : '')} Deployables`, id: `deployables-${this.character.id}`});
    }
    
    this.scrollSectionsChange.emit(this.scrollSections);
  }

  processAbilityEffect(effect: string): string {
    if (!effect) return '';
    
    const statusMatches = [...new Set(effect.match(/\/status\/:\d+\//g))];
    
    if (!statusMatches || statusMatches.length === 0) return effect;
    
    let processedEffect = effect;
    
    statusMatches.forEach(match => {
      const statusId = parseInt(match.replace('/status/:', '').replace('/', ''));
      const status = this.alteredStates.find(s => s.id === statusId);
      
      if (status) {
        const link = `<span class="status-link" data-status="${status.name}">${status.name}</span>`;
        processedEffect = processedEffect.replace(new RegExp(match, 'g'), link);
      }
    });
    
    return processedEffect;
  }

  processItemDescription(description: string): string {
    if (!description) return '';
    const withStatuses = this.replaceStatusTokens(description);
    const regex = /\/weaponRule\/:(\d+)\//g;
    return withStatuses.replace(regex, (match: string, idStr: string) => {
      const id = parseInt(idStr, 10);
      const rule = this.weaponRulesData.find(r => r.id === id);
      if (!rule) return match;
      const name = rule.name;
      return `<span class="weapon-rule-link" data-weapon-rule="${name}">${name}</span>`;
    });
  }

  private replaceStatusTokens(text: string): string {
    const regex = /\/status\/:(\d+)\//g;
    return text.replace(regex, (match: string, idStr: string) => {
      const id = parseInt(idStr, 10);
      const status = this.alteredStates.find(s => s.id === id);
      if (!status) return match;
      const name = status.name;
      return `<span class="status-link" data-status="${name}">${name}</span>`;
    });
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
    // With the new structure, items are in a single array
    if (!this.itemsData || !this.itemsData.items) return null;
    return this.itemsData.items.find((item: any) => item.id === id);
  }

  isActivePlayer(character: Character): boolean {
    const activePlayer = this.activePlayerService.activePlayer;
    return this.isPlayer(character) && activePlayer !== null && activePlayer.id === character.id;
  }

  isActionAllowed(character: Character): boolean {
    return this.isPlayer(character) && this.isActivePlayer(character);
  }

  onModAttachedWeaponChange(inventoryItem: Inventory): void {
    const activePlayer = this.activePlayerService.activePlayer;
    if (
      !activePlayer ||
      !this.isPlayer(this.character) ||
      activePlayer.id !== this.character.id ||
      !activePlayer.items
    ) {
      return;
    }
    const playerItem = activePlayer.items.find(i => i.id === inventoryItem.id);
    if (!playerItem) {
      return;
    }
    (playerItem as any).attachedTo = (inventoryItem as any).attachedTo;
    this.activePlayerService.updateActivePlayer({ ...activePlayer });
    if (this.isPlayer(this.character) && activePlayer.id === this.character.id) {
      this.character = { ...activePlayer };
    }
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

  getDigitalMistrals(character: Character): number {
    if (!this.isPlayer(character)) {
      return 0;
    }
    const progression = (character as Player).progression;
    if (!progression || !progression.mistrals) {
      return 0;
    }
    return progression.mistrals.digital || 0;
  }

  getPhysicalMistralsTotal(character: Character): number {
    if (!this.isPlayer(character)) {
      return 0;
    }
    const progression = (character as Player).progression;
    if (!progression || !progression.mistrals) {
      return 0;
    }
    return progression.mistrals.physical || 0;
  }

  openMistralModal(type: 'digital' | 'physical'): void {
    if (!this.isActionAllowed(this.character)) {
      return;
    }
    if (!this.mistralDialogTemplate) {
      return;
    }
    this.mistralModalType = type;
    this.mistralModalAmount = 0;
    const context = {
      type,
      confirm: () => this.confirmMistralAddition(),
      cancel: () => this.modalService.close(),
      setAmount: (value: number) => {
        if (!Number.isFinite(value)) {
          this.mistralModalAmount = 0;
        } else {
          this.mistralModalAmount = Math.floor(value);
        }
      }
    };
    this.modalService.openFromTemplate(this.mistralDialogTemplate, context);
  }

  private confirmMistralAddition(): void {
    if (!this.mistralModalType) {
      this.modalService.close();
      return;
    }
    const amount = this.mistralModalAmount;
    console.log(amount)
    const activePlayer = this.activePlayerService.activePlayer;
    if (
      !activePlayer ||
      !this.isPlayer(activePlayer) ||
      !this.isPlayer(this.character) ||
      activePlayer.id !== this.character.id
    ) {
      this.modalService.close();
      return;
    }
    if (!activePlayer.progression || !activePlayer.progression.mistrals) {
      this.modalService.close();
      return;
    }
    if (this.mistralModalType === 'digital') {
      activePlayer.progression.mistrals.digital =
        (activePlayer.progression.mistrals.digital || 0) + amount;
    } else {
      activePlayer.progression.mistrals.physical =
        (activePlayer.progression.mistrals.physical || 0) + amount;
    }
    this.activePlayerService.updateActivePlayer({ ...activePlayer });
    if (this.isPlayer(this.character) && activePlayer.id === this.character.id) {
      this.character = { ...activePlayer };
    }
    const label = this.mistralModalType === 'digital' ? 'digital' : 'physical';
    this.toastService.show(`Added ${amount} ${label} mistrals`, 'success');
    this.modalService.close();
    this.mistralModalType = null;
    this.mistralModalAmount = 0;
  }
}
