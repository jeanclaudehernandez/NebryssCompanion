import { Component, OnInit, ViewChild, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../data.service';
import { WeaponTableComponent } from '../weapon-table/weapon-table.component';
import { GenericTableComponent } from '../generic-table/generic-table.component';
import { Items, Weapon, WeaponRule, ItemCategory, ScrollSection, AlteredState, BestiaryEntry } from '../model';
import { ScrollNavComponent } from '../scroll-nav/scroll-nav.component';
import { ActivePlayerService } from '../active-player.service';
import { ModalService } from '../modal.service';
import { ToastService } from '../toast.service';

@Component({
  selector: 'app-items',
  standalone: true,
  imports: [CommonModule, WeaponTableComponent, GenericTableComponent, ScrollNavComponent],
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
          (craft)="onCraftItem($event)">
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
  selectedBlueprint: any = null;

  // Map of item types to categories for display purposes
  private typeToCategory: {[key: string]: ItemCategory} = {};

  constructor(
    private dataService: DataService,
    private activePlayerService: ActivePlayerService,
    public modalService: ModalService,
    private toastService: ToastService
  ) {}

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
