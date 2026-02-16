import { Component, Input, OnInit, OnChanges, SimpleChanges, ViewEncapsulation, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../data.service';
import { WeaponRule, AlteredState } from '../model';
import { GenericTableComponent } from '../generic-table/generic-table.component';

@Component({
  selector: 'app-weapon-rules-page',
  standalone: true,
  imports: [CommonModule, GenericTableComponent],
  templateUrl: './weapon-rules-page.component.html',
  styleUrls: ['./weapon-rules-page.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class WeaponRulesPageComponent implements OnInit, OnChanges {
  @Input() initialRuleName: string | null = null;

  weaponRules: WeaponRule[] = [];
  alteredStates: AlteredState[] = [];
  
  tableHeaders = ['Name', 'Effect'];
  tableHeaderKeys = ['name', 'effect'];

  constructor(private dataService: DataService, private elementRef: ElementRef) {
  }

  ngOnInit() {
    this.dataService.getAllData().subscribe(data => {
      this.alteredStates = data.alteredStates;
      this.weaponRules = data.weaponRules.map(rule => this.processWeaponRule(rule));
      if (this.initialRuleName) {
        setTimeout(() => this.scrollToRule(this.initialRuleName!), 100);
      }
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['initialRuleName'] && this.initialRuleName) {
      this.scrollToRule(this.initialRuleName);
    }
  }

  processWeaponRule(rule: WeaponRule): WeaponRule {
    const effect = this.processEffect(rule.effect);
    return {
      ...rule,
      effect
    };
  }

  processEffect(effect: string): string {
    if (!effect) return '';
    const statusMatches = [...new Set(effect.match(/\/status\/:\d+\//g))];
    if (!statusMatches || statusMatches.length === 0) return effect;
    let processedEffect = effect;
    statusMatches.forEach(match => {
      const statusId = parseInt(match.replace('/status/:', '').replace('/', ''));
      const status = this.alteredStates.find(s => s.id === statusId);
      if (status) {
        const link = `<span class="status-link" data-status="${status.name}">${status.name}</span>`;
        processedEffect = processedEffect.replace(new RegExp(match, 'g'), link);
      }
    });
    return processedEffect;
  }

  scrollToRule(ruleName: string) {
    // We need to find the element. Since generic-table renders it, we might need to query specifically.
    // However, generic-table might not expose IDs on rows.
    // I might need to implement a custom table here instead of using generic-table if generic-table doesn't support IDs.
    // Let's check generic-table. It doesn't seem to support IDs on rows based on my read.
    // But I can try to find by text content.
    
    // Actually, the user asked to use the dynamic table component (GenericTableComponent).
    // GenericTableComponent renders:
    // <tr *ngFor="let item of data" ...>
    //   <td ...>{{ item[header] }}...
    
    // I can search the DOM for the text.
    setTimeout(() => {
      const cells = this.elementRef.nativeElement.querySelectorAll('td');
      for (let i = 0; i < cells.length; i++) {
        if (cells[i].textContent.trim() === ruleName) {
          cells[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
          cells[i].parentElement.classList.add('highlight-rule');
          setTimeout(() => cells[i].parentElement.classList.remove('highlight-rule'), 2000);
          break;
        }
      }
    }, 200);
  }
}
