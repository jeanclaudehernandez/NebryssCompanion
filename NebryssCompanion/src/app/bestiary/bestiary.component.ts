// bestiary.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule, JsonPipe } from '@angular/common';
import { DataService } from '../data.service';
import { PlayerDetailComponent } from '../player-detail/player-detail.component';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-bestiary',
  standalone: true,
  imports: [CommonModule, FormsModule, PlayerDetailComponent, JsonPipe],
  templateUrl: './bestiary.component.html',
  styleUrls: ['./bestiary.component.css']
})
export class BestiaryComponent implements OnInit {
  bestiary: any[] = [];
  selectedCreatureId: number | null = null;
  selectedCreature: any = null;
  factions: string[] = [];
  selectedFaction: string = "null";
  filteredCreatures: any[] = [];
  itemsData: any;
  weaponsData: any;
  weaponRulesData: any[] = [];

  constructor(private dataService: DataService) {}

  ngOnInit() {
    this.dataService.getAllData().subscribe(response => {
      this.bestiary = response.bestiary;
      this.itemsData = response.items;
      this.weaponsData = response.weapons;
      this.weaponRulesData = response.weaponRules;
      this.factions = this.getUniqueFactions(response.bestiary);      
      this.onFactionSelected();
    });
  }

  private getUniqueFactions(creatures: any[]): string[] {
    return [...new Set(creatures.map(c => c.faction))].sort();
  }

  onFactionSelected() {
    if (this.selectedFaction !== "null") {
      this.filteredCreatures = this.bestiary.filter(c => c.faction === this.selectedFaction);
    } else {
      this.filteredCreatures = [...this.bestiary];
    }
  }

  onCreatureSelected() {
    if (this.selectedCreatureId) {
      this.selectedCreature = this.bestiary.find(c => c.id === Number(this.selectedCreatureId));
    }
  }
}