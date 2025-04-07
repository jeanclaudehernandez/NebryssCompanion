import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { ActivePlayerService } from '../active-player.service';
import { Inventory, Player } from '../model';
import { SanitizeHtmlPipe } from '../sanitizeHtml.pipe';

@Component({
  selector: 'app-generic-table',
  standalone: true,
  imports: [CommonModule, SanitizeHtmlPipe],
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
              <th *ngIf="inventoryManagement">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let item of data" [class.in-inventory]="isInInventory(item)">
              <td *ngFor="let header of headerKeys">
                <span *ngIf="!renderHtml?.includes(header)">{{ item[header] }}</span>
                <span *ngIf="renderHtml?.includes(header)" [innerHtml]="item[header] | sanitizeHtml"></span>
              </td>
              <td *ngIf="inventoryManagement">
                <div class="inventory-actions">
                  <button *ngIf="!isPlayerDetail" (click)="addToInventory(item)" class="btn-add">+</button>
                  <button (click)="removeFromInventory(item)" class="btn-remove">-</button>
                </div>
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
  @Input() inventoryManagement: boolean = false;
  @Input() isPlayerDetail: boolean = false;
  @Input() renderHtml?: string[];
  
  isCollapsed = true;

  constructor(private activePlayerService: ActivePlayerService) {}

  ngOnInit() {
    const savedState = localStorage.getItem(this.storageKey);
    this.isCollapsed = savedState ? JSON.parse(savedState) : true;
  }

  toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;
    localStorage.setItem(this.storageKey, JSON.stringify(this.isCollapsed));
  }

  isInInventory(item: any): boolean {
    const player = this.activePlayerService.activePlayer;
    if (!player || !player.items) return false;
    
    return player.items.some(inventoryItem => inventoryItem.id === item.id);
  }

  addToInventory(item: any) {
    const player = this.activePlayerService.activePlayer;
    if (!player) return;
    
    // Initialize items array if it doesn't exist
    if (!player.items) {
      player.items = [];
    }
    
    // Check if item already exists in inventory
    const existingItem = player.items.find((inventoryItem) => inventoryItem.id === item.id);
    
    if (existingItem) {
      // Increment quantity if item exists
      existingItem.quant += 1;
    } else {
      // Add new item with quantity 1
      player.items.push({
        id: item.id,
        quant: 1
      });
    }
    
    // Update the player
    this.activePlayerService.setActivePlayer({...player});
  }
  
  removeFromInventory(item: any) {
    const player = this.activePlayerService.activePlayer;
    if (!player || !player.items) return;
    
    // Find the item in the inventory
    const existingItemIndex = player.items.findIndex((inventoryItem) => inventoryItem.id === item.id);
    
    if (existingItemIndex >= 0) {
      const existingItem = player.items[existingItemIndex];
      
      if (existingItem.quant > 1) {
        // Decrement quantity if more than 1
        existingItem.quant -= 1;
      } else {
        // Remove item if quantity is 1
        player.items.splice(existingItemIndex, 1);
      }
      
      // Update the player
      this.activePlayerService.setActivePlayer({...player});
    }
  }
}