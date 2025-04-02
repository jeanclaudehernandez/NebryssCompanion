import { CommonModule } from '@angular/common';
import { Component, Input,TemplateRef, SimpleChanges, OnChanges, ViewChild } from '@angular/core';
import {MatTooltipModule} from '@angular/material/tooltip';
import { WeaponRangePipe } from '../weapon-range.pipe';
import { ModalService } from '../modal.service';
import { SanitizeHtmlPipe } from '../sanitizeHtml.pipe';
import { MatDialog } from '@angular/material/dialog';
import { WeaponRuleDialogComponent } from '../weapon-rule/weapon-rule.component';

interface Weapon {
  id: number;
  name: string;
  price: number;
  profiles: WeaponProfile[];
}

interface WeaponProfile {
  profileName?: string;
  rng: number | null;
  attacks: number;
  ws: string;
  damage: { min: number; max: number };
  specialRules: WeaponRule[];
  body: string;
}

interface WeaponRule {
  ruleId: number;
  modValue?: number;
}

interface RuleDefinition {
  id: number;
  name: string;
  effect: string;
}

@Component({
  selector: 'app-weapon-table',
  standalone: true,
  imports: [
    CommonModule,
    MatTooltipModule,
    WeaponRangePipe,
    SanitizeHtmlPipe,
    WeaponRuleDialogComponent
  ],
  templateUrl: './weapon-table.component.html',
  styleUrls: ['./weapon-table.component.css']
})
export class WeaponTableComponent implements OnChanges {
  @Input() weaponIds: number[] = [];
  @Input() weaponsData: Weapon[] = [];
  @Input() weaponRulesData: RuleDefinition[] = [];
  @Input() alteredStates: any[] = [];
  @Input() displayPrice: boolean = false;
  @Input() displayBody: boolean = false;
  @Input() isCharacterDisplayPage: boolean = false;
  @Input() characterBody: string[] = [];
  @Input() sortByRange: boolean = true;

  sortedProfiles: { weapon: Weapon, profile: WeaponProfile }[] = [];

  constructor(private dialog: MatDialog) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['weaponIds'] || changes['weaponsData'] || changes['sortByRange']) {
      this.updateSortedProfiles();
    }
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

  private sortProfiles(profiles: { weapon: Weapon, profile: WeaponProfile }[]) {
    return [...profiles].sort((a, b) => {
      const aRng = a.profile.rng;
      const bRng = b.profile.rng;

      // Melee (0) first
      if (aRng === 0 && bRng !== 0) return -1;
      if (bRng === 0 && aRng !== 0) return 1;

      // Numeric ranges (ascending)
      if (typeof aRng === 'number' && typeof bRng === 'number') {
        return aRng - bRng;
      }

      // Handle null/undefined ranges last
      if (aRng == null) return 1;
      if (bRng == null) return -1;

      return 0;
    });
  }
  
  getWeaponById(id: number): Weapon | null {
    return this.weaponsData.find(w => w.id === id) || null;
  }

  filterByBody(weaponProfile: any) {
    return !!this.characterBody.filter((body) => body == weaponProfile.body).length;
  }

  getRuleDisplay(rule: WeaponRule): { name: string, description: string } {
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
  
    // Find all status references (/number/) in the description
    const statusMatches = [...new Set(description.match(/\/\d+\//g))];
    const statusEntries: string[] = [];
  
    if (statusMatches) {
      statusMatches.forEach(match => {
        const statusId = parseInt(match.replace(/\//g, ''));
        const status = this.alteredStates.find(s => s.id === statusId);
        
        if (status) {
          // Replace the reference with status name
          description = description.replace(new RegExp(match, 'g'), status.name);
          
          // Add to status entries list
          statusEntries.push(`<strong>${status.name}</strong>: ${status.effect}`);
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

  showRuleDetails(ruleDisplay: { name: string; description: string }) {
    console.log(ruleDisplay)
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
}