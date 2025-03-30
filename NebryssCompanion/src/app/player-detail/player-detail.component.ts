import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../data.service';
import { WeaponDisplayComponent } from '../weapon-display/weapon-display.component';
import { NgIf, NgFor } from '@angular/common';

@Component({
  selector: 'app-player-detail',
  standalone: true,
  imports: [
    CommonModule,
    WeaponDisplayComponent,
    NgIf,
    NgFor
  ],
  templateUrl: './player-detail.component.html',
  styleUrls: ['./player-detail.component.css']
})
export class PlayerDetailComponent implements OnInit {
  @Input() player: any;
  @Input() weaponsData: any;
  @Input() itemsData: any;
  @Input() weaponRulesData: any[] = [];

  constructor(private dataService: DataService) { }

  ngOnInit(): void {
  }

  getItemById(id: number): any {
    return this.dataService.getItemById(id, this.itemsData);
  }
}