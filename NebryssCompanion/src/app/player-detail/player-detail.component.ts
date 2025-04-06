import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WeaponTableComponent } from '../weapon-table/weapon-table.component';
import { DataService } from '../data.service';
import { AlteredState, BestiaryEntry, Character, Items, Player, Weapon, WeaponRule } from '../model';
import { SanitizeHtmlPipe } from '../sanitizeHtml.pipe';
import { GenericTableComponent } from '../generic-table/generic-table.component';

@Component({
  selector: 'app-player-detail',
  standalone: true,
  imports: [CommonModule, WeaponTableComponent, SanitizeHtmlPipe, GenericTableComponent],
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

  constructor(private dataService: DataService) {}

  ngOnChanges(): void {
    this.bodyString = this.character.attributes.body.reduce((body: string, acc: string) => body + " " + acc, "");
    this.prepareItemTableData();
  }

  prepareItemTableData(): void {
    if (this.isPlayer(this.character) && this.character.items && this.character.items.length > 0) {
      this.itemTableData = this.character.items.map(itemId => {
        const item = this.getItemById(itemId.id);
        if (item) {
          return {
            ...item,
            quant: itemId.quant || 1
          };
        }
        return null;
      }).filter(item => item !== null);
    } else {
      this.itemTableData = [];
    }
  }

  getMobById(bestiaryId: number): any {
    return this.dataService.getBestiaryById(bestiaryId);
  }

  isPlayer(character: Character): character is Player {
    return 'race' in character;
  }

  isBeast(character: Character): character is BestiaryEntry {
    return 'pr' in character;
  }


  getItemById(id: number): any {
    // Search in all item categories
    for (const category of Object.values(this.itemsData)) {
      const foundItem = (category as any[]).find((item: any) => item.id === id);
      if (foundItem) return foundItem;
    }
    return null;
  }
}