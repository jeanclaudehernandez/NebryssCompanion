// bestiary.component.ts
import { Component, ElementRef, OnInit, OnDestroy, OnChanges, SimpleChanges, ViewChild, ViewEncapsulation, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../data.service';
import { AdminService } from '../admin.service';
import { PlayerDetailComponent } from '../player-detail/player-detail.component';
import { FormsModule } from '@angular/forms';
import { AlteredState, BestiaryEntry, Items, Weapon, WeaponRule, ScrollSection, NPC } from '../model';
import { ThemeService } from '../theme.service';
import { Subscription } from 'rxjs';
import { ScrollNavComponent } from '../scroll-nav/scroll-nav.component';
import { BestiaryMaterialsService } from './bestiary-materials.service';

@Component({
  selector: 'app-bestiary',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PlayerDetailComponent,
    ScrollNavComponent
  ],
  templateUrl: './bestiary.component.html',
  styleUrls: ['./bestiary.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class BestiaryComponent implements OnInit, OnDestroy, OnChanges {
  @ViewChild('mobDetailContainer') mobDetailContainer!: ElementRef;
  @Input() initialBestiaryId: number | null = null;
  @Output() navigateToNpc = new EventEmitter<{ npcId?: number; npcName?: string }>();

  bestiary: BestiaryEntry[] = [];
  npcs: NPC[] = [];
  isAdmin: boolean = false;
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
  combinedScrollSections: ScrollSection[] = [];
  
  // Materials Sidebar properties
  droppedMaterials: any[] = [];
  showMaterialsSidebar: boolean = false;

  constructor(
    private dataService: DataService,
    private adminService: AdminService,
    private themeService: ThemeService,
    private bestiaryMaterialsService: BestiaryMaterialsService
  ) {}

  ngOnInit() {
    this.themeSubscription = this.adminService.isAdmin$.subscribe(isAdmin => {
      this.isAdmin = isAdmin;
    });

    this.themeSubscription.add(
      this.themeService.darkMode$.subscribe(isDark => {
        this.isDarkMode = isDark;
      })
    );

    this.themeSubscription.add(
      this.bestiaryMaterialsService.open$.subscribe(isOpen => {
        this.showMaterialsSidebar = isOpen;
      })
    );
    
    this.dataService.getAllData().subscribe(response => {
      this.bestiary = response.bestiary;
      this.npcs = response.npcs || [];
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
        this.syncCreatureScrollSections();
        
        if (this.selectedCreatures.length > 0) {
          this.scrollToMob();
        }
        
        this.updateDroppedMaterials();
      }

      if (this.initialBestiaryId) {
        this.selectAndScrollToCreature(this.initialBestiaryId);
      }
    });

    this.dataService.bestiary$?.subscribe(bestiary => {
      if (bestiary && bestiary.length > 0) {
        this.bestiary = bestiary;
        this.applyFilters();
      }
    });

    this.dataService.weapons$?.subscribe(weapons => {
      if (weapons && weapons.length > 0) {
        this.weaponsData = [...weapons];
      }
    });

    this.dataService.items$?.subscribe(items => {
      if (items && items.items) {
        this.itemsData = { ...items };
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialBestiaryId'] && this.initialBestiaryId && this.bestiary.length > 0) {
      this.selectAndScrollToCreature(this.initialBestiaryId);
    }
  }

  ngOnDestroy() {
    this.themeSubscription.unsubscribe();
    this.bestiaryMaterialsService.reset();
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
          this.syncCreatureScrollSections();
          // Save to local storage
          const creatureIds = this.selectedCreatures.map(c => c.id);
          localStorage.setItem('bestiaryCreatureIds', JSON.stringify(creatureIds));
        }
      }
      
      // Reset selection
      this.selectedCreatureId = null;
    }
    
    this.updateDroppedMaterials();
    this.scrollToMob();
  }

  selectAndScrollToCreature(bestiaryId: number): void {
    if (!bestiaryId) return;
    const creature = this.bestiary.find(c => c.id === Number(bestiaryId));
    if (!creature) return;

    const alreadySelected = this.selectedCreatures.some(c => c.id === creature.id);
    if (!alreadySelected) {
      this.selectedCreatures.push(creature);
      const creatureIds = this.selectedCreatures.map(c => c.id);
      localStorage.setItem('bestiaryCreatureIds', JSON.stringify(creatureIds));
    }

    this.syncCreatureScrollSections();
    this.updateDroppedMaterials();
    this.scrollToMob(creature.id);
  }

  getNpcForCreature(creatureId: number): NPC | undefined {
    const npc = this.npcs.find(n => n.bestiaryId === creatureId);
    if (!npc) return undefined;
    if (this.isAdmin || npc.discovered !== false) {
      return npc;
    }
    return undefined;
  }

  goToNpc(npc: NPC): void {
    this.navigateToNpc.emit({ npcId: npc.id, npcName: npc.name });
  }

  removeCreature(creature: BestiaryEntry) {
    this.selectedCreatures = this.selectedCreatures.filter(c => c.id !== creature.id);
    this.syncCreatureScrollSections();
    
    // Update local storage
    if (this.selectedCreatures.length) {
      const creatureIds = this.selectedCreatures.map(c => c.id);
      localStorage.setItem('bestiaryCreatureIds', JSON.stringify(creatureIds));
    } else {
      localStorage.removeItem('bestiaryCreatureIds');
    }

    this.updateDroppedMaterials();
  }

  scrollToMob(creatureId?: number): void {
    setTimeout(() => {
      if (creatureId) {
        const el = document.getElementById(`creature-${creatureId}`);
        if (el) {
          el.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start'
          });
          return;
        }
      }
      if (this.mobDetailContainer?.nativeElement) {
        this.mobDetailContainer.nativeElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start'
        });
      }
    }, 100);
  }

  private syncCreatureScrollSections(): void {
    this.combinedScrollSections = this.selectedCreatures.map(creature => ({
      title: creature.name,
      id: `creature-${creature.id}`
    }));
  }

  updateDroppedMaterials() {
    if (!this.selectedCreatures || !this.itemsData || !this.itemsData.items) {
      this.droppedMaterials = [];
      this.showMaterialsSidebar = false;
      this.bestiaryMaterialsService.setCount(0);
      return;
    }

    const creatureIds = this.selectedCreatures.map(c => c.id);
    
    this.droppedMaterials = this.itemsData.items.filter(item => 
      item.type === 'material' && 
      item.bestiaryId && 
      creatureIds.includes(item.bestiaryId)
    );

    this.bestiaryMaterialsService.setCount(this.droppedMaterials.length);

    // If no materials, hide sidebar
    if (this.droppedMaterials.length === 0) {
      this.showMaterialsSidebar = false;
    }
  }

  toggleMaterialsSidebar() {
    this.bestiaryMaterialsService.toggle();
  }
  
  getCreatureName(bestiaryId: number): string {
    const creature = this.bestiary.find(c => c.id === bestiaryId);
    return creature ? creature.name : 'Unknown Creature';
  }
}
