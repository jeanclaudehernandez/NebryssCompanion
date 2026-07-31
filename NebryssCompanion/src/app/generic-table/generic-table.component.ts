import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, OnChanges, SimpleChanges, ViewEncapsulation, Output, EventEmitter } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivePlayerService } from '../active-player.service';
import { Inventory, Player } from '../model';
import { SanitizeHtmlPipe } from '../sanitizeHtml.pipe';
import { ToastService } from '../toast.service';
import { CustomDropdownComponent } from '../custom-dropdown/custom-dropdown.component';

@Component({
  selector: 'app-generic-table',
  standalone: true,
  imports: [CommonModule, SanitizeHtmlPipe, FormsModule, CustomDropdownComponent],
  template: `
    <div class="category-block">
      <div class="table-header" *ngIf="collapsible || title" (click)="collapsible ? toggleCollapse() : null" [style.cursor]="collapsible ? 'pointer' : 'default'">
         <h3 style="display: inline-block;">{{ title }} <span *ngIf="collapsible">{{ isCollapsed ? '▶' : '▼' }}</span></h3>
      </div>
      <div *ngIf="!isCollapsed || !collapsible" class="table-body-content">
        <div *ngIf="enableBodyFilter" class="filter-container">
          <label style="margin-bottom: 5px; font-size: 0.9em; display: block; font-weight: 600;">Filter by Body:</label>
          <app-custom-dropdown
              [options]="availableBodyTypes"
              [selectedOption]="selectedBodyType"
              [placeholder]="'All Body Types'"
              [showClearOption]="true"
              [type]="'simple'"
              (selectionChange)="onBodyTypeChange($event)">
          </app-custom-dropdown>
        </div>
        <div class="table-scroll-wrapper">
          <table class="items-table">
            <thead>
              <tr>
                <th 
                  *ngFor="let header of headers; let i = index"
                  (click)="onSort(headerKeys[i])"
                  class="sortable-header"
                  [class.col-compact]="isCompactColumn(headerKeys[i])"
                  [class.col-description]="isDescriptionColumn(headerKeys[i])"
                  [class.col-name]="headerKeys[i] === 'name'"
                  [style.width]="headerKeys[i] === 'name' ? nameColumnWidth : null"
                  [title]="getHeaderTooltip(header)">
                  {{ getShortHeader(header) }}
                  <span *ngIf="sortKey === headerKeys[i]">
                    {{ sortDirection === 'asc' ? '▲' : '▼' }}
                  </span>
                </th>
                <th class="col-actions" title="Actions" *ngIf="inventoryManagement || enableCloning || enableDeleting || enableEditing || enableCustomAdd || enableEquipping || enableUnequipping">Act</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of sortedData" [class.in-inventory]="highlightInventory && isInInventory(item)">
                <td 
                  *ngFor="let header of headerKeys"
                  [class.col-compact]="isCompactColumn(header)"
                  [class.col-description]="isDescriptionColumn(header)"
                  [class.col-name]="header === 'name'"
                  [style.width]="header === 'name' ? nameColumnWidth : null">
                  <ng-container *ngIf="header === 'name'">
                    <div class="name-wrapper" [style.max-width]="nameColumnWidth" [style.width]="nameColumnWidth">
                      <span *ngIf="!renderHtml?.includes('name')">{{ item[header] }}</span>
                      <span *ngIf="renderHtml?.includes('name')" [innerHtml]="item[header] | sanitizeHtml"></span>
                    </div>
                  </ng-container>
                  <ng-container *ngIf="header !== 'name'">
                    <span *ngIf="!renderHtml?.includes(header) && header !== 'price'">{{ item[header] }}</span>
                    <span *ngIf="!renderHtml?.includes(header) && header === 'price'">{{ item[header] ? item[header] + '₥' : '' }}</span>
                    <span *ngIf="renderHtml?.includes(header)" [innerHtml]="item[header] | sanitizeHtml"></span>
                  </ng-container>
                </td>
                <td class="col-actions" *ngIf="inventoryManagement || enableCloning || enableDeleting || enableEditing || enableCustomAdd || enableEquipping || enableUnequipping">
                  <div class="inventory-actions">
                    <button *ngIf="enableEquipping && item.isEquippable" (click)="onEquip(item)" class="btn-equip" title="Equip Item">
                      <span class="icon">👕</span>
                    </button>
                    <button *ngIf="enableUnequipping" (click)="onUnequip(item)" class="btn-unequip" title="Unequip Item">
                      <div class="icon-container">
                        <span class="icon-layer-base">👕</span>
                        <span class="icon-layer-overlay">❌</span>
                      </div>
                    </button>
                    <button *ngIf="enableCustomAdd" (click)="onCustomAdd(item)" class="btn-add" title="Add to Player">
                      <span class="icon">+</span>
                    </button>
                    <button *ngIf="enableEditing" (click)="onEdit(item)" class="btn-edit" title="Edit Item">
                      <span class="icon">✏️</span>
                    </button>
                    <button *ngIf="enableCloning" (click)="onClone(item)" class="btn-clone" title="Clone Item">
                      <span class="icon">❐</span>
                    </button>
                    <button *ngIf="enableDeleting" (click)="onDelete(item)" class="btn-delete" title="Delete Item">
                      <span class="icon">🗑️</span>
                    </button>
                    <ng-container *ngIf="inventoryManagement">
                      <button *ngIf="item.canCraft" (click)="onCraft(item)" class="btn-craft" title="Craft Item">
                        <i class="icon-wrench">🔧</i>
                      </button>
                      <button *ngIf="shoppingMode" (click)="onAddToCart(item)" class="btn-cart" title="Add to Cart">
                        <span class="icon">🛒</span>
                      </button>
                      <button *ngIf="!shoppingMode" (click)="addToInventory(item)" class="btn-add">+</button>
                      <button *ngIf="!shoppingMode" (click)="removeFromInventory(item)" class="btn-remove">-</button>
                    </ng-container>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./generic-table.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class GenericTableComponent implements OnInit, OnChanges {
  @Input() data: any[] = [];
  @Input() headers: string[] = [];
  @Input() headerKeys: string[] = [];
  @Input() title: string = '';
  @Input() storageKey!: string;
  @Input() inventoryManagement: boolean = false;
  @Input() isPlayerDetail: boolean = false;
  @Input() renderHtml?: string[];
  @Input() highlightInventory: boolean = true;
  @Input() enableCloning: boolean = false;
  @Input() enableDeleting: boolean = false;
  @Input() enableEditing: boolean = false;
  @Input() enableCustomAdd: boolean = false;
  @Input() shoppingMode: boolean = false;
  @Input() collapsible: boolean = true;
  @Input() enableEquipping: boolean = false;
  @Input() enableUnequipping: boolean = false;
  @Input() characterBody: string[] = [];
  @Input() enableBodyFilter: boolean = false;
  @Input() nameColumnWidth: string = '95px';

  @Output() craft = new EventEmitter<any>();
  @Output() clone = new EventEmitter<any>();
  @Output() delete = new EventEmitter<any>();
  @Output() edit = new EventEmitter<any>();
  @Output() customAdd = new EventEmitter<any>();
  @Output() addToCart = new EventEmitter<any>();
  @Output() equip = new EventEmitter<any>();
  @Output() unequip = new EventEmitter<any>();
  
  isCollapsed = true;
  sortedData: any[] = [];
  sortKey: string | null = null;
  sortDirection: 'asc' | 'desc' = 'asc';
  
  availableBodyTypes: string[] = [];
  selectedBodyType: string | null = null;

  getShortHeader(header: string): string {
    if (!header) return '';
    const h = header.toLowerCase().trim();
    switch (h) {
      case 'price': return 'Price';
      case 'quantity': return 'Qty';
      case 'weight': return 'Wt';
      case 'optimal conditions': return 'Opt. Cond.';
      case 'max speed': return 'Spd';
      case 'max weight': return 'Max Wt';
      case 'ship wounds': return 'WND';
      case 'defense': return 'DEF';
      case 'max cargo': return 'Cargo';
      case 'ammo type': return 'Ammo';
      case 'damage': return 'Dmg';
      case 'dropped from': return 'Drop';
      case 'density level': return 'Lvl';
      case 'treatment': return 'Treat';
      case 'to heal': return 'Heal';
      case 'subtype': return 'Subtype';
      default: return header;
    }
  }

  getHeaderTooltip(header: string): string {
    return header;
  }

  isCompactColumn(key: string): boolean {
    return ['price', 'quantity', 'quant', 'qty', 'weight', 'maxSpeed', 'maxWeight', 'shipWounds', 'defense', 'maxCargo', 'ammoType', 'damage', 'part', 'raceReq', 'subType', 'bestiaryId', 'type', 'densityLevel'].includes(key);
  }

  isDescriptionColumn(key: string): boolean {
    return ['description', 'effect', 'optimalConditions', 'treatment'].includes(key);
  }

  constructor(
    private activePlayerService: ActivePlayerService,
    private toastService: ToastService
  ) {}

  ngOnInit() {
    const savedState = localStorage.getItem(this.storageKey);
    this.isCollapsed = savedState ? JSON.parse(savedState) : true;
    this.extractBodyTypes();
    this.initializeSortedData();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['data'] || changes['headerKeys'] || changes['characterBody']) {
      this.extractBodyTypes();
      this.initializeSortedData();
    }
  }

  extractBodyTypes() {
    if (!this.enableBodyFilter) return;

    if (this.characterBody && this.characterBody.length > 0) {
      // Filter out invalid entries just in case
      const validBodyTypes = this.characterBody.filter(b => b && b.trim() !== '');
      if (validBodyTypes.length > 0) {
        this.availableBodyTypes = [...validBodyTypes].sort();
        return;
      }
    }

    const types = new Set<string>();
    (this.data || []).forEach(item => {
      // Check for body (weapons/other)
      if (item.body) {
         if (Array.isArray(item.body)) {
             item.body.forEach((b: string) => types.add(b));
         } else {
             types.add(item.body);
         }
      }
      // Check for raceReq (items/armor)
      if (item.raceReq) {
         if (Array.isArray(item.raceReq)) {
             item.raceReq.forEach((b: string) => types.add(b));
         } else {
             types.add(item.raceReq);
         }
      }
    });
    const validTypes = Array.from(types).filter(t => t && t.trim() !== '');
    this.availableBodyTypes = validTypes.sort();
  }

  onBodyTypeChange(selected: any) {
    this.selectedBodyType = selected;
    this.applySort();
  }

  toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;
    localStorage.setItem(this.storageKey, JSON.stringify(this.isCollapsed));
  }

  onSort(key: string) {
    if (!key) return;
    if (this.sortKey === key) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortKey = key;
      this.sortDirection = 'asc';
    }
    this.applySort();
  }
  
  onCraft(item: any) {
    this.craft.emit(item);
  }

  onClone(item: any) {
    this.clone.emit(item);
  }

  onEdit(item: any) {
    this.edit.emit(item);
  }

  onCustomAdd(item: any) {
    this.customAdd.emit(item);
  }

  onAddToCart(item: any) {
    this.addToCart.emit(item);
  }

  onEquip(item: any) {
    this.equip.emit(item);
  }

  onUnequip(item: any) {
    this.unequip.emit(item);
  }

  onDelete(item: any) {
    this.delete.emit(item);
  }

  private initializeSortedData() {
    const defaultKey = this.headerKeys.includes('name')
      ? 'name'
      : (this.headerKeys[0] || null);
      
    if (defaultKey && !this.sortKey) {
      this.sortKey = defaultKey;
      this.sortDirection = 'asc';
    }
    
    this.applySort();
  }

  private applySort() {
    let filteredData = [...(this.data || [])];

    if (this.enableBodyFilter && this.selectedBodyType) {
        filteredData = filteredData.filter(item => {
            // Check raceReq (items/armor)
            if (item.raceReq) {
                if (Array.isArray(item.raceReq)) {
                    return item.raceReq.includes(this.selectedBodyType);
                }
                return item.raceReq === this.selectedBodyType;
            }

            // Check body (weapons/other)
            if (item.body) {
                if (Array.isArray(item.body)) {
                    return item.body.includes(this.selectedBodyType);
                }
                return item.body === this.selectedBodyType;
            }
            
            // If neither property exists, keep item (e.g. other categories without restriction)
            return true;
        });
    }

    if (!this.sortKey) {
      this.sortedData = filteredData;
      return;
    }

    const key = this.sortKey;
    const direction = this.sortDirection === 'asc' ? 1 : -1;
    this.sortedData = filteredData.sort((a, b) => {
      const aVal = a[key];
      const bVal = b[key];

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return (aVal - bVal) * direction;
      }

      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();

      if (aStr < bStr) return -1 * direction;
      if (aStr > bStr) return 1 * direction;
      return 0;
    });
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

    // Handle deployables
    if (item.type === 'deployable') {
      // Initialize deployables array if it doesn't exist
      if (!player.deployables) {
        player.deployables = [];
      }
      
      // Check if deployable already exists
      const existingDeployable = player.deployables.find((deployable) => deployable.id === item.id);
      
      if (existingDeployable) {
        // Increment quantity if deployable exists
        existingDeployable.quant += 1;
      } else {
        // Add new deployable with quantity 1
        player.deployables.push({
          id: item.id,
          quant: 1
        });
      }
    }
    
    this.activePlayerService.updateActivePlayer({ ...player });
    
    // Get current quantity after adding
    const currentQuant = player.items.find(i => i.id === item.id)?.quant || 1;
    
    // Show success toast
    this.toastService.show(
      `Added ${item.name || 'Item'} to inventory (${currentQuant} in inventory)`, 
      'success'
    );
  }
  
  removeFromInventory(item: any) {
    const player = this.activePlayerService.activePlayer;
    if (!player) return;
    
    // Check if it's a weapon in the weapon list (for invalid weapons displayed as items)
    if (item.type === 'weapon' && player.weapons && player.weapons.includes(item.id)) {
      player.weapons = player.weapons.filter(id => id !== item.id);
      this.activePlayerService.updateActivePlayer({ ...player });
      this.toastService.show(`Removed ${item.name} from weapons`, 'error');
      return;
    }

    if (!player.items) return;
    
    // Find the item in the inventory
    const existingItemIndex = player.items.findIndex((inventoryItem) => inventoryItem.id === item.id);
    
    if (existingItemIndex >= 0) {
      const existingItem = player.items[existingItemIndex];
      
      if (existingItem.quant > 0) {
        // Decrement quantity by 1 (reaches 0 if it was 1, item is kept in inventory)
        existingItem.quant -= 1;
        this.toastService.show(
          `Updated ${item.name || 'Item'} (${existingItem.quant} remaining)`, 
          'info'
        );
      } else {
        // Quantity is ALREADY 0: pressing subtract (-) again removes the item completely
        player.items.splice(existingItemIndex, 1);
        
        // Handle deployables removal
        if (item.type === 'deployable' && player.deployables) {
          const existingDeployableIndex = player.deployables.findIndex((deployable) => deployable.id === item.id);
          if (existingDeployableIndex >= 0) {
            player.deployables.splice(existingDeployableIndex, 1);
          }
        }

        this.toastService.show(
          `Removed ${item.name || 'Item'} from inventory`, 
          'error'
        );
      }
      
      this.activePlayerService.updateActivePlayer({ ...player });
    }
  }
}
