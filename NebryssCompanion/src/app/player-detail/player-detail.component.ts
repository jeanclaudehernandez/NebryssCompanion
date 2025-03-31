import { ChangeDetectorRef, Component, Input, OnChanges, OnInit } from '@angular/core';
import { CommonModule, JsonPipe } from '@angular/common';
import { WeaponTableComponent } from '../weapon-table/weapon-table.component';
import { DataService } from '../data.service';

@Component({
  selector: 'app-player-detail',
  standalone: true,
  imports: [CommonModule, WeaponTableComponent, JsonPipe],
  templateUrl: './player-detail.component.html',
  styleUrls: ['./player-detail.component.css']
})
export class PlayerDetailComponent implements OnChanges {
  @Input() character: any;
  @Input() characterType: 'player' | 'mob' = 'player';
  @Input() weaponsData: any;
  @Input() weaponRulesData: any[] = [];
  @Input() itemsData: any[] = [];
  bodyString = "";
  activeTooltip: string | null = null;
  tooltipX = 0;
  tooltipY = 0;

  constructor(private dataService: DataService) {}

  ngOnChanges(): void {
    this.bodyString = this.character.attributes.body.reduce((body: string, acc: string) => body + " " + acc, "")
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
}