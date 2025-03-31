import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-generic-table',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="table-container">
      <h3>{{ title }}</h3>
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
  `,
  styleUrls: ['./generic-table.component.css']
})
export class GenericTableComponent {
  @Input() data: any[] = [];
  @Input() headers: string[] = [];
  @Input() headerKeys: string[] = [];
  @Input() title: string = '';
}