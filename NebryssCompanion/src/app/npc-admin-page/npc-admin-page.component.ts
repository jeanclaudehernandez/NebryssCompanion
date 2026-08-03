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

  // Form Fields
  id: number | null = null;
  name = '';
  faction = '';
  subgroup = '';
  role = '';
  personality = '';
  mission = '';
  methods = '';
  location = '';
  reputation = '';
  backstory = '';
  bestiaryId: number | null = null;
  wargear: Array<{ name: string; description: string }> = [];

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
    this.personality = '';
    this.mission = '';
    this.methods = '';
    this.location = '';
    this.reputation = '';
    this.backstory = '';
    this.bestiaryId = null;
    this.wargear = [];
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
    this.personality = npc.personality || '';
    this.mission = npc.mission || '';
    this.methods = npc.methods || '';
    this.location = npc.location || '';
    this.reputation = npc.reputation || '';
    this.backstory = npc.backstory || '';
    this.bestiaryId = typeof npc.bestiaryId === 'number' ? npc.bestiaryId : null;
    this.wargear = (npc.wargear || []).map(w => ({ name: w.name || '', description: w.description || '' }));
    this.showDeleteConfirm = false;
  }

  addWargear(): void {
    this.wargear.push({ name: '', description: '' });
  }

  removeWargear(index: number): void {
    this.wargear.splice(index, 1);
  }

  saveNpc(): void {
    if (!this.name.trim()) {
      this.toastService.show('NPC Name is required.', 'info');
      return;
    }

    this.isSaving = true;

    const npcData: NPC = {
      id: this.id ?? 0,
      name: this.name.trim(),
      faction: this.faction.trim() || 'Independent',
      subgroup: this.subgroup.trim(),
      role: this.role.trim() || undefined,
      personality: this.personality.trim() || undefined,
      mission: this.mission.trim() || undefined,
      methods: this.methods.trim() || undefined,
      location: this.location.trim() || undefined,
      reputation: this.reputation.trim() || undefined,
      backstory: this.backstory.trim() || undefined,
      bestiaryId: this.bestiaryId !== null ? Number(this.bestiaryId) : undefined,
      wargear: this.wargear.filter(w => w.name.trim().length > 0)
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
