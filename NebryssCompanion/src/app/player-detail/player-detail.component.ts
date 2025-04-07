import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WeaponTableComponent } from '../weapon-table/weapon-table.component';
import { DataService } from '../data.service';
import { AlteredState, BestiaryEntry, Character, Items, Player, ScrollSection, Talent, Weapon, WeaponRule } from '../model';
import { SanitizeHtmlPipe } from '../sanitizeHtml.pipe';
import { GenericTableComponent } from '../generic-table/generic-table.component';
import { ActivePlayerService } from '../active-player.service';
import { ScrollNavComponent } from '../scroll-nav/scroll-nav.component';

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
    private activePlayerService: ActivePlayerService
  ) {}

  ngOnChanges() {
    if (this.character) {
      // Get body string
      this.bodyString = this.character.attributes.body?.join(', ') || '';
      
      // Process talent data if applicable
      if (this.isPlayer(this.character) && this.character.progression?.talents) {
        this.talentTableData = this.character.progression.talents.map((talentId: string) => {
          // Get talent info from id
          const talent = this.dataService.getTalentById(talentId);
          
          return { name: talent?.name, effect: talent?.effect };
        });
      }
      
      // Process item data if applicable
      if (this.isPlayer(this.character) && this.character.items?.length) {
        this.itemTableData = this.character.items.map(itemEntry => {
          // Find the item in itemsData
          const item = this.getItemById(itemEntry.id);
          
          return { 
            id: item?.id,
            name: item?.name, 
            description: item?.description,
            quant: itemEntry.quant || 1 
          };
        });
      }
      
      // Generate scroll sections based on available content
      this.generateScrollSections();
    }
  }
  
  generateScrollSections() {
    this.scrollSections = [];
    
    // Always add attributes and weapons sections
    this.scrollSections.push(
      { title: 'Attributes', id: 'attributes' },
      { title: 'Weapons', id: 'weapons' }
    );
    
    // Add talents section if applicable
    if (this.isPlayer(this.character) && this.talentTableData.length > 0) {
      this.scrollSections.push({ title: 'Talents', id: 'talents' });
    }
    
    // Add abilities section if character has abilities
    if (this.character.abilities && this.character.abilities.length > 0) {
      this.scrollSections.push({ title: 'Abilities', id: 'abilities' });
    }
    
    // Add items section if applicable
    if (this.isPlayer(this.character) && this.character.items?.length) {
      this.scrollSections.push({ title: 'Items', id: 'items' });
    }
    
    // Add deployables section if applicable
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
}