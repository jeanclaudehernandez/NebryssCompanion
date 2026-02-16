import { Component, Input, OnInit, OnChanges, SimpleChanges, ViewEncapsulation, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../data.service';
import { AlteredState } from '../model';
import { GenericTableComponent } from '../generic-table/generic-table.component';

@Component({
  selector: 'app-altered-states-page',
  standalone: true,
  imports: [CommonModule, GenericTableComponent],
  template: `
    <div class="altered-states-page">
      <h2>Altered States</h2>
      <app-generic-table
        [title]="'Altered States'"
        [data]="alteredStates"
        [headers]="tableHeaders"
        [headerKeys]="tableHeaderKeys"
        [renderHtml]="['effect']"
        [storageKey]="'altered-states-table'"
        [highlightInventory]="false">
      </app-generic-table>
    </div>
  `,
  styleUrls: ['./altered-states-page.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class AlteredStatesPageComponent implements OnInit, OnChanges {
  @Input() initialStateName: string | null = null;

  alteredStates: AlteredState[] = [];

  tableHeaders = ['Name', 'Effect'];
  tableHeaderKeys = ['name', 'effect'];

  constructor(private dataService: DataService, private elementRef: ElementRef) {}

  ngOnInit() {
    this.dataService.getAlteredStates().subscribe(states => {
      this.alteredStates = states;
      if (this.initialStateName) {
        setTimeout(() => this.scrollToState(this.initialStateName!), 100);
      }
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['initialStateName'] && this.initialStateName) {
      this.scrollToState(this.initialStateName);
    }
  }

  scrollToState(stateName: string) {
    setTimeout(() => {
      const rows = this.elementRef.nativeElement.querySelectorAll('tbody tr');
      for (let i = 0; i < rows.length; i++) {
        const firstCell = rows[i].querySelector('td');
        if (firstCell && firstCell.textContent.trim() === stateName) {
          rows[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
          rows[i].classList.add('highlight-state');
          setTimeout(() => rows[i].classList.remove('highlight-state'), 2000);
          break;
        }
      }
    }, 200);
  }
}

