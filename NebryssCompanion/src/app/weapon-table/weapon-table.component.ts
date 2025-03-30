import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter, HostListener, ViewChild, ElementRef } from '@angular/core';
import { WeaponDisplayComponent } from '../weapon-display/weapon-display.component';

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
    WeaponDisplayComponent,
  ],
  templateUrl: './weapon-table.component.html',
  styleUrls: ['./weapon-table.component.css']
})
export class WeaponTableComponent {
  @Input() weaponIds: number[] = [];
  @Input() weaponsData: { melee?: Weapon[]; ranged?: Weapon[] } = {};
  @Input() weaponRulesData: RuleDefinition[] = [];
  
  @Output() tooltipShow = new EventEmitter<{event: MouseEvent, description: string}>();
  @Output() tooltipHide = new EventEmitter<void>();

  @ViewChild('tooltip') tooltip!: ElementRef;
  
  activeTooltip: string | null = null;
  tooltipPosition = { x: 0, y: 0 };
  currentHoverElement?: HTMLElement;

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
      name = name.replace(/x/g, rule.modValue.toString());
      description = description.replace(/x/g, rule.modValue.toString());
    }

    return { name, description };
  }

  onRuleHover(event: MouseEvent, rule: WeaponRule): void {
    this.tooltipShow.emit({
      event,
      description: this.getRuleDisplay(rule).description
    });
  }

  onRuleLeave(): void {
    this.tooltipHide.emit();
  }

  showTooltip(event: MouseEvent, description: string, element: HTMLElement): void {
    this.activeTooltip = description;
    this.currentHoverElement = element;
    this.updateTooltipPosition();
  }

  hideTooltip(): void {
    this.activeTooltip = null;
  }

  private updateTooltipPosition(): void {
    if (!this.currentHoverElement || !this.tooltip) return;
    
    const hoverRect = this.currentHoverElement.getBoundingClientRect();
    const tooltipHeight = this.tooltip.nativeElement.offsetHeight;
    const offset = 5;
  
    this.tooltipPosition = {
      x: hoverRect.left, // Left-align with text
      y: hoverRect.top - tooltipHeight - offset
    };
  }  
}