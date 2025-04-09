// bestiary.component.ts
import { Component, ElementRef, OnInit, OnDestroy, ViewChild, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../data.service';
import { PlayerDetailComponent } from '../player-detail/player-detail.component';
import { FormsModule } from '@angular/forms';
import { AlteredState, BestiaryEntry, Items, Weapon, WeaponRule } from '../model';
import { ThemeService } from '../theme.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-bestiary',
  standalone: true,
  imports: [CommonModule, FormsModule, PlayerDetailComponent],
  templateUrl: './bestiary.component.html',
  styleUrls: ['./bestiary.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class BestiaryComponent implements OnInit, OnDestroy {
  @ViewChild('mobDetailContainer') mobDetailContainer!: ElementRef;
  bestiary: BestiaryEntry[] = [];
  selectedCreatureId: number | null = null;
  selectedCreature: BestiaryEntry | null = null;
  selectedCreatures: BestiaryEntry[] = [];
  factions: string[] = [];
  subgroups: string[] = [];
  selectedFaction: string | null = null;
  selectedSubGroup: string | null = null;
  filteredCreatures: BestiaryEntry[] = [];
  itemsData!: Items;
  weaponsData: Weapon[] = [];
  weaponRulesData: WeaponRule[] = [];
  alteredStates: AlteredState[] = [];
  isDarkMode: boolean = false;
  private themeSubscription: Subscription = new Subscription();

  constructor(
    private dataService: DataService,
    private themeService: ThemeService
  ) {}

  ngOnInit() {
    this.themeSubscription = this.themeService.darkMode$.subscribe(isDark => {
      this.isDarkMode = isDark;
    });
    
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
      const savedCreatureIds = localStorage.getItem('bestiaryCreatureIds');
      if (savedCreatureIds !== null) {
        const ids = JSON.parse(savedCreatureIds) as number[];
        this.selectedCreatures = ids.map(id => 
          this.bestiary.find(c => c.id === id)
        ).filter(c => c !== undefined) as BestiaryEntry[];
        
        if (this.selectedCreatures.length > 0) {
          this.scrollToMob();
        }
      }

      console.log(this.dataService.validateBestiaryPR().filter((creature) => creature.calculatedPR != creature.currentPR));
    });
  }

  ngOnDestroy() {
    this.themeSubscription.unsubscribe();
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
      const creature = this.bestiary.find(c => c.id === Number(this.selectedCreatureId)) || null;
      
      if (creature) {
        // Check if already selected
        const alreadySelected = this.selectedCreatures.some(c => c.id === creature.id);
        
        if (!alreadySelected) {
          this.selectedCreatures.push(creature);
          // Save to local storage
          const creatureIds = this.selectedCreatures.map(c => c.id);
          localStorage.setItem('bestiaryCreatureIds', JSON.stringify(creatureIds));
        }
      }
      
      // Reset selection
      this.selectedCreatureId = null;
    }
    
    this.scrollToMob();
  }

  removeCreature(creature: BestiaryEntry) {
    this.selectedCreatures = this.selectedCreatures.filter(c => c.id !== creature.id);
    
    // Update local storage
    if (this.selectedCreatures.length) {
      const creatureIds = this.selectedCreatures.map(c => c.id);
      localStorage.setItem('bestiaryCreatureIds', JSON.stringify(creatureIds));
    } else {
      localStorage.removeItem('bestiaryCreatureIds');
    }
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