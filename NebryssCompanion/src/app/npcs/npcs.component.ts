import { Component, OnInit, ViewEncapsulation, ChangeDetectionStrategy, ChangeDetectorRef, Output, EventEmitter, Input, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminService } from '../admin.service';
import { DataService } from '../data.service';
import { ToastService } from '../toast.service';
import { ImageViewerComponent } from '../image-viewer/image-viewer.component';
import { NPC, Shop, Location, Lore } from '../model';
import { AdminEditorSession } from '../admin-editor.models';

export type NpcGroupBy = 'faction' | 'location';

export interface NpcGroup {
  name: string;
  count: number;
  npcs: NPC[];
  image?: string;
  thumbnail?: string;
}

@Component({
  selector: 'app-npcs',
  standalone: true,
  imports: [
    CommonModule,
    ImageViewerComponent
  ],
  templateUrl: './npcs.component.html',
  styleUrls: ['./npcs.component.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NpcsComponent implements OnInit {
  @Input() initialNpcName: string | null = null;
  @Input() backTarget: string | null = null;

  @Output() navigateToLocation = new EventEmitter<{ locationName: string; backTarget: string | null }>();
  @Output() navigateToWorldMap = new EventEmitter<string>();
  @Output() navigateToShop = new EventEmitter<{ shopId?: number; shopName?: string }>();
  @Output() navigateToLore = new EventEmitter<string>();
  @Output() openAdminEditor = new EventEmitter<AdminEditorSession>();
  @Output() navigateToBestiary = new EventEmitter<number>();

  private readonly destroyRef = inject(DestroyRef);
  private readonly STORAGE_KEY = 'selectedNpcName';
  private readonly GROUP_KEY = 'npcGroupMode';

  npcs: NPC[] = [];
  shops: Shop[] = [];
  locations: Location[] = [];
  loreData: Lore | null = null;

  selectedNpc: NPC | null = null;
  groupBy: NpcGroupBy = 'faction';
  searchTerm = '';
  collapsedGroups = new Set<string>();
  isAdmin = false;
  deepLinkMode = false;

  constructor(
    private dataService: DataService,
    private adminService: AdminService,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const savedGroupMode = localStorage.getItem(this.GROUP_KEY) as NpcGroupBy;
    if (savedGroupMode === 'faction' || savedGroupMode === 'location') {
      this.groupBy = savedGroupMode;
    }

    this.adminService.isAdmin$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(isAdmin => {
        this.isAdmin = isAdmin;
        this.cdr.markForCheck();
      });

    this.dataService.getLore()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(lore => {
        this.loreData = lore || null;
        this.cdr.markForCheck();
      });

    this.dataService.getAllData()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => {
        this.npcs = data.npcs || [];
        this.shops = data.shops || [];
        this.locations = data.locations?.locations || [];

        if (this.initialNpcName) {
          const target = this.npcs.find(n => n.name.toLowerCase() === this.initialNpcName?.toLowerCase());
          if (target) {
            this.selectedNpc = target;
            this.saveToLocalStorage();
            this.deepLinkMode = true;
          } else {
            this.loadFromLocalStorage();
          }
        } else {
          this.loadFromLocalStorage();
        }

        this.cdr.markForCheck();
      });

    this.dataService.npcs$
      ?.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(npcs => {
        if (npcs && npcs.length > 0) {
          this.npcs = npcs;
          if (this.selectedNpc) {
            const updated = this.npcs.find(n => n.id === this.selectedNpc?.id || n.name === this.selectedNpc?.name);
            if (updated) {
              this.selectedNpc = updated;
            }
          }
          this.cdr.markForCheck();
        }
      });
  }

  setGroupBy(mode: NpcGroupBy): void {
    this.groupBy = mode;
    localStorage.setItem(this.GROUP_KEY, mode);
    this.collapsedGroups.clear();
    this.cdr.markForCheck();
  }

  onSearchChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchTerm = input.value || '';
    this.cdr.markForCheck();
  }

  toggleGroupCollapse(groupName: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    const currentlyCollapsed = this.isGroupCollapsed(groupName);
    const newState = !currentlyCollapsed;
    if (newState) {
      this.collapsedGroups.add(groupName);
    } else {
      this.collapsedGroups.delete(groupName);
    }
    try {
      localStorage.setItem(`npc-group-${groupName}-collapsed`, JSON.stringify(newState));
    } catch {}
    this.cdr.markForCheck();
  }

  isGroupCollapsed(groupName: string): boolean {
    const saved = localStorage.getItem(`npc-group-${groupName}-collapsed`);
    if (saved !== null) {
      return JSON.parse(saved);
    }
    return true;
  }

  selectNpc(npc: NPC): void {
    if (this.selectedNpc === npc) {
      this.clearSelectedNpc();
    } else {
      this.selectedNpc = npc;
      this.saveToLocalStorage();
    }
    this.cdr.markForCheck();
  }

  clearSelectedNpc(): void {
    this.selectedNpc = null;
    this.deepLinkMode = false;
    localStorage.removeItem(this.STORAGE_KEY);
    this.cdr.markForCheck();
  }

  private saveToLocalStorage(): void {
    if (this.selectedNpc) {
      localStorage.setItem(this.STORAGE_KEY, this.selectedNpc.name);
    } else {
      localStorage.removeItem(this.STORAGE_KEY);
    }
  }

  private loadFromLocalStorage(): void {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (saved && this.npcs.length > 0) {
      const found = this.npcs.find(n => n.name === saved);
      if (found) {
        this.selectedNpc = found;
      }
    }
  }

  get filteredNpcs(): NPC[] {
    const visibleList = this.npcs.filter(npc => this.isAdmin || npc.discovered !== false);
    const query = this.searchTerm.trim().toLowerCase();
    if (!query) {
      return visibleList;
    }
    return visibleList.filter(npc =>
      npc.name.toLowerCase().includes(query) ||
      (npc.faction && npc.faction.toLowerCase().includes(query)) ||
      (npc.subgroup && npc.subgroup.toLowerCase().includes(query)) ||
      (npc.location && npc.location.toLowerCase().includes(query)) ||
      (npc.role && npc.role.toLowerCase().includes(query)) ||
      (npc.description && npc.description.toLowerCase().includes(query))
    );
  }

  get npcGroups(): NpcGroup[] {
    const list = this.filteredNpcs;
    const map = new Map<string, NPC[]>();

    if (this.groupBy === 'faction') {
      list.forEach(npc => {
        const groupKey = npc.faction?.trim() || 'Other / Independent';
        const group = map.get(groupKey) || [];
        group.push(npc);
        map.set(groupKey, group);
      });
    } else {
      list.forEach(npc => {
        const groupKey = (this.isNpcLocationDiscovered(npc) ? npc.location?.trim() : 'Unknown Location') || 'Unbound / Wandering';
        const group = map.get(groupKey) || [];
        group.push(npc);
        map.set(groupKey, group);
      });
    }

    const groups: NpcGroup[] = [];
    map.forEach((items, name) => {
      items.sort((a, b) => a.name.localeCompare(b.name));
      let image: string | undefined;
      let thumbnail: string | undefined;

      if (this.groupBy === 'faction' && this.loreData?.factions) {
        const factionObj = this.loreData.factions.find(f => f.name.toLowerCase() === name.toLowerCase());
        image = factionObj?.image;
        thumbnail = factionObj?.thumbnail;
      } else if (this.groupBy === 'location' && this.locations.length > 0) {
        const locObj = this.locations.find(l => l.name.toLowerCase() === name.toLowerCase());
        image = locObj?.imgUrl;
        thumbnail = locObj?.thumbnail;
      }

      groups.push({
        name,
        count: items.length,
        npcs: items,
        image,
        thumbnail
      });
    });

    return groups.sort((a, b) => a.name.localeCompare(b.name));
  }

  getNpcShop(npc: NPC): Shop | null {
    if (!npc) return null;
    return this.shops.find(s =>
      s.owner === npc.id ||
      (s.name && s.name.toLowerCase().includes(npc.name.toLowerCase()))
    ) || null;
  }

  toggleNpcDiscovered(npc: NPC, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    if (!this.isAdmin || !npc) {
      return;
    }

    const nextDiscovered = npc.discovered === false ? true : false;
    const updatedNpc: NPC = {
      ...npc,
      discovered: nextDiscovered
    };

    this.dataService.updateNpc(updatedNpc).subscribe({
      next: saved => {
        const index = this.npcs.findIndex(n => n.id === saved.id);
        if (index !== -1) {
          this.npcs[index] = { ...saved };
        }
        if (this.selectedNpc?.id === saved.id) {
          this.selectedNpc = { ...saved };
        }
        this.toastService.show(
          saved.discovered !== false
            ? `NPC "${saved.name}" is now DISCOVERED (Visible to Players).`
            : `NPC "${saved.name}" is now UNDISCOVERED (Hidden from Players).`,
          'info'
        );
        this.cdr.markForCheck();
      },
      error: err => {
        this.toastService.show(`Failed to update NPC discovery status: ${err?.message || err}`, 'error');
      }
    });
  }

  isNpcLocationDiscovered(npc: NPC): boolean {
    if (!npc || !npc.location) return false;
    if (this.isAdmin) return true;
    const loc = this.locations.find(l => l.name.toLowerCase() === npc.location?.toLowerCase());
    if (!loc) return true;
    return !!(loc.discovered !== false && (!loc.isSecret || loc.isSecretRevealed));
  }

  isNpcShopDiscovered(npc: NPC): boolean {
    const shop = this.getNpcShop(npc);
    if (!shop) return false;
    if (this.isAdmin) return true;
    if (shop.discovered === false) return false;
    return this.isShopLocationDiscovered(shop);
  }

  private isShopLocationDiscovered(shop: Shop): boolean {
    if (this.isAdmin) return true;
    const locName = shop.locationName || shop.location;
    if (!locName || locName === 'Unbound') return true;
    const loc = this.locations.find(l => l.name.toLowerCase() === locName.toLowerCase() || l.id === shop.locationId);
    if (!loc) return true;
    return !!(loc.discovered !== false && (!loc.isSecret || loc.isSecretRevealed));
  }

  goToLocation(locationName: string | undefined): void {
    if (!locationName) return;
    this.navigateToLocation.emit({ locationName, backTarget: 'npcs' });
  }

  goToWorldMap(locationName: string | undefined): void {
    if (!locationName) return;
    this.navigateToWorldMap.emit(locationName);
  }

  goToShop(shop: Shop | null): void {
    if (!shop) return;
    this.navigateToShop.emit({ shopId: shop.id, shopName: shop.name });
  }

  goToLore(factionName: string | undefined): void {
    if (!factionName) return;
    this.navigateToLore.emit(factionName);
  }

  goToBestiary(bestiaryId: number | undefined): void {
    if (!bestiaryId) return;
    this.navigateToBestiary.emit(bestiaryId);
  }

  editInGmEditor(npc: NPC): void {
    this.openAdminEditor.emit({ mode: 'npc', npc });
  }

  trackByGroup(index: number, group: NpcGroup): string {
    return group.name;
  }

  trackByNpc(index: number, npc: NPC): number {
    return npc.id;
  }
}
