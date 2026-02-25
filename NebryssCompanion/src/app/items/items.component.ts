import { Component, OnInit, ViewChild, TemplateRef } from '@angular/core';
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
import { JsonEditorComponent } from '../json-editor/json-editor.component';

@Component({
  selector: 'app-items',
  standalone: true,
  imports: [CommonModule, FormsModule, WeaponTableComponent, GenericTableComponent, ScrollNavComponent, JsonEditorComponent],
  template: `
    <div class="items-container">
      <div class="weapons-section" [id]="'weapon'">
        <h2 (click)="toggleWeaponsCollapsed()" style="cursor: pointer; margin-left: 50px;">
          Weapons {{ weaponsCollapsed ? '▶' : '▼' }}
        </h2>
        <div *ngIf="!weaponsCollapsed">
          <app-weapon-table 
            [weaponIds]="allWeaponIds" 
            [weaponsData]="weaponsData" 
            [weaponRulesData]="weaponRules"
            [alteredStates]="alteredStates"
            [displayPrice]="true"
            [displayBody]="true"
            [inventoryManagement]="hasActivePlayer()"></app-weapon-table>
        </div>
      </div>

      <div *ngFor="let category of itemCategories" [id]='category.key'>
        <app-generic-table 
          [storageKey]="'items-category-' + category.key"
          [title]="category.name"
          [data]="getCategoryData(category.key)"
          [headers]="category.headers"
          [headerKeys]="category.keys"
          [renderHtml]="['description']"
          [inventoryManagement]="hasActivePlayer()"
          [enableCloning]="isAdmin"
          [enableDeleting]="isAdmin"
          [enableEditing]="isAdmin"
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

    <ng-template #editModal>
      <div class="edit-modal">
        <h3>Edit Item</h3>
        <div style="margin: 20px 0;">
            <label for="itemData" style="display: block; margin-bottom: 5px;">Item Data (JSON):</label>
            <app-json-editor [(value)]="editedItemJson"></app-json-editor>
        </div>
        <div class="modal-actions" style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
          <button (click)="modalService.close()" style="padding: 8px 16px; border: 1px solid #ccc; background: white; border-radius: 4px; cursor: pointer;">Cancel</button>
          <button (click)="confirmEdit()" style="padding: 8px 16px; border: none; background: #9C27B0; color: white; border-radius: 4px; cursor: pointer;">Save</button>
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
  itemsData!: Items; // Use Items interface
  weaponsData: Weapon[] = [];
  weaponRules: WeaponRule[] = [];
  itemCategories: ItemCategory[] = [];
  alteredStates: AlteredState[] = [];
  bestiary: BestiaryEntry[] = [];
  allWeaponIds: number[] = [];
  weaponsCollapsed = true;
  scrollSections: ScrollSection[] = [];
  
  @ViewChild('craftConfirmModal') craftConfirmModal!: TemplateRef<any>;
  @ViewChild('cloneModal') cloneModal!: TemplateRef<any>;
  @ViewChild('deleteModal') deleteModal!: TemplateRef<any>;
  @ViewChild('editModal') editModal!: TemplateRef<any>;
  selectedBlueprint: any = null;
  
  // Cloning
  itemToClone: any = null;
  clonedItemName: string = '';

  // Editing
  itemToEdit: any = null;
  editedItemJson: string = '';

  // Deleting
  itemToDelete: any = null;
  
  // Map of item types to categories for display purposes
  private typeToCategory: {[key: string]: ItemCategory} = {};
  
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
      console.log(this.itemsData);
    
      
      this.weaponsData = data.weapons;
      this.weaponRules = data.weaponRules;
      this.alteredStates = data.alteredStates;
      this.itemCategories = data.itemCategories;
      this.bestiary = data.bestiary;
      
      this.allWeaponIds = this.weaponsData.map(w => w.id);
      
      // Set up type to category mapping
      this.itemCategories.forEach(category => {
        this.typeToCategory[category.key] = category;
      });
      
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
      ]
    });
  }

  toggleWeaponsCollapsed() {
    this.weaponsCollapsed = !this.weaponsCollapsed;
    localStorage.setItem('items-weapons-collapsed', JSON.stringify(this.weaponsCollapsed));
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
    this.itemToEdit = item;
    // We want to edit the raw item data, so we should find it in the main list
    // because the item passed here might have been processed by getCategoryData
    const rawItem = this.itemsData.items.find(i => i.id === item.id);
    this.editedItemJson = JSON.stringify(rawItem || item, null, 2);
    this.modalService.openFromTemplate(this.editModal, undefined, { width: '98vw', height: '90vh' });
  }

  confirmEdit() {
    try {
      const updatedItem = JSON.parse(this.editedItemJson);
      
      // Ensure the ID matches (optional but good practice)
      if (this.itemToEdit.id && updatedItem.id !== this.itemToEdit.id) {
        if (!confirm('You are changing the Item ID. This might break references. Continue?')) {
          return;
        }
      }

      this.dataService.updateItem(updatedItem).subscribe({
        next: (result) => {
          this.toastService.show('Item updated successfully', 'success');
          this.modalService.close();
          // Update local data
          const index = this.itemsData.items.findIndex(i => i.id === updatedItem.id);
          if (index !== -1) {
             this.itemsData.items[index] = updatedItem;
          }
        },
        error: (err) => {
          console.error('Error updating item', err);
          this.toastService.show('Failed to update item', 'error');
        }
      });
    } catch (e) {
      this.toastService.show('Invalid JSON format', 'error');
    }
  }

  onDeleteItem(item: any) {
    this.itemToDelete = item;
    this.modalService.openFromTemplate(this.deleteModal);
  }

  confirmClone() {
    if (!this.itemToClone) return;

    const allItems = this.itemsData.items;
    const newId = allItems.length + 1; 
    
    // Create new item object
    const newItem = { ...this.itemToClone };
    delete newItem._id; // Remove mongoDB _id if present
    newItem.id = newId;
    newItem.name = this.clonedItemName;
    
    // Remove UI specific properties added in getCategoryData
    // We should ideally clone the RAW item data, not the processed one.
    // itemToClone is from the table, so it has processed data.
    // We should find the original item in itemsData.items to be safe.
    
    const originalItem = this.itemsData.items.find(i => i.id === this.itemToClone.id);
    const itemToSave = originalItem ? { ...originalItem } : { ...newItem };
    
    delete itemToSave._id;
    itemToSave.id = newId;
    itemToSave.name = this.clonedItemName;
    
    // Send to API
    this.dataService.createItem(itemToSave).subscribe({
      next: (createdItem) => {
        this.toastService.show(`Item cloned successfully!`, 'success');
        this.modalService.close();
        this.itemToClone = null;
        this.clonedItemName = '';
      },
      error: (err) => {
        console.error('Failed to clone item', err);
        this.toastService.show(`Failed to clone item: ${err.message}`, 'error');
      }
    });
  }

  confirmDelete() {
    if (!this.itemToDelete) return;

    this.dataService.deleteItem(this.itemToDelete.id).subscribe({
      next: () => {
        this.toastService.show(`Item deleted successfully!`, 'success');
        this.modalService.close();
        this.itemToDelete = null;
      },
      error: (err) => {
        console.error('Failed to delete item', err);
        this.toastService.show(`Failed to delete item: ${err.message}`, 'error');
      }
    });
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

  getCategoryData(key: string): any[] {
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
