import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'app-generic-table',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="table-container">
      <h3 (click)="toggleCollapse()" style="cursor: pointer;">
        {{ title }} <span>{{ isCollapsed ? '▶' : '▼' }}</span>
      </h3>
      <div *ngIf="!isCollapsed">
        <table class="items-table">
          <thead>
            <tr>
              <th *ngFor="let header of headers">{{ header }}</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let item of data">
              <td *ngFor="let header of headerKeys">
                {{ item[header] }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
  styleUrls: ['./generic-table.component.css']
})
export class GenericTableComponent implements OnInit {
  @Input() data: any[] = [];
  @Input() headers: string[] = [];
  @Input() headerKeys: string[] = [];
  @Input() title: string = '';
  @Input() storageKey!: string;
  
  isCollapsed = true;

  ngOnInit() {
    const savedState = localStorage.getItem(this.storageKey);
    this.isCollapsed = savedState ? JSON.parse(savedState) : true;
  }

  toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;
    localStorage.setItem(this.storageKey, JSON.stringify(this.isCollapsed));
  }
}