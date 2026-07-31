import { Component, OnInit, ViewChild, TemplateRef, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from '../data.service';
import { WeaponTableComponent } from '../weapon-table/weapon-table.component';
import { GenericTableComponent } from '../generic-table/generic-table.component';
import { Items, Weapon, WeaponRule, ItemCategory, ScrollSection, AlteredState, BestiaryEntry } from '../model';
import { ScrollNavComponent } from '../scroll-nav/scroll-nav.component';
import { ActivePlayerService } from '../active-player.service';
import { ModalService } from '../modal.service';
import { ToastService } from '../toast.service';
import { AdminService } from '../admin.service';
import { AdminEditorSession } from '../admin-editor.models';

@Component({
  selector: 'app-items',
  standalone: true,
  imports: [CommonModule, FormsModule, WeaponTableComponent, GenericTableComponent, ScrollNavComponent],
  template: `
    <div class="items-container">
      <div class="items-search-container">
        <div class="search-input-wrapper">
          <span class="search-icon">🔍</span>
          <input 
            type="text" 
            [(ngModel)]="searchQuery" 
            (ngModelChange)="onSearchChange()"
            placeholder="Search weapons, armor, items, descriptions..." 
            class="items-search-input">
          <button *ngIf="searchQuery" class="clear-search-btn" (click)="clearSearch()">✕</button>
        </div>
        <span *ngIf="searchQuery" class="search-results-count">
          Found {{ totalSearchResultsCount }} item(s)
        </span>
      </div>

      <div [id]="'weapon'">
        <app-weapon-table 
          [title]="'Weapons'"
          [collapsible]="true"
          [isCollapsed]="weaponsCollapsed"
          (toggleCollapse)="toggleWeaponsCollapsed()"
          [weaponIds]="filteredWeaponIds" 
          [weaponsData]="weaponsData" 
          [weaponRulesData]="weaponRules"
          [alteredStates]="alteredStates"
          [displayPrice]="true"
          [displayBody]="true"
          [enableBodyFilter]="true"
          [characterBody]="activePlayerBodyTypes"
          [inventoryManagement]="hasActivePlayer()"
          [enableCloning]="isAdmin"
          [enableDeleting]="isAdmin"
          [enableEditing]="isAdmin"
          (clone)="onCloneWeapon($event)"
          (delete)="onDeleteWeapon($event)"
          (edit)="onEditWeapon($event)">
        </app-weapon-table>
      </div>

      <div *ngFor="let category of itemCategories" [id]='category.key'>
        <app-generic-table 
          [storageKey]="'items-category-' + category.key"
          [title]="category.name"
          [data]="filteredCategoryDataMap[category.key] || []"
          [headers]="category.headers"
          [headerKeys]="category.keys"
          [renderHtml]="['description']"
          [inventoryManagement]="hasActivePlayer()"
          [enableCloning]="isAdmin"
          [enableDeleting]="isAdmin"
          [enableEditing]="isAdmin"
          [enableBodyFilter]="category.key === 'armor'"
          [characterBody]="activePlayerBodyTypes"
          (craft)="onCraftItem($event)"
          (clone)="onCloneItem($event)"
          (delete)="onDeleteItem($event)"
          (edit)="onEditItem($event)">
        </app-generic-table>
      </div>
    </div>
    <app-scroll-nav [sections]="scrollSections"></app-scroll-nav>

    <ng-template #craftConfirmModal>
      <div class="craft-modal">
        <h3>Confirm Crafting</h3>
        <p>Are you sure you want to craft <strong>{{ selectedBlueprint?.blueprintForName }}</strong>?</p>
        <p>This will consume the following materials:</p>
        <ul>
          <li *ngFor="let mat of selectedBlueprint?.buildMaterials">
             {{ getMaterialName(mat.id) }} (x{{ mat.amount }})
          </li>
        </ul>
        <div class="modal-actions" style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
          <button (click)="modalService.close()" style="padding: 8px 16px; border: 1px solid #ccc; background: white; border-radius: 4px; cursor: pointer;">Cancel</button>
          <button (click)="confirmCraft()" style="padding: 8px 16px; border: none; background: #2196F3; color: white; border-radius: 4px; cursor: pointer;">Confirm Craft</button>
        </div>
      </div>
    </ng-template>

    <ng-template #cloneModal>
      <div class="clone-modal">
        <h3>Clone Modal</h3>
        <div style="margin: 20px 0;">
            <label for="cloneName" style="display: block; margin-bottom: 5px;">New Item Name:</label>
            <input type="text" id="cloneName" [(ngModel)]="clonedItemName" style="width: 100%; padding: 8px; box-sizing: border-box;">
        </div>
        <div class="modal-actions" style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
          <button (click)="modalService.close()" style="padding: 8px 16px; border: 1px solid #ccc; background: white; border-radius: 4px; cursor: pointer;">Cancel</button>
          <button (click)="confirmClone()" style="padding: 8px 16px; border: none; background: #FFC107; color: black; border-radius: 4px; cursor: pointer;">Confirm</button>
        </div>
      </div>
    </ng-template>

    <ng-template #deleteModal>
      <div class="delete-modal">
        <h3>Delete Item</h3>
        <p>Are you sure you want to delete <strong>{{ itemToDelete?.name }}</strong>?</p>
        <p>This action cannot be undone.</p>
        <div class="modal-actions" style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
          <button (click)="modalService.close()" style="padding: 8px 16px; border: 1px solid #ccc; background: white; border-radius: 4px; cursor: pointer;">Cancel</button>
          <button (click)="confirmDelete()" style="padding: 8px 16px; border: none; background: #8B0000; color: white; border-radius: 4px; cursor: pointer;">Delete</button>
        </div>
      </div>
    </ng-template>
  `,
  styleUrls: ['./items.component.css']
})
export class ItemsComponent implements OnInit {
  @Output() openAdminEditor = new EventEmitter<AdminEditorSession>();

  itemsData!: Items; // Use Items interface
  weaponsData: Weapon[] = [];
  weaponRules: WeaponRule[] = [];
  itemCategories: ItemCategory[] = [];
  categoryDataMap: Record<string, any[]> = {};
  filteredCategoryDataMap: Record<string, any[]> = {};
  alteredStates: AlteredState[] = [];
  bestiary: BestiaryEntry[] = [];
  allWeaponIds: number[] = [];
  filteredWeaponIds: number[] = [];
  searchQuery: string = '';
  weaponsCollapsed = true;
  scrollSections: ScrollSection[] = [];
  activePlayerBodyTypes: string[] = [];
  
  @ViewChild('craftConfirmModal') craftConfirmModal!: TemplateRef<any>;
  @ViewChild('cloneModal') cloneModal!: TemplateRef<any>;
  @ViewChild('deleteModal') deleteModal!: TemplateRef<any>;
  selectedBlueprint: any = null;
  
  // Cloning
  itemToClone: any = null;
  clonedItemName: string = '';

  // Deleting
  itemToDelete: any = null;
  
  // Weapon Management
  weaponToClone: Weapon | null = null;
  weaponToDelete: Weapon | null = null;
  
  isAdmin = false;

  constructor(
    private dataService: DataService,
    private activePlayerService: ActivePlayerService,
    public modalService: ModalService,
    private toastService: ToastService,
    private adminService: AdminService
  ) {
    this.adminService.isAdmin$.subscribe(isAdmin => {
      this.isAdmin = isAdmin;
    });
  }

  ngOnInit() {
    this.dataService.getAllData().subscribe(data => {
      this.itemsData = data.items;
      this.weaponsData = data.weapons;
      this.weaponRules = data.weaponRules;
      this.alteredStates = data.alteredStates;
      this.itemCategories = data.itemCategories;
      this.bestiary = data.bestiary;
      
      this.allWeaponIds = this.weaponsData.map(w => w.id);
      
      const saved = localStorage.getItem('items-weapons-collapsed');
      this.weaponsCollapsed = saved ? JSON.parse(saved) : true;
      this.scrollSections = [
        {
          id: 'weapon',
          title: 'Weapons',
        },
        ...this.itemCategories.map((category: ItemCategory) => {
          return {
            id: category.key,
            title: category.name
          }
        })
      ];

      this.refreshCategoryData();
    });

    this.activePlayerService.activePlayer$.subscribe(player => {
      if (player) {
        this.activePlayerBodyTypes = player.attributes?.body || [];
      } else {
        this.activePlayerBodyTypes = [];
      }

      this.refreshCategoryData();
    });
  }

  toggleWeaponsCollapsed() {
    this.weaponsCollapsed = !this.weaponsCollapsed;
    localStorage.setItem('items-weapons-collapsed', JSON.stringify(this.weaponsCollapsed));
  }

  onSearchChange(): void {
    const query = (this.searchQuery || '').toLowerCase().trim();

    if (!query) {
      this.filteredWeaponIds = [...this.allWeaponIds];
      this.filteredCategoryDataMap = { ...this.categoryDataMap };
      return;
    }

    // Filter weapons
    const matchingWeapons = this.weaponsData.filter(w => {
      const nameMatch = w.name?.toLowerCase().includes(query);
      const profileMatch = w.profiles?.some(p => 
        p.profileName?.toLowerCase().includes(query) || 
        p.body?.toLowerCase().includes(query) ||
        p.specialRules?.some((r: any) => {
          const ruleStr = typeof r === 'string' ? r : (r?.name || r?.ruleName || '');
          return ruleStr.toLowerCase().includes(query);
        })
      );
      return nameMatch || profileMatch;
    });

    this.filteredWeaponIds = matchingWeapons.map(w => w.id);
    if (matchingWeapons.length > 0) {
      this.weaponsCollapsed = false;
    }

    // Filter items per category
    this.filteredCategoryDataMap = {};
    for (const catKey of Object.keys(this.categoryDataMap)) {
      const items = this.categoryDataMap[catKey] || [];
      this.filteredCategoryDataMap[catKey] = items.filter(item => {
        const nameMatch = item.name?.toLowerCase().includes(query);
        const descMatch = item.description?.toLowerCase().includes(query);
        const typeMatch = item.type?.toLowerCase().includes(query);
        const subTypeMatch = item.subType?.toLowerCase().includes(query);
        const bodyMatch = item.raceReq?.toLowerCase().includes(query);
        const partMatch = item.part?.toLowerCase().includes(query);
        return nameMatch || descMatch || typeMatch || subTypeMatch || bodyMatch || partMatch;
      });
    }
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.onSearchChange();
  }

  get totalSearchResultsCount(): number {
    if (!this.searchQuery) return 0;
    let count = this.filteredWeaponIds.length;
    for (const key of Object.keys(this.filteredCategoryDataMap)) {
      count += (this.filteredCategoryDataMap[key] || []).length;
    }
    return count;
  }

  // Weapon Management Methods
  onCloneWeapon(weapon: Weapon) {
    this.weaponToClone = weapon;
    this.clonedItemName = weapon.name + ' (Copy)';
    this.modalService.openFromTemplate(this.cloneModal);
  }

  onDeleteWeapon(weapon: Weapon) {
    this.weaponToDelete = weapon;
    this.itemToDelete = weapon; // Reuse itemToDelete for display in modal
    this.modalService.openFromTemplate(this.deleteModal);
  }

  onEditWeapon(weapon: Weapon) {
    this.openAdminEditor.emit({
      mode: 'weapon',
      weapon: JSON.parse(JSON.stringify(weapon))
    });
  }

  getMaterialName(id: number): string {
    const item = this.itemsData.items.find(i => i.id === id);
    return item ? item.name || 'Unknown Material' : 'Unknown Material';
  }

  onCraftItem(item: any) {
    this.selectedBlueprint = item;
    this.modalService.openFromTemplate(this.craftConfirmModal);
  }

  onCloneItem(item: any) {
    this.itemToClone = item;
    this.clonedItemName = item.name + ' (Copy)';
    this.modalService.openFromTemplate(this.cloneModal);
  }

  onEditItem(item: any) {
    const rawItem = this.itemsData.items.find(i => i.id === item.id);
    this.openAdminEditor.emit({
      mode: 'item',
      item: JSON.parse(JSON.stringify((rawItem || item)))
    });
  }

  onDeleteItem(item: any) {
    this.itemToDelete = item;
    this.modalService.openFromTemplate(this.deleteModal);
  }

  confirmClone() {
    if (this.itemToClone) {
      const newItem = { ...this.itemToClone };
      delete newItem._id;
      delete newItem.__id;
      delete newItem.id; // Let the backend or logic handle ID generation
      newItem.name = this.clonedItemName;
      
      this.dataService.createItem(newItem).subscribe({
        next: (createdItem) => {
          this.toastService.show(`Item cloned successfully!`, 'success');
          this.modalService.close();
          this.itemToClone = null;
          this.clonedItemName = '';
          
          // Refresh items
          this.dataService.refreshItems().subscribe(items => {
            this.itemsData = items;
            this.refreshCategoryData();
          });
        },
        error: (err) => {
          console.error('Failed to clone item', err);
          this.toastService.show(`Failed to clone item: ${err.message}`, 'error');
        }
      });
    } else if (this.weaponToClone) {
      const newWeapon = { ...this.weaponToClone };
      delete (newWeapon as any).id;
      delete (newWeapon as any).__id;
      newWeapon.name = this.clonedItemName;

      this.dataService.createWeapon(newWeapon).subscribe({
        next: (createdWeapon) => {
          this.toastService.show('Weapon cloned successfully', 'success');
          this.modalService.close();
          
          // Refresh weapons
          this.dataService.refreshWeapons().subscribe(weapons => {
            this.weaponsData = weapons;
            this.allWeaponIds = this.weaponsData.map(w => w.id);
            this.refreshCategoryData();
          });
          
          this.weaponToClone = null;
        },
        error: (err) => {
          console.error('Failed to clone weapon', err);
          this.toastService.show(`Failed to clone weapon: ${err.message}`, 'error');
        }
      });
    }
  }

  confirmDelete() {
    if (this.itemToDelete && !this.weaponToDelete) {
      this.dataService.deleteItem(this.itemToDelete.id).subscribe({
        next: () => {
          this.toastService.show(`Item deleted successfully!`, 'success');
          this.modalService.close();
          this.itemToDelete = null;

          // Refresh items
          this.dataService.refreshItems().subscribe(items => {
            this.itemsData = items;
            this.refreshCategoryData();
          });
        },
        error: (err) => {
          console.error('Failed to delete item', err);
          this.toastService.show(`Failed to delete item: ${err.message}`, 'error');
        }
      });
    } else if (this.weaponToDelete) {
      this.dataService.deleteWeapon(this.weaponToDelete.id).subscribe({
        next: () => {
          this.toastService.show('Weapon deleted successfully', 'success');
          this.modalService.close();
          
          // Refresh weapons
          this.dataService.refreshWeapons().subscribe(weapons => {
            this.weaponsData = weapons;
            this.allWeaponIds = this.weaponsData.map(w => w.id);
            this.refreshCategoryData();
          });
          
          this.weaponToDelete = null;
          this.itemToDelete = null;
        },
        error: (err) => {
          console.error('Failed to delete weapon', err);
          this.toastService.show(`Failed to delete weapon: ${err.message}`, 'error');
        }
      });
    }
  }

  confirmCraft() {
    if (!this.selectedBlueprint) return;
    
    const player = this.activePlayerService.activePlayer;
    if (!player) return;

    // Check if player already has this weapon
    if (this.selectedBlueprint._blueprintForId && player.weapons && player.weapons.includes(this.selectedBlueprint._blueprintForId)) {
      this.toastService.show(`You already have ${this.selectedBlueprint.blueprintForName}!`, 'info');
      this.modalService.close();
      return;
    }

    // Deduct materials
    if (this.selectedBlueprint.buildMaterials) {
       this.selectedBlueprint.buildMaterials.forEach((mat: any) => {
          if (!player.items) return;
          const playerItem = player.items.find(i => i.id === mat.id);
          if (playerItem) {
             playerItem.quant -= mat.amount;
          }
       });
       // Remove items with 0 or less quantity
       if (player.items) {
         player.items = player.items.filter(i => i.quant > 0);
       }
    }

    // Add Weapon
    if (this.selectedBlueprint._blueprintForId) {
       if (!player.weapons) player.weapons = [];
       player.weapons.push(this.selectedBlueprint._blueprintForId);
       this.toastService.show(`Crafted ${this.selectedBlueprint.blueprintForName}!`, 'success');
    }

    this.activePlayerService.updateActivePlayer({...player});
    this.modalService.close();
    this.selectedBlueprint = null;
  }

  private refreshCategoryData(): void {
    if (!this.itemsData?.items || !this.itemCategories.length) {
      this.categoryDataMap = {};
      this.onSearchChange();
      return;
    }

    this.categoryDataMap = this.itemCategories.reduce((acc, category) => {
      acc[category.key] = this.buildCategoryData(category.key);
      return acc;
    }, {} as Record<string, any[]>);

    this.onSearchChange();
  }

  private buildCategoryData(key: string): any[] {
    // Filter items by type
    if (!this.itemsData || !this.itemsData.items) {
      return [];
    }
    
    // Get items matching the requested type
    const items = this.itemsData.items
      .filter(item => item.type === key)
      .map(item => {
        const raw = item.description || '';
        const withStatuses = this.replaceStatusTokens(raw);
        let withRules = this.replaceWeaponRuleTokens(withStatuses);

        const newItem = {
          ...item,
          description: withRules
        };

        if (key === 'material') {
          if (item.bestiaryId) {
            const creature = this.bestiary.find(b => b.id === item.bestiaryId);
            (newItem as any).bestiaryId = creature ? creature.name : `Unknown Creature (${item.bestiaryId})`;
          }
        }

        if (key === 'blueprint') {
          // Append materials
          if (item.buildMaterials && item.buildMaterials.length > 0) {
            const materialsList = item.buildMaterials.map(mat => {
              const materialItem = this.itemsData.items.find(i => i.id === mat.id);
              return `${materialItem ? materialItem.name : 'Unknown Material'} (x${mat.amount})`;
            }).join(', ');
            newItem.description += `<div class="materials-list" style="margin-top: 5px;"><strong>Required Materials:</strong> ${materialsList}</div>`;
          }

          // Resolve Weapon Name
          if (item.blueprintFor) {
            const weapon = this.weaponsData.find(w => w.id === item.blueprintFor);
            const weaponName = weapon ? weapon.name : `Unknown Weapon (${item.blueprintFor})`;
            (newItem as any).blueprintFor = weaponName;
            (newItem as any).blueprintForName = weaponName;
            (newItem as any)._blueprintForId = item.blueprintFor;
          }

          // Check if craftable
          const activePlayer = this.activePlayerService.activePlayer;
          let canCraft = false;
          if (activePlayer && activePlayer.items && item.buildMaterials) {
             const hasBlueprint = activePlayer.items.some(i => i.id === item.id);
             const hasMaterials = item.buildMaterials.every((mat: any) => {
                const playerItem = activePlayer.items!.find(i => i.id === mat.id);
                return playerItem && playerItem.quant >= mat.amount;
             });
             canCraft = hasBlueprint && hasMaterials;
          }
          (newItem as any).canCraft = canCraft;
        }

        return newItem;
      });
    
    // Check if we have an active player
    const activePlayer = this.activePlayerService.activePlayer;
    if (!activePlayer || !activePlayer.items || !activePlayer.items.length) {
      return items;
    }
    
    // Map player's item IDs for quick lookup
    const playerItemIds = new Set(activePlayer.items.map(item => item.id));
    
    // Sort the items - player owned items first
    return [...items].sort((a, b) => {
      const aOwned = a.id !== undefined && playerItemIds.has(a.id) ? 1 : 0;
      const bOwned = b.id !== undefined && playerItemIds.has(b.id) ? 1 : 0;
      return bOwned - aOwned; // Sort descending so owned items come first
    });
  }

  private replaceWeaponRuleTokens(text: string): string {
    if (!text) return '';
    const regex = /\/weaponRule\/:(\d+)\//g;
    return text.replace(regex, (match: string, idStr: string) => {
      const id = parseInt(idStr, 10);
      const rule = this.weaponRules.find(r => r.id === id);
      if (!rule) return match;
      const name = rule.name;
      return `<span class="weapon-rule-link" data-weapon-rule="${name}">${name}</span>`;
    });
  }

  private replaceStatusTokens(text: string): string {
    if (!text) return '';
    const regex = /\/status\/:(\d+)\//g;
    return text.replace(regex, (match: string, idStr: string) => {
      const id = parseInt(idStr, 10);
      const status = this.alteredStates.find(s => s.id === id);
      if (!status) return match;
      const name = status.name;
      return `<span class="status-link" data-status="${name}">${name}</span>`;
    });
  }

  hasActivePlayer(): boolean {
    return this.activePlayerService.activePlayer !== null;
  }
}
