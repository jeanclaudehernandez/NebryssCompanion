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
  subgroups: string[] = [];
  selectedFaction: string | null = null;
  selectedSubGroup: string | null = null;
  filteredCreatures: any[] = [];
  itemsData: any;
  weaponsData: any[] = [];
  weaponRulesData: any[] = [];

  constructor(private dataService: DataService) {}

  ngOnInit() {
    this.dataService.getAllData().subscribe(response => {
      this.bestiary = response.bestiary;
      this.itemsData = response.items;
      this.weaponsData = response.weapons;
      this.weaponRulesData = response.weaponRules;
      this.factions = this.getUniqueValues(response.bestiary, 'faction');

      // Load saved filters
      const savedFaction = localStorage.getItem('bestiaryFaction');
      if (savedFaction !== null) this.selectedFaction = JSON.parse(savedFaction);
      
      this.applyFilters(); // Initial filter setup
      this.subgroups = this.getUniqueValues(this.filteredCreatures, 'subgroup');

      // Load saved subgroup
      const savedSubGroup = localStorage.getItem('bestiarySubGroup');
      if (savedSubGroup !== null && this.subgroups.includes(JSON.parse(savedSubGroup))) {
        this.selectedSubGroup = JSON.parse(savedSubGroup);
        this.applyFilters();
      }

      // Load saved creature
      const savedCreatureId = localStorage.getItem('bestiaryCreatureId');
      if (savedCreatureId !== null) {
        const creature = this.filteredCreatures.find(c => c.id === Number(JSON.parse(savedCreatureId)));
        if (creature) {
          this.selectedCreatureId = creature.id;
          this.selectedCreature = creature;
        }
      }
    });
  }

  private getUniqueValues(array: any[], property: string): string[] {
    return [...new Set(array.map(item => item[property]))].sort();
  }

  onFactionSelected() {
    this.selectedSubGroup = null;
    this.applyFilters();
    this.subgroups = this.getUniqueValues(this.filteredCreatures, 'subgroup');
    
    // Clear invalid subgroup selection
    
    if (this.selectedSubGroup && !this.subgroups.includes(this.selectedSubGroup)) {
      
      localStorage.removeItem('bestiarySubGroup');
    }
    
    
    localStorage.setItem('bestiaryFaction', JSON.stringify(this.selectedFaction));
  }

  onSubGroupSelected() {
    this.applyFilters();
    if (this.selectedSubGroup) {
      localStorage.setItem('bestiarySubGroup', JSON.stringify(this.selectedSubGroup));
    } else {
      localStorage.removeItem('bestiarySubGroup');
    }
  }

  private applyFilters() {
    this.filteredCreatures = this.bestiary.filter(c => {
      const factionMatch = !this.selectedFaction || c.faction === this.selectedFaction;
      const subgroupMatch = !this.selectedSubGroup || c.subgroup === this.selectedSubGroup;
      return factionMatch && subgroupMatch;
    });
  }

  onCreatureSelected() {
    if (this.selectedCreatureId) {
      this.selectedCreature = this.bestiary.find(c => c.id === Number(this.selectedCreatureId));
      localStorage.setItem('bestiaryCreatureId', JSON.stringify(this.selectedCreatureId));
    } else {
      this.selectedCreature = null;
      localStorage.removeItem('bestiaryCreatureId');
    }
  }
}