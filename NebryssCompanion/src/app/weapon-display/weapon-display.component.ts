import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-weapon-display',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './weapon-display.component.html',
  styleUrls: ['./weapon-display.component.css']
})
export class WeaponDisplayComponent implements OnInit {
  @Input() weaponId!: number;
  @Input() weaponsData: any;
  @Input() weaponRulesData: any[] = [];
  
  weapon: any;
  profiles: any[] = [];

  ngOnInit(): void {
    if (this.weaponsData) {
      this.weapon = this.getWeaponById(this.weaponId, this.weaponsData);
      if (this.weapon) {
        this.profiles = this.weapon.profiles || [];
      }
    }
  }

  private getWeaponById(id: number, weapons: any): any {
    const allWeapons = [...(weapons.melee || []), ...(weapons.ranged || [])];
    return allWeapons.find(w => w.id === id) || null;
  }

  getRuleDisplay(rule: any): { name: string, description: string } {
    const ruleDef = this.weaponRulesData.find(r => r.id === rule.ruleId);
    if (!ruleDef) {
      return {
        name: 'Unknown Rule',
        description: 'Rule definition not found'
      };
    }

    // Replace x with modValue if present
    let name = ruleDef.name;
    let description = ruleDef.effect;
    
    if (rule.modValue !== null && rule.modValue !== undefined) {
      name = name.replace(/x/g, rule.modValue);
      description = description.replace(/x/g, rule.modValue);
    }

    return {
      name,
      description
    };
  }
}