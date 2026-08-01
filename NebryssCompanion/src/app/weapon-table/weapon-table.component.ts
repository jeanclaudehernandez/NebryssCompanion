import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter, SimpleChanges, OnChanges, ViewEncapsulation, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { WeaponRangePipe } from '../weapon-range.pipe';
import { CustomDropdownComponent } from '../custom-dropdown/custom-dropdown.component';
import { MatDialog } from '@angular/material/dialog';
import { WeaponRuleDialogComponent } from '../weapon-rule/weapon-rule.component';
import { Weapon, WeaponProfile, SpecialRule, WeaponRule, AlteredState, TalentCategory, Talent, StatModification, Affliction } from '../model';
import { ActivePlayerService } from '../active-player.service';
import { ToastService } from '../toast.service';
import { DataService } from '../data.service';
import { Subscription } from 'rxjs';
import { getEffectiveTalentApplications } from '../talent-stacks';

import { SanitizeHtmlPipe } from '../sanitizeHtml.pipe';

interface ruleDisplay {
  name: string,
  description: string
}

@Component({
  selector: 'app-weapon-table',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTooltipModule,
    WeaponRangePipe,
    CustomDropdownComponent,
    SanitizeHtmlPipe
  ],
  templateUrl: './weapon-table.component.html',
  styleUrls: ['./weapon-table.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class WeaponTableComponent implements OnChanges, OnDestroy, OnInit {
  @Input() weaponIds: number[] = [];
  @Input() weaponsData: Weapon[] = [];
  @Input() weaponRulesData: WeaponRule[] = [];
  @Input() alteredStates: AlteredState[] = [];
  @Input() displayPrice: boolean = false;
  @Input() displayBody: boolean = false;
  @Input() isCharacterDisplayPage: boolean = false;
  @Input() characterBody: string[] = [];
  @Input() sortByRange: boolean = true;
  @Input() inventoryManagement: boolean = false;
  @Input() enableCloning: boolean = false;
  @Input() enableDeleting: boolean = false;
  @Input() enableEditing: boolean = false;
  @Input() shoppingMode: boolean = false;
  @Input() title: string = '';
  @Input() collapsible: boolean = false;
  @Input() isCollapsed: boolean = false;
  @Input() enableBodyFilter: boolean = false;

  @Output() clone = new EventEmitter<any>();
  @Output() delete = new EventEmitter<any>();
  @Output() edit = new EventEmitter<any>();
  @Output() addToCart = new EventEmitter<any>();
  @Output() toggleCollapse = new EventEmitter<void>();

  onToggleCollapse(): void {
    if (this.collapsible) {
      this.isCollapsed = !this.isCollapsed;
      this.toggleCollapse.emit();
    }
  }

  talentsData: TalentCategory[] = [];
  afflictionsData: Affliction[] = [];

  get showActions(): boolean {
    return this.inventoryManagement || this.enableCloning || this.enableDeleting || this.enableEditing || this.shoppingMode;
  }

  get totalColumns(): number {
    let cols = 5; // Name, Range, Attacks, WS/BS, Damage
    if (this.displayPrice) cols++;
    if (this.showActions) cols++;
    return cols;
  }

  hasRules(entry: { weapon: Weapon, profile: WeaponProfile }): boolean {
    return !!(entry.profile.specialRules?.length || this.attachedModDescriptions[entry.weapon.id]?.length);
  }

  getEntryRowCount(entry: { weapon: Weapon, profile: WeaponProfile }): number {
    let rows = 1;
    if (this.hasRules(entry)) rows++;
    if (this.displayBody) rows++;
    return rows;
  }

  sortedProfiles: { weapon: Weapon, profile: WeaponProfile }[] = [];
  attachedModDescriptions: { [weaponId: number]: string[] } = {};
  availableBodyTypes: string[] = [];
  selectedBodyType: string = '';
  private playerSubscription: Subscription | null = null;

  constructor(
    private dialog: MatDialog, 
    private activePlayerService: ActivePlayerService,
    private toastService: ToastService,
    private dataService: DataService
  ) {
    this.playerSubscription = this.activePlayerService.activePlayer$.subscribe(() => {
      this.updateAttachedMods();
      this.updateSortedProfiles();
    });
  }

  ngOnInit(): void {
    this.dataService.getItems().subscribe(() => {
      this.updateSortedProfiles();
    });

    this.dataService.getTalents().subscribe(talents => {
      this.talentsData = talents;
      this.updateSortedProfiles();
    });

    this.dataService.getAfflictions().subscribe(afflictions => {
      this.afflictionsData = afflictions;
      this.updateSortedProfiles();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['weaponsData'] || changes['characterBody']) {
      this.extractBodyTypes();
    }
    if (changes['weaponIds'] || changes['weaponsData'] || changes['sortByRange']) {
      this.updateSortedProfiles();
    }
    this.updateAttachedMods();
  }

  extractBodyTypes() {
    // If body filter is enabled and characterBody is provided (meaning there's an active player),
    // use the player's body types directly.
    if (this.enableBodyFilter && this.characterBody && this.characterBody.length > 0) {
      this.availableBodyTypes = [...this.characterBody].sort();
      return;
    }

    const types = new Set<string>();
    this.weaponsData.forEach(weapon => {
      weapon.profiles.forEach(profile => {
        if (profile.body) {
          types.add(profile.body);
        }
      });
    });
    this.availableBodyTypes = Array.from(types).sort();
  }

  onBodyTypeChange(selected: any) {
    this.selectedBodyType = selected;
    this.updateSortedProfiles();
  }

  formatBodyIcons(val: any): string {
    if (!val) return '-';
    const str = String(val).toLowerCase();
    let html = '';
    
    if (str.includes('universal')) {
      html += `<span class="body-icon-badge universal" title="Universal">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
      </span>`;
    }
    if (str.includes('human')) {
      html += `<span class="body-icon-badge human" title="Human">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
      </span>`;
    }
    if (str.includes('astartes')) {
      html += `<span class="body-icon-badge astartes" title="Astartes">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          <path d="M12 8v8M8 12h8"></path>
        </svg>
      </span>`;
    }

    return html ? `<div class="body-icons-container">${html}</div>` : String(val);
  }

  isInInventory(weaponId: number): boolean {
    const player = this.activePlayerService.activePlayer;
    if (!player || !player.weapons) return false;
    
    return player.weapons.includes(weaponId);
  }

  addToInventory(weaponId: number) {
    const player = this.activePlayerService.activePlayer;
    if (!player) return;
    
    // Initialize weapons array if it doesn't exist
    if (!player.weapons) {
      player.weapons = [];
    }
    
    // Check if weapon already exists in inventory
    if (!player.weapons.includes(weaponId)) {
      player.weapons.push(weaponId);
      this.activePlayerService.updateActivePlayer({ ...player });
      
      // Get weapon name
      const weapon = this.getWeaponById(weaponId);
      const weaponName = weapon ? weapon.name : 'Weapon';
      
      // Show success toast
      this.toastService.show(
        `Added ${weaponName} to inventory (1 in inventory)`, 
        'success'
      );
    }
  }
  
  removeFromInventory(weaponId: number) {
    const player = this.activePlayerService.activePlayer;
    if (!player || !player.weapons) return;
    
    // Find the weapon in the inventory
    const weaponIndex = player.weapons.indexOf(weaponId);
    
    if (weaponIndex >= 0) {
      // Get weapon name before removing
      const weapon = this.getWeaponById(weaponId);
      const weaponName = weapon ? weapon.name : 'Weapon';
      
      // Remove weapon from the player's weapons
      player.weapons.splice(weaponIndex, 1);
      
      this.activePlayerService.updateActivePlayer({ ...player });
      
      // Show error toast
      this.toastService.show(
        `Removed ${weaponName} from inventory (0 remaining)`, 
        'error'
      );
    }
  }

  onClone(weapon: any) {
    this.clone.emit(weapon);
  }

  onDelete(weapon: any) {
    this.delete.emit(weapon);
  }

  onAddToCart(weaponId: number) {
    this.addToCart.emit(weaponId);
  }

  onEdit(weapon: any) {
    this.edit.emit(weapon);
  }

  private updateSortedProfiles(): void {
    const allProfiles: { weapon: Weapon, profile: WeaponProfile }[] = [];
    
    // Get active modifiers (talents + afflictions)
    const player = this.activePlayerService.activePlayer;
    const activeModifiers: { statModifications?: StatModification[] }[] = [];
    
    if (player && player.progression) {
      if (this.talentsData.length > 0) {
        activeModifiers.push(
          ...getEffectiveTalentApplications(
            player,
            itemId => this.dataService.getItemById(itemId),
            talentId => this.dataService.getTalentById(talentId)
          )
        );
      }
      
      // Afflictions
      if (player.progression.afflictions) {
        player.progression.afflictions.forEach(playerAffliction => {
           // Find the definition in afflictionsData to ensure we have the latest statModifications
           const definition = this.afflictionsData.find(a => a.id === playerAffliction.id);
           if (definition) {
              activeModifiers.push(definition);
           } else {
              // Fallback to player's copy if definition not found (though unlikely if data is synced)
              activeModifiers.push(playerAffliction);
           }
        });
      }
    }
    
    // Collect all profiles
    this.weaponIds.forEach(weaponId => {
      const weapon = this.getWeaponById(weaponId);
      if (weapon) {
        weapon.profiles.forEach(profile => {
          if (this.enableBodyFilter && this.selectedBodyType && profile.body !== this.selectedBodyType) {
            return;
          }
          
          const modifiedProfile = this.applyStatModifications(profile, activeModifiers);
          allProfiles.push({ weapon, profile: modifiedProfile });
        });
      }
    });

    // Sort if enabled
    this.sortedProfiles = this.sortByRange 
      ? this.sortProfiles(allProfiles)
      : allProfiles;
  }

  private applyStatModifications(profile: WeaponProfile, activeModifiers: { statModifications?: StatModification[] }[]): WeaponProfile {
    if (activeModifiers.length === 0) {
      return profile;
    }

    // Clone profile
    const modifiedProfile: WeaponProfile = JSON.parse(JSON.stringify(profile));

    // Apply modifications
    activeModifiers.forEach(source => {
      if (source.statModifications) {
        source.statModifications.forEach(mod => {
          let applies = false;
          
          if (!mod.applyToType) {
             applies = true;
          } else if (mod.applyToType === 'body') {
             if (mod.applyToValue && modifiedProfile.body && modifiedProfile.body.toLowerCase() === mod.applyToValue.toLowerCase()) {
               applies = true;
             }
          } else if (mod.applyToType === 'type') {
             if (mod.applyToValue && modifiedProfile.type && modifiedProfile.type.toLowerCase() === mod.applyToValue.toLowerCase()) {
               applies = true;
             }
          } else if (mod.applyToType === 'range' && mod.applyToValue !== undefined && mod.applyToValue !== null) {
             const val = String(mod.applyToValue);
             const rng = modifiedProfile.rng;

             if (val === '0') {
                if (rng === 0) applies = true;
             } else if (val === '-') {
                if (rng === null || rng > 0) applies = true;
             } else {
                const threshold = parseInt(val);
                if (!isNaN(threshold) && threshold > 0) {
                   if (rng === null) {
                      applies = true;
                   } else {
                      if (rng <= threshold) applies = true;
                   }
                }
             }
          }

          if (applies) {
            if (mod.stat === 'hit') {
               modifiedProfile.ws += (mod.mod * -1);
            } else if (mod.stat === 'attacks') {
               modifiedProfile.attacks += mod.mod;
            } else if (mod.stat === 'damage') {
               modifiedProfile.damage.min += mod.mod;
               modifiedProfile.damage.max += mod.mod;
            } else if (mod.stat === 'crit') {
               modifiedProfile.damage.max += mod.mod;
            }
          }
        });
      }
    });

    return modifiedProfile;
  }

  private sortProfiles(profiles: { weapon: Weapon, profile: WeaponProfile }[]): {weapon: Weapon, profile: WeaponProfile}[] {
    const player = this.activePlayerService.activePlayer;
    const ownedWeaponIds = player && player.weapons ? player.weapons : [];

    return [...profiles].sort((a, b) => {
      const aOwned = ownedWeaponIds.includes(a.weapon.id) ? 1 : 0;
      const bOwned = ownedWeaponIds.includes(b.weapon.id) ? 1 : 0;
      if (aOwned !== bOwned) {
        return bOwned - aOwned;
      }

      const aMelee = a.profile.rng === 0 ? 1 : 0;
      const bMelee = b.profile.rng === 0 ? 1 : 0;
      if (aMelee !== bMelee) {
        return bMelee - aMelee;
      }

      const aName = a.weapon.name || '';
      const bName = b.weapon.name || '';
      return aName.localeCompare(bName, undefined, { sensitivity: 'base' });
    });
  }
  
  getWeaponById(id: number): Weapon | null {
    return this.weaponsData.find(w => w.id === id) || null;
  }

  filterByBody(weaponProfile: any): boolean {
    return !!this.characterBody.filter((body) => body == weaponProfile.body).length;
  }

  getRuleDisplay(rule: SpecialRule): ruleDisplay {
    const ruleDef = this.weaponRulesData.find(r => r.id === rule.ruleId);
    if (!ruleDef) {
      return {
        name: 'Unknown Rule',
        description: 'Rule definition not found'
      };
    }
  
    let name = ruleDef.name;
    let description = ruleDef.effect;
    
    // Replace modValue in name and description
    if (rule.modValue !== null && rule.modValue !== undefined) {
      name = name.replace(/<x>/g, rule.modValue.toString());
      name = name.replace(/[x][+]/g, rule.modValue.toString() + "+");
      name = name.replace(/[ ][x]/g, rule.modValue.toString());
      description = description.replace(/<x>/g, " " + rule.modValue.toString());
    }
  
    const statusMatches = [...new Set(description.match(/\/status\/:\d+\//g))];
    const statusEntries: string[] = [];
  
    if (statusMatches) {
      statusMatches.forEach(match => {
        const statusId = parseInt(match.replace('/status/:', '').replace('/', ''));
        const status = this.alteredStates.find(s => s.id === statusId);
        
        if (status) {
          const link = `<span class="status-link" data-status="${status.name}">${status.name}</span>`;
          description = description.replace(new RegExp(match, 'g'), link);
          statusEntries.push(`<strong><span class="status-link" data-status="${status.name}">${status.name}</span></strong>: ${status.effect}`);
        }
      });
    }
  
    // Append status descriptions if any were found
    if (statusEntries.length > 0) {
      description += '\n\n' + statusEntries.map(entry => 
        `<em>${entry}</em>`
      ).join('\n\n');
    }
  
    return { name, description };
  }

  showRuleDetails(ruleDisplay: ruleDisplay) {
    const dialogRef = this.dialog.open(WeaponRuleDialogComponent, {
      data: {rule: ruleDisplay},
      panelClass: 'image-dialog-container',
      hasBackdrop: true,
      backdropClass: 'image-dialog-backdrop', // Optional: custom backdrop class
      disableClose: true // Allow closing by clicking outside});
    });
    setTimeout(() => {
      dialogRef.disableClose = false;
  }, 0);
  }

  private updateAttachedMods(): void {
    const player = this.activePlayerService.activePlayer;
    if (!player || !player.items || player.items.length === 0) {
      this.attachedModDescriptions = {};
      return;
    }
    const map: { [weaponId: number]: string[] } = {};
    player.items.forEach(inventoryItem => {
      const attachedTo = (inventoryItem as any).attachedTo;
      if (!attachedTo) {
        return;
      }
      const item = this.dataService.getItemById(inventoryItem.id);
      if (!item || item.type !== 'modification') {
        return;
      }
      const description = item.description || '';
      if (!map[attachedTo]) {
        map[attachedTo] = [];
      }
      map[attachedTo].push(description);
    });
    this.attachedModDescriptions = map;
  }

  processModDescription(text: string): string {
    if (!text) return '';
    const regex = /\/weaponRule\/:(\d+)\//g;
    return text.replace(regex, (match: string, idStr: string) => {
      const id = parseInt(idStr, 10);
      const rule = this.weaponRulesData.find(r => r.id === id);
      if (!rule) return match;
      return rule.name;
    });
  }

  ngOnDestroy(): void {
    if (this.playerSubscription) {
      this.playerSubscription.unsubscribe();
    }
  }
}
