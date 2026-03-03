import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter, TemplateRef, SimpleChanges, OnChanges, ViewChild, ViewEncapsulation, OnDestroy } from '@angular/core';
import {MatTooltipModule} from '@angular/material/tooltip';
import { WeaponRangePipe } from '../weapon-range.pipe';
import { MatDialog } from '@angular/material/dialog';
import { WeaponRuleDialogComponent } from '../weapon-rule/weapon-rule.component';
import { Weapon, WeaponProfile, SpecialRule, WeaponRule, AlteredState } from '../model';
import { ActivePlayerService } from '../active-player.service';
import { ToastService } from '../toast.service';
import { DataService } from '../data.service';
import { Subscription } from 'rxjs';

interface ruleDisplay {
  name: string,
  description: string
}

@Component({
  selector: 'app-weapon-table',
  standalone: true,
  imports: [
    CommonModule,
    MatTooltipModule,
    WeaponRangePipe,
  ],
  templateUrl: './weapon-table.component.html',
  styleUrls: ['./weapon-table.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class WeaponTableComponent implements OnChanges, OnDestroy {
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

  @Output() clone = new EventEmitter<any>();
  @Output() delete = new EventEmitter<any>();
  @Output() edit = new EventEmitter<any>();
  @Output() addToCart = new EventEmitter<any>();

  sortedProfiles: { weapon: Weapon, profile: WeaponProfile }[] = [];
  attachedModDescriptions: { [weaponId: number]: string[] } = {};
  private playerSubscription: Subscription | null = null;

  constructor(
    private dialog: MatDialog, 
    private activePlayerService: ActivePlayerService,
    private toastService: ToastService,
    private dataService: DataService
  ) {
    this.playerSubscription = this.activePlayerService.activePlayer$.subscribe(() => {
      this.updateAttachedMods();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['weaponIds'] || changes['weaponsData'] || changes['sortByRange']) {
      this.updateSortedProfiles();
    }
    this.updateAttachedMods();
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
    
    // Collect all profiles
    this.weaponIds.forEach(weaponId => {
      const weapon = this.getWeaponById(weaponId);
      if (weapon) {
        weapon.profiles.forEach(profile => {
          allProfiles.push({ weapon, profile });
        });
      }
    });

    // Sort if enabled
    this.sortedProfiles = this.sortByRange 
      ? this.sortProfiles(allProfiles)
      : allProfiles;
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
