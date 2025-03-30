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
  activeTooltip: string | null = null;
  tooltipX = 0;
  tooltipY = 0;

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

  
  showTooltip(event: MouseEvent, description: string): void {
    this.activeTooltip = description;
    
    // Let CSS handle the positioning
    const tooltip = document.querySelector('.custom-tooltip') as HTMLElement;
    if (tooltip) {
      tooltip.style.left = `${event.clientX}px`;
      tooltip.style.top = `${event.clientY - 40}px`;
    }
  }

  hideTooltip(): void {
    this.activeTooltip = null;
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
      name = name.replace(/<x>/g, rule.modValue);
      description = description.replace(/<x>/g, rule.modValue);
    }

    return {
      name,
      description
    };
  }
}