import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../data.service';
import { GenericTableComponent } from '../generic-table/generic-table.component';
import { MistEffect } from '../model';

@Component({
  selector: 'app-mist-effects',
  standalone: true,
  imports: [CommonModule, GenericTableComponent],
  template: `
    <div class="mist-effects-container">
      <h1>Mist Effects</h1>
      <p>
        Effects that can happen when operatives enter mist zones of different density.
      </p>
      
      <app-generic-table 
        [storageKey]="'mist-effects-table'"
        [title]="'Mist Effects'"
        [data]="mistEffects"
        [headers]="['Effect Name', 'Density Level', 'Description']"
        [headerKeys]="['effectName', 'densityLevel', 'description']"
        [inventoryManagement]="false"
        [renderHtml]="['description']">
      </app-generic-table>
    </div>
  `,
  styles: [`
    .mist-effects-container {
      padding: 20px;
      max-width: 1200px;
      margin: 0 auto;
    }
    
    h1 {
      color: #333;
      margin-bottom: 20px;
    }
    
    p {
      margin-bottom: 30px;
      color: #666;
    }
  `]
})
export class MistEffectsComponent implements OnInit {
  mistEffects: MistEffect[] = [];

  constructor(private dataService: DataService) {}

  ngOnInit() {
    this.dataService.getMistEffects().subscribe(effects => {
      this.mistEffects = effects;
    });
  }
} 