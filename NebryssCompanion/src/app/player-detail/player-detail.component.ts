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
import { AfflictionsDisplayComponent } from '../afflictions-display/afflictions-display.component';

@Component({
  selector: 'app-player-detail',
  standalone: true,
  imports: [CommonModule, WeaponTableComponent, SanitizeHtmlPipe, GenericTableComponent, ScrollNavComponent, FormsModule, AfflictionsDisplayComponent],
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
  
  calculatedAttributes: any = {};

  // Equipment table properties
  equipmentTableData: any[] = [];
  equipmentTableHeaders: string[] = ['Name', 'Description'];
  equipmentTableHeaderKeys: string[] = ['name', 'description'];

  modItems: { inventory: Inventory; item: any }[] = [];
  ownedWeapons: Weapon[] = [];
  visibleWeaponIds: number[] = [];
  
  // Talent table properties
  talentTableData: any[] = [];
  talentTableHeaders: string[] = ['Name', 'Effect'];
  talentTableHeaderKeys: string[] = ['name', 'effect'];
  
  // Process abilities for display
  processedAbilities: {name: string, effect: string}[] = [];
  
  // Scroll nav
  scrollSections: ScrollSection[] = [];

  @ViewChild('mistralDialog', { read: TemplateRef }) mistralDialogTemplate!: TemplateRef<any>;
  @ViewChild('craftConfirmModal', { read: TemplateRef }) craftConfirmModal!: TemplateRef<any>;
  selectedBlueprint: any = null;
  mistralModalType: 'digital' | 'physical' | null = null;
  mistralModalAmount = 0;

  constructor(
    private dataService: DataService,
    private activePlayerService: ActivePlayerService,
    private toastService: ToastService,
    public modalService: ModalService
  ) {}

  getCalculatedAttributes(): any {
    if (!this.character || !this.character.attributes) {
      return {};
    }

    const attrs = { ...this.character.attributes };
    
    // Helper to apply mods
    const applyMods = (mods: any[]) => {
      if (!mods) return;
      mods.forEach(mod => {
        if (mod.stat && typeof mod.mod === 'number') {
          // Check if the attribute exists and is a number before adding
          if (typeof attrs[mod.stat as keyof typeof attrs] === 'number') {
            let valueToAdd = mod.mod;
            if (mod.stat === 'Save') {
              valueToAdd = mod.mod * -1;
            }
            (attrs[mod.stat as keyof typeof attrs] as number) += valueToAdd;
          }
        }
      });
    };

    if (this.isPlayer(this.character)) {
      const player = this.character as Player;
      if (player.progression) {
        // Equipment
        if (player.progression.equipment) {
          player.progression.equipment.forEach(equipId => {
            const item = this.getItemById(equipId);
            if (item && item.statModifications) {
              applyMods(item.statModifications);
            }
          });
        }

        // Talents
        if (player.progression.talents) {
          player.progression.talents.forEach(talentId => {
            const talent = this.dataService.getTalentById(talentId);
            if (talent && talent.statModifications) {
              applyMods(talent.statModifications);
            }
          });
        }

        // Afflictions
        if (player.progression.afflictions) {
          player.progression.afflictions.forEach(affliction => {
            // Afflictions in progression might be the object itself, 
            // but we should ensure we have the static data if needed.
            // However, the interface says Affliction[] so it should have the props.
            // But usually statModifications are static data. 
            // If the saved affliction doesn't have it, we might need to look it up?
            // Assuming the saved affliction object is complete or we trust it.
            // Actually, if we look at afflictions.json, they have statModifications.
            // If the player's affliction is a copy, it should have it.
            if (affliction.statModifications) {
              applyMods(affliction.statModifications);
            }
          });
        }
      }
    }

    return attrs;
  }

  ngOnChanges(): void {
    this.calculatedAttributes = this.getCalculatedAttributes();
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
    
    // Initialize itemTableData
    this.itemTableData = [];
    if (this.character.items && this.character.items.length > 0) {
      this.itemTableData = this.character.items.map(inventory => {
        const item = this.getItemById(inventory.id);
        const rawDescription = item?.description || 'No description available';
        
        let canCraft = false;
        let blueprintForName = '';
        let buildMaterials: any[] = [];
        let _blueprintForId = null;

        if (this.isActionAllowed(this.character) && item?.type === 'blueprint') {
           if (item.blueprintFor) {
              const weapon = this.weaponsData.find(w => w.id === item.blueprintFor);
              blueprintForName = weapon ? weapon.name : `Unknown Weapon (${item.blueprintFor})`;
              _blueprintForId = item.blueprintFor;
           }
           
           if (item.buildMaterials) {
              buildMaterials = item.buildMaterials;
              const hasMaterials = item.buildMaterials.every((mat: any) => {
                  const playerItem = this.character.items?.find(i => i.id === mat.id);
                  return playerItem && playerItem.quant >= mat.amount;
              });
              canCraft = hasMaterials;
           }
        }

        return {
          id: inventory.id,
          name: item?.name || 'Unknown Item',
          description: this.processItemDescription(rawDescription),
          quant: inventory.quant,
          type: item?.type,
          canCraft,
          blueprintForName,
          buildMaterials,
          _blueprintForId,
          isEquippable: item?.isEquippable
        };
      });
    }

    // Initialize equipmentTableData - Moved outside items check
    this.equipmentTableData = [];
    if (this.isPlayer(this.character)) {
      const player = this.character as Player;
      if (player.progression?.equipment) {
          this.equipmentTableData = player.progression.equipment.map(equipId => {
            const item = this.getItemById(equipId);
            const rawDescription = item?.description || 'No description available';
            return {
              id: equipId,
              name: item?.name || 'Unknown Item',
              description: this.processItemDescription(rawDescription),
              type: item?.type
            };
          });
      }
    }

    if (this.isPlayer(this.character)) {
      const player = this.character as Player;
      
      const playerBodyTypes = player.attributes.body || [];
      const allWeaponIds = player.weapons || [];
      const validWeaponIds: number[] = [];
      const invalidWeapons: Weapon[] = [];

      allWeaponIds.forEach(wid => {
          const weapon = this.weaponsData.find(w => w.id === wid);
          if (!weapon) return;

          const weaponBodyTypes = new Set<string>();
          weapon.profiles.forEach(p => {
              if (p.body) weaponBodyTypes.add(p.body);
          });
          
          const hasMatch = Array.from(weaponBodyTypes).some(wb => playerBodyTypes.includes(wb));
          
          if (hasMatch) {
              validWeaponIds.push(wid);
          } else {
              invalidWeapons.push(weapon);
          }
      });

      this.visibleWeaponIds = validWeaponIds;
      this.ownedWeapons = this.weaponsData.filter(w => validWeaponIds.includes(w.id));

      const invalidWeaponItems = invalidWeapons.map(w => ({
          id: w.id,
          name: w.name,
          description: 'Weapon (Incompatible Body Type)',
          quant: 1,
          type: 'weapon',
          canCraft: false,
          blueprintForName: '',
          buildMaterials: [],
          _blueprintForId: null
      }));

      this.itemTableData = [...this.itemTableData, ...invalidWeaponItems];

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
      this.visibleWeaponIds = this.character.weapons || [];
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
    if (this.isPlayer(this.character) && this.character.progression?.afflictions?.length) {
      this.scrollSections.push({ title: 'Afflictions', id: `afflictions-${this.character.id}` });
    }
    if (this.character.abilities && this.character.abilities.length > 0) {
      this.scrollSections.push({ title: `${(this.isBeast(this.character) ? this.character.name : '')} Abilities`, id: `abilities-${this.character.id}`});
    }
    if ((this.isPlayer(this.character) || this.isBestiary(this.character)) && this.itemTableData.length > 0) {
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
    let item = null;
    if (this.itemsData && this.itemsData.items) {
      item = this.itemsData.items.find((item: any) => item.id === id);
    }
    
    // Also check weapons data as equipment/inventory might contain weapons
    if (!item && this.weaponsData) {
      item = this.weaponsData.find(w => w.id === id);
    }
    
    return item;
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

  onCraft(item: any) {
    this.selectedBlueprint = item;
    if (this.craftConfirmModal) {
      this.modalService.openFromTemplate(this.craftConfirmModal);
    } else {
      console.error('craftConfirmModal is undefined!');
    }
  }

  onEquip(item: any) {
    if (!this.isPlayer(this.character)) return;
    const player = this.character as Player;
    
    // Ensure structure exists
    if (!player.progression) {
        player.progression = { 
            talentPoints: 0, 
            mistrals: { digital: 0, physical: 0 }, 
            talents: [], 
            afflictions: [], 
            equipment: [] 
        };
    }
    if (!player.progression.equipment) {
        player.progression.equipment = [];
    }

    // Add if not present
    if (!player.progression.equipment.includes(item.id)) {
        player.progression.equipment.push(item.id);
        
        // Find the item in player's inventory and decrement quantity
        const inventoryItem = player.items.find(i => i.id === item.id);
        if (inventoryItem) {
            inventoryItem.quant--;

            if (inventoryItem.quant <= 0) {
                player.items = player.items.filter(i => i.id !== item.id);
            }
        }

        this.activePlayerService.updateActivePlayer(player);
        
        // Refresh UI
        this.character = { ...player };
        this.ngOnChanges();
        
        this.toastService.show('Item equipped', 'success');
    }
  }

  onUnequip(item: any) {
    if (!this.isPlayer(this.character)) return;
    const player = this.character as Player;

    if (!player.progression || !player.progression.equipment) return;

    const index = player.progression.equipment.indexOf(item.id);
    if (index > -1) {
        // Remove from equipment
        player.progression.equipment.splice(index, 1);

        // Add to inventory
        if (!player.items) player.items = [];
        const inventoryItem = player.items.find(i => i.id === item.id);
        
        if (inventoryItem) {
            inventoryItem.quant++;
        } else {
            player.items.push({ id: item.id, quant: 1 });
        }

        this.activePlayerService.updateActivePlayer(player);
        
        // Refresh UI
        this.character = { ...player };
        this.ngOnChanges();
        
        this.toastService.show('Item unequipped', 'success');
    }
  }

  confirmCraft() {
    if (!this.selectedBlueprint) return;
    
    const player = this.activePlayerService.activePlayer;
    if (!player || player.id !== this.character.id) return; 

    // Check if player already has this weapon
    if (this.selectedBlueprint._blueprintForId && player.weapons && player.weapons.includes(this.selectedBlueprint._blueprintForId)) {
      this.toastService.show(`You already have ${this.selectedBlueprint.blueprintForName}!`, 'info');
      this.modalService.close();
      return;
    }

    // Deduct materials
    if (this.selectedBlueprint.buildMaterials) {
       this.selectedBlueprint.buildMaterials.forEach((mat: any) => {
          if (!player.items) return;
          const playerItem = player.items.find(i => i.id === mat.id);
          if (playerItem) {
             playerItem.quant -= mat.amount;
          }
       });
       // Remove items with 0 or less quantity
       if (player.items) {
         player.items = player.items.filter(i => i.quant > 0);
       }
    }

    // Add Weapon
    if (this.selectedBlueprint._blueprintForId) {
       if (!player.weapons) player.weapons = [];
       player.weapons.push(this.selectedBlueprint._blueprintForId);
       this.toastService.show(`Crafted ${this.selectedBlueprint.blueprintForName}!`, 'success');
    }

    this.activePlayerService.updateActivePlayer({...player});
    this.modalService.close();
    this.selectedBlueprint = null;
    
    // Refresh character data and table
    if (this.isPlayer(this.character)) {
        this.character = { ...player };
        this.ngOnChanges(); 
    }
  }

  getMaterialName(id: number): string {
    if (!this.itemsData || !this.itemsData.items) return 'Unknown Material';
    const item = this.itemsData.items.find(i => i.id === id);
    return item?.name || `Unknown Material (${id})`;
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
