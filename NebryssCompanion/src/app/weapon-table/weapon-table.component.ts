import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter, HostListener, ViewChild, ElementRef } from '@angular/core';
import {MatTooltipModule} from '@angular/material/tooltip';

interface Weapon {
  id: number;
  name: string;
  profiles: WeaponProfile[];
}

interface WeaponProfile {
  profileName?: string;
  rng?: string;
  attacks: number;
  ws: string;
  damage: { min: number; max: number };
  specialRules: WeaponRule[];
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
    MatTooltipModule
  ],
  templateUrl: './weapon-table.component.html',
  styleUrls: ['./weapon-table.component.css']
})
export class WeaponTableComponent {
  @Input() weaponIds: number[] = [];
  @Input() weaponsData: { melee?: Weapon[]; ranged?: Weapon[] } = {};
  @Input() weaponRulesData: RuleDefinition[] = [];
  
  // Remove all tooltip-related properties and methods
  
  getWeaponById(id: number): Weapon | null {
    const allWeapons = [...(this.weaponsData.melee || []), ...(this.weaponsData.ranged || [])];
    return allWeapons.find(w => w.id === id) || null;
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
    
    if (rule.modValue !== null && rule.modValue !== undefined) {
      name = name.replace(/<x>/g, rule.modValue.toString());
      name = name.replace(/[x][+]/g, rule.modValue.toString() + "+");
      name = name.replace(/[ ][x]/g, rule.modValue.toString());
      description = description.replace(/<x>/g, " " + rule.modValue.toString());
    }

    return { name, description };
  }
}