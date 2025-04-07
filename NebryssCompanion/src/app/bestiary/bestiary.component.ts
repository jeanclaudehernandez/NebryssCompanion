// bestiary.component.ts
import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../data.service';
import { PlayerDetailComponent } from '../player-detail/player-detail.component';
import { FormsModule } from '@angular/forms';
import { AlteredState, BestiaryEntry, Items, Weapon, WeaponRule } from '../model';

@Component({
  selector: 'app-bestiary',
  standalone: true,
  imports: [CommonModule, FormsModule, PlayerDetailComponent],
  templateUrl: './bestiary.component.html',
  styleUrls: ['./bestiary.component.css']
})
export class BestiaryComponent implements OnInit {
  @ViewChild('mobDetailContainer') mobDetailContainer!: ElementRef;
  bestiary: BestiaryEntry[] = [];
  selectedCreatureId: number | null = null;
  selectedCreature: BestiaryEntry | null = null;
  factions: string[] = [];
  subgroups: string[] = [];
  selectedFaction: string | null = null;
  selectedSubGroup: string | null = null;
  filteredCreatures: BestiaryEntry[] = [];
  itemsData!: Items;
  weaponsData: Weapon[] = [];
  weaponRulesData: WeaponRule[] = [];
  alteredStates: AlteredState[] = [];

  constructor(private dataService: DataService) {}

  ngOnInit() {
    this.dataService.getAllData().subscribe(response => {
      this.bestiary = response.bestiary;
      this.itemsData = response.items;
      this.weaponsData = response.weapons;
      this.weaponRulesData = response.weaponRules;
      this.factions = this.getUniqueValues(response.bestiary, 'faction');
      this.alteredStates = response.alteredStates;

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
          this.scrollToMob();
        }
      }

      console.log(this.dataService.validateBestiaryPR().filter((creature) => creature.calculatedPR != creature.currentPR));
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
      this.selectedCreature = this.bestiary.find(c => c.id === Number(this.selectedCreatureId)) || null;
      localStorage.setItem('bestiaryCreatureId', JSON.stringify(this.selectedCreatureId));
    } else {
      this.selectedCreature = null;
      localStorage.removeItem('bestiaryCreatureId');
    }
    
    this.scrollToMob();
  }

  scrollToMob(): void {
    setTimeout(() => {
      if (this.mobDetailContainer?.nativeElement) {
        this.mobDetailContainer.nativeElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start'
        });
      }
    }, 0);
  }
}