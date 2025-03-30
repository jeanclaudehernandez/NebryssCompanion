import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WeaponTableComponent } from '../weapon-table/weapon-table.component';

@Component({
  selector: 'app-player-detail',
  standalone: true,
  imports: [CommonModule, WeaponTableComponent],
  templateUrl: './player-detail.component.html',
  styleUrls: ['./player-detail.component.css']
})
export class PlayerDetailComponent implements OnInit {
  @Input() player: any;
  @Input() weaponsData: any;
  @Input() weaponRulesData: any[] = [];
  @Input() itemsData: any[] = [];
  activeTooltip: string | null = null;
  tooltipX = 0;
  tooltipY = 0;

  ngOnInit(): void {
    // Initialization if needed
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