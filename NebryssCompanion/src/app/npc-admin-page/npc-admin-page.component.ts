import { CommonModule } from '@angular/common';
import { Component, DestroyRef, Input, OnChanges, OnInit, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DataService } from '../data.service';
import { AdminService } from '../admin.service';
import { ToastService } from '../toast.service';
import { NPC } from '../model';

@Component({
  selector: 'app-npc-admin-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './npc-admin-page.component.html',
  styleUrls: ['./npc-admin-page.component.css']
})
export class NpcAdminPageComponent implements OnInit, OnChanges {
  @Input() initialNpc: NPC | null = null;

  private readonly destroyRef = inject(DestroyRef);
  private readonly dataService = inject(DataService);
  private readonly adminService = inject(AdminService);
  private readonly toastService = inject(ToastService);

  isAdmin = false;
  isLoading = true;
  isSaving = false;
  isDeleting = false;
  showDeleteConfirm = false;

  npcs: NPC[] = [];
  searchTerm = '';
  selectedNpcId: number | null = null;
  expandedFactions: Set<string> = new Set<string>();

  // Form Fields
  id: number | null = null;
  name = '';
  faction = '';
  subgroup = '';
  role = '';
  description = '';
  personality = '';
  mission = '';
  methods = '';
  location = '';
  backstory = '';
  bestiaryId: number | null = null;
  discovered = true;

  readonly defaultFactions: string[] = [
    'Gilded Accord',
    'Imperium of Man',
    'Nebryssian Liberation Republic',
    'Crimson Corsairs',
    'Independent'
  ];

  get filteredNpcs(): NPC[] {
    if (!this.searchTerm.trim()) {
      return this.npcs;
    }
    const term = this.searchTerm.toLowerCase();
    return this.npcs.filter(npc =>
      npc.name.toLowerCase().includes(term) ||
      (npc.faction && npc.faction.toLowerCase().includes(term)) ||
      (npc.subgroup && npc.subgroup.toLowerCase().includes(term)) ||
      (npc.role && npc.role.toLowerCase().includes(term))
    );
  }

  get groupedNpcs(): { faction: string; npcs: NPC[] }[] {
    const filtered = this.filteredNpcs;
    const map = new Map<string, NPC[]>();

    for (const npc of filtered) {
      const factionName = npc.faction?.trim() || 'Independent';
      if (!map.has(factionName)) {
        map.set(factionName, []);
      }
      map.get(factionName)!.push(npc);
    }

    const result: { faction: string; npcs: NPC[] }[] = [];
    map.forEach((npcs, faction) => {
      npcs.sort((a, b) => a.name.localeCompare(b.name));
      result.push({ faction, npcs });
    });

    result.sort((a, b) => {
      const indexA = this.defaultFactions.indexOf(a.faction);
      const indexB = this.defaultFactions.indexOf(b.faction);
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return a.faction.localeCompare(b.faction);
    });

    return result;
  }

  toggleFactionCollapse(faction: string): void {
    if (this.expandedFactions.has(faction)) {
      this.expandedFactions.delete(faction);
    } else {
      this.expandedFactions.add(faction);
    }
  }

  isFactionCollapsed(faction: string): boolean {
    if (this.searchTerm.trim().length > 0) {
      return false;
    }
    return !this.expandedFactions.has(faction);
  }

  get isEditing(): boolean {
    return this.id !== null;
  }

  get factionOptions(): string[] {
    const set = new Set([...this.defaultFactions, ...this.npcs.map(n => n.faction).filter(Boolean)]);
    return Array.from(set);
  }

  ngOnInit(): void {
    this.adminService.isAdmin$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(isAdmin => {
        this.isAdmin = isAdmin;
      });

    this.loadNpcs();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialNpc'] && this.initialNpc) {
      this.populateForm(this.initialNpc);
    }
  }

  loadNpcs(): void {
    this.isLoading = true;
    this.dataService.getNpcs().subscribe({
      next: npcs => {
        this.npcs = npcs || [];
        this.isLoading = false;
        if (this.initialNpc) {
          this.populateForm(this.initialNpc);
        } else if (this.npcs.length > 0 && this.id === null) {
          this.populateForm(this.npcs[0]);
        }
      },
      error: err => {
        this.isLoading = false;
        this.toastService.show(`Failed to load NPCs: ${err?.message || err}`, 'error');
      }
    });
  }

  selectNpc(npc: NPC): void {
    this.populateForm(npc);
  }

  startNewNpc(): void {
    this.id = null;
    this.name = '';
    this.faction = 'Gilded Accord';
    this.subgroup = '';
    this.role = '';
    this.description = '';
    this.personality = '';
    this.mission = '';
    this.methods = '';
    this.location = '';
    this.backstory = '';
    this.bestiaryId = null;
    this.discovered = true;
    this.selectedNpcId = null;
    this.showDeleteConfirm = false;
  }

  populateForm(npc: NPC): void {
    this.id = npc.id;
    this.selectedNpcId = npc.id;
    this.name = npc.name || '';
    this.faction = npc.faction || 'Gilded Accord';
    this.subgroup = npc.subgroup || '';
    this.role = npc.role || '';
    this.description = npc.description || '';
    this.personality = npc.personality || '';
    this.mission = npc.mission || '';
    this.methods = npc.methods || '';
    this.location = npc.location || '';
    this.backstory = npc.backstory || '';
    this.bestiaryId = typeof npc.bestiaryId === 'number' ? npc.bestiaryId : null;
    this.discovered = npc.discovered !== false;
    if (this.faction) {
      this.expandedFactions.add(this.faction.trim());
    }
    this.showDeleteConfirm = false;
  }

  saveNpc(): void {
    if (!this.name.trim()) {
      this.toastService.show('NPC Name is required.', 'info');
      return;
    }

    this.isSaving = true;

    let targetId = this.id;
    if (targetId === null || targetId === 0) {
      const maxId = this.npcs.reduce((max, n) => (n.id > max ? n.id : max), 0);
      targetId = maxId + 1;
    }

    const npcData: NPC = {
      id: targetId,
      name: this.name.trim(),
      faction: this.faction.trim() || 'Independent',
      subgroup: this.subgroup.trim(),
      role: this.role.trim() || undefined,
      description: this.description.trim() || undefined,
      personality: this.personality.trim() || undefined,
      mission: this.mission.trim() || undefined,
      methods: this.methods.trim() || undefined,
      location: this.location.trim() || undefined,
      backstory: this.backstory.trim() || undefined,
      bestiaryId: this.bestiaryId !== null ? Number(this.bestiaryId) : undefined,
      discovered: this.discovered
    };

    if (this.isEditing) {
      this.dataService.updateNpc(npcData).subscribe({
        next: saved => {
          this.isSaving = false;
          this.toastService.show(`NPC "${saved.name}" updated successfully!`, 'success');
          this.dataService.refreshNpcs().subscribe(updatedList => {
            this.npcs = updatedList || [];
            this.populateForm(saved);
          });
        },
        error: err => {
          this.isSaving = false;
          this.toastService.show(`Error updating NPC: ${err?.message || err}`, 'error');
        }
      });
    } else {
      this.dataService.createNpc(npcData).subscribe({
        next: created => {
          this.isSaving = false;
          this.toastService.show(`NPC "${created.name}" created successfully!`, 'success');
          this.dataService.refreshNpcs().subscribe(updatedList => {
            this.npcs = updatedList || [];
            this.populateForm(created);
          });
        },
        error: err => {
          this.isSaving = false;
          this.toastService.show(`Error creating NPC: ${err?.message || err}`, 'error');
        }
      });
    }
  }

  promptDelete(): void {
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
  }

  confirmDelete(): void {
    if (this.id === null) return;

    this.isDeleting = true;
    const deletedId = this.id;
    const deletedName = this.name;

    this.dataService.deleteNpc(deletedId).subscribe({
      next: () => {
        this.isDeleting = false;
        this.showDeleteConfirm = false;
        this.toastService.show(`NPC "${deletedName}" deleted successfully!`, 'info');
        this.dataService.refreshNpcs().subscribe(updatedList => {
          this.npcs = updatedList || [];
          if (this.npcs.length > 0) {
            this.populateForm(this.npcs[0]);
          } else {
            this.startNewNpc();
          }
        });
      },
      error: err => {
        this.isDeleting = false;
        this.showDeleteConfirm = false;
        this.toastService.show(`Error deleting NPC: ${err?.message || err}`, 'error');
      }
    });
  }
}
