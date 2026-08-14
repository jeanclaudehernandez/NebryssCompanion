import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
  inject
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';

import { DataService } from '../data.service';
import { AdminService } from '../admin.service';
import { CampaignService } from '../campaign.service';
import { ToastService } from '../toast.service';
import { NavigationHistoryService } from '../navigation-history.service';
import {
  Campaign,
  CampaignSession,
  Player,
  NPC,
  Location,
  Shop,
  BestiaryEntry,
  Letter,
  Item,
  Weapon,
  WeaponRule,
  AlteredState,
  Affliction
} from '../model';
import { AppView } from '../app-view.types';

export type EntityType = 'player' | 'npc' | 'location' | 'shop' | 'bestiary' | 'letter' | 'item' | 'weapon' | 'weaponrule' | 'weaponRule' | 'alteredstate' | 'alteredState' | 'affliction';

interface EntityLookup {
  players: Player[];
  npcs: NPC[];
  locations: Location[];
  shops: Shop[];
  bestiary: BestiaryEntry[];
  letters: Letter[];
  items: Item[];
  weapons: Weapon[];
  weaponRules: WeaponRule[];
  alteredStates: AlteredState[];
  afflictions: Affliction[];
}

const ENTITY_CONFIG: Record<string, { icon: string; cssClass: string; label: string }> = {
  player: { icon: 'person', cssClass: 'entity-chip--player', label: 'Player' },
  npc: { icon: 'badge', cssClass: 'entity-chip--npc', label: 'NPC' },
  location: { icon: 'place', cssClass: 'entity-chip--location', label: 'Location' },
  shop: { icon: 'storefront', cssClass: 'entity-chip--shop', label: 'Shop' },
  bestiary: { icon: 'pets', cssClass: 'entity-chip--bestiary', label: 'Creature' },
  letter: { icon: 'mail', cssClass: 'entity-chip--letter', label: 'Letter' },
  item: { icon: 'inventory_2', cssClass: 'entity-chip--item', label: 'Item' },
  weapon: { icon: 'gavel', cssClass: 'entity-chip--weapon', label: 'Weapon' },
  weaponrule: { icon: 'auto_fix_high', cssClass: 'entity-chip--weaponrule', label: 'Weapon Rule' },
  weaponRule: { icon: 'auto_fix_high', cssClass: 'entity-chip--weaponrule', label: 'Weapon Rule' },
  alteredstate: { icon: 'flash_on', cssClass: 'entity-chip--alteredstate', label: 'Altered State' },
  alteredState: { icon: 'flash_on', cssClass: 'entity-chip--alteredstate', label: 'Altered State' },
  affliction: { icon: 'healing', cssClass: 'entity-chip--affliction', label: 'Affliction' }
};

@Component({
  selector: 'app-session-admin-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './session-admin-page.component.html',
  styleUrls: ['./session-admin-page.component.css']
})
export class SessionAdminPageComponent implements OnInit, OnChanges {
  @Input() initialSession: CampaignSession | null = null;
  @Output() viewChange = new EventEmitter<AppView>();

  @ViewChild('contentTextarea') contentTextareaRef?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('conclusionTextarea') conclusionTextareaRef?: ElementRef<HTMLTextAreaElement>;

  private readonly destroyRef = inject(DestroyRef);
  private readonly dataService = inject(DataService);
  private readonly adminService = inject(AdminService);
  public readonly campaignService = inject(CampaignService);
  private readonly toastService = inject(ToastService);
  private readonly navigationHistory = inject(NavigationHistoryService);
  private readonly sanitizer = inject(DomSanitizer);

  isAdmin = false;
  isLoading = true;
  isSaving = false;
  isDeleting = false;
  showDeleteConfirm = false;

  // Session & Campaign state
  sessions: CampaignSession[] = [];
  campaigns: Campaign[] = [];
  selectedSessionId: number | null = null;
  selectedCampaignFilter: number | 'all' = 'all';
  searchTerm = '';

  // Form Fields
  id: number | null = null;
  _id: string | undefined = undefined;
  campaignId: number = 1;
  sessionId: number = 1;
  content: string = '';
  conclussion: string = '';
  playerVisibleBranches: string[] = [];
  customBranchInput: string = '';

  // Active Editor View: 'plan' | 'conclusion' | 'preview'
  activeSectionTab: 'plan' | 'conclusion' | 'preview' = 'plan';

  // Entity Picker State
  showEntityPicker = false;
  pickerEntityType: EntityType = 'npc';
  pickerSearchTerm = '';
  pickerTargetField: 'content' | 'conclussion' = 'content';

  // Lookup data for Entity Tags and Preview
  lookup: EntityLookup = {
    players: [],
    npcs: [],
    locations: [],
    shops: [],
    bestiary: [],
    letters: [],
    items: [],
    weapons: [],
    weaponRules: [],
    alteredStates: [],
    afflictions: []
  };

  get isEditing(): boolean {
    return this.id !== null || !!this._id;
  }

  get canSubmit(): boolean {
    if (!this.isAdmin || this.isSaving || this.isDeleting) {
      return false;
    }
    return this.sessionId > 0 && this.campaignId > 0 && !!this.content.trim();
  }

  get canDelete(): boolean {
    return this.isAdmin && this.isEditing && !this.isSaving && !this.isDeleting;
  }

  get isCurrentSessionConcluded(): boolean {
    return !!this.conclussion && this.conclussion.trim().length > 0;
  }

  get filteredSessions(): CampaignSession[] {
    let list = this.sessions.slice();

    if (this.selectedCampaignFilter !== 'all') {
      list = list.filter(s => s.campaignId === this.selectedCampaignFilter);
    }

    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase().trim();
      list = list.filter(s =>
        `session ${s.sessionId}`.includes(term) ||
        String(s.sessionId).includes(term) ||
        (s.content && s.content.toLowerCase().includes(term)) ||
        (s.conclussion && s.conclussion.toLowerCase().includes(term))
      );
    }

    return list.sort((a, b) => b.sessionId - a.sessionId);
  }

  get detectedBranches(): string[] {
    return this.extractBranches(this.content || '');
  }

  get parsedPlanPreview(): SafeHtml {
    return this.renderMarkdown(this.content || '', true, this.playerVisibleBranches, true);
  }

  get parsedConclusionPreview(): SafeHtml {
    return this.renderMarkdown(this.conclussion || '', true, this.playerVisibleBranches, true);
  }

  get currentSessionTitle(): string {
    return this.extractTitle(this.content || '', this.sessionId);
  }

  get conclusionSubtitle(): string {
    return this.extractConclusionSubtitle(this.conclussion || '');
  }

  ngOnInit(): void {
    this.navigationHistory.registerModalHandler(() => {
      if (this.showDeleteConfirm) {
        this.showDeleteConfirm = false;
        return true;
      }
      if (this.showEntityPicker) {
        this.showEntityPicker = false;
        return true;
      }
      return false;
    }, this.destroyRef);

    this.adminService.isAdmin$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(isAdmin => {
        this.isAdmin = isAdmin;
      });

    this.campaignService.selectedCampaign$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(activeCampaign => {
        if (activeCampaign) {
          this.selectedCampaignFilter = activeCampaign.id;
          if (!this.id) {
            this.campaignId = activeCampaign.id;
          }
        }
        this.loadAllData();
      });

    this.dataService.campaignSessions$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(sessions => {
        if (sessions && sessions.length > 0) {
          this.sessions = sessions;
        }
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialSession']) {
      if (this.initialSession) {
        this.populateForm(this.initialSession);
      } else {
        this.startNewSession();
      }
    }
  }

  loadAllData(): void {
    this.isLoading = true;

    forkJoin({
      sessions: this.dataService.getCampaignSessions(),
      campaigns: this.dataService.getCampaigns(),
      players: this.dataService.getPlayers(),
      npcs: this.dataService.getNpcs(),
      locations: this.dataService.getLocations(),
      shops: this.dataService.getShops(),
      bestiary: this.dataService.getBestiary(),
      letters: this.dataService.getLetters(),
      items: this.dataService.getItems(),
      weapons: this.dataService.getWeapons(),
      weaponRules: this.dataService.getWeaponRules(),
      alteredStates: this.dataService.getAlteredStates(),
      afflictions: this.dataService.getAfflictions()
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ sessions, campaigns, players, npcs, locations, shops, bestiary, letters, items, weapons, weaponRules, alteredStates, afflictions }) => {
          this.sessions = sessions || [];
          this.campaigns = campaigns || [];
          this.lookup = {
            players: players || [],
            npcs: npcs || [],
            locations: (locations as any)?.locations ?? locations ?? [],
            shops: shops || [],
            bestiary: bestiary || [],
            letters: letters || [],
            items: Array.isArray(items) ? items : (items?.items || []),
            weapons: weapons || [],
            weaponRules: weaponRules || [],
            alteredStates: alteredStates || [],
            afflictions: afflictions || []
          };

          const activeCampaign = this.campaignService.getSelectedCampaign();
          if (activeCampaign) {
            this.selectedCampaignFilter = activeCampaign.id;
            if (!this.id) {
              this.campaignId = activeCampaign.id;
            }
          }

          this.isLoading = false;

          if (this.initialSession) {
            this.populateForm(this.initialSession);
          } else if (!this.id) {
            this.startNewSession();
          }
        },
        error: err => {
          this.isLoading = false;
          this.toastService.show(`Failed to load data: ${err?.message || err}`, 'error');
        }
      });
  }

  populateForm(session: CampaignSession): void {
    this.id = session.id ?? null;
    this._id = session._id;
    this.campaignId = session.campaignId || 1;
    this.sessionId = session.sessionId || 1;
    this.content = session.content || '';
    this.conclussion = session.conclussion || '';
    this.playerVisibleBranches = Array.isArray(session.playerVisibleBranches)
      ? [...session.playerVisibleBranches]
      : [];
    this.selectedSessionId = session.id ?? session.sessionId;
  }

  startNewSession(): void {
    this.id = null;
    this._id = undefined;
    this.selectedSessionId = null;

    const activeCampaign = this.campaignService.getSelectedCampaign();
    this.campaignId = activeCampaign?.id ?? (this.campaigns[0]?.id || 1);

    // Auto-calculate next session number for this campaign
    const campaignSessions = this.sessions.filter(s => s.campaignId === this.campaignId);
    const maxSessionId = campaignSessions.reduce((max, s) => (s.sessionId > max ? s.sessionId : max), 0);
    this.sessionId = maxSessionId + 1;

    this.content = '';
    this.conclussion = '';
    this.playerVisibleBranches = [];
    this.customBranchInput = '';
    this.activeSectionTab = 'plan';
  }

  selectSession(session: CampaignSession): void {
    this.populateForm(session);
  }

  // --- Branch Management ---

  extractBranches(content: string): string[] {
    if (!content) return [];
    const text = this.normalizeNewlines(content);
    const branches: string[] = [];
    const regex = /#{1,5}\s*(?:Act\s+[IVXLCDM]+\s*[—–-]\s*)?Branch\s*([A-Z0-9]+)\b/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const branchCode = match[1].toUpperCase();
      const branchName = `Branch ${branchCode}`;
      if (!branches.includes(branchName)) {
        branches.push(branchName);
      }
    }
    return branches;
  }

  isBranchVisible(branchName: string): boolean {
    const cleanKey = branchName.trim().toLowerCase();
    const letterMatch = cleanKey.match(/(?:branch\s*)?([a-z0-9]+)/i);
    const coreKey = letterMatch ? letterMatch[1].toLowerCase() : cleanKey;

    return this.playerVisibleBranches.some(v => {
      const cleanV = v.trim().toLowerCase();
      if (cleanV === cleanKey) return true;
      if (cleanV === `branch ${cleanKey}`) return true;
      if (`branch ${cleanV}` === cleanKey) return true;
      const vMatch = cleanV.match(/(?:branch\s*)?([a-z0-9]+)/i);
      const coreV = vMatch ? vMatch[1].toLowerCase() : cleanV;
      return coreV === coreKey;
    });
  }

  toggleBranchVisibility(branchName: string): void {
    const isVis = this.isBranchVisible(branchName);
    if (isVis) {
      this.removeBranch(branchName);
    } else {
      if (!this.playerVisibleBranches.includes(branchName)) {
        this.playerVisibleBranches.push(branchName);
      }
    }
  }

  addCustomBranch(): void {
    const trimmed = this.customBranchInput.trim();
    if (!trimmed) return;
    const formatted = trimmed.toLowerCase().startsWith('branch') ? trimmed : `Branch ${trimmed.toUpperCase()}`;
    if (!this.playerVisibleBranches.some(b => b.toLowerCase() === formatted.toLowerCase())) {
      this.playerVisibleBranches.push(formatted);
    }
    this.customBranchInput = '';
  }

  removeBranch(branchName: string): void {
    const cleanKey = branchName.trim().toLowerCase();
    const letterMatch = cleanKey.match(/(?:branch\s*)?([a-z0-9]+)/i);
    const coreKey = letterMatch ? letterMatch[1].toLowerCase() : cleanKey;

    this.playerVisibleBranches = this.playerVisibleBranches.filter(v => {
      const cleanV = v.trim().toLowerCase();
      if (cleanV === cleanKey) return false;
      const vMatch = cleanV.match(/(?:branch\s*)?([a-z0-9]+)/i);
      const coreV = vMatch ? vMatch[1].toLowerCase() : cleanV;
      return coreV !== coreKey;
    });
  }

  // --- Snippet Inserters & Entity Tagging ---

  openEntityPicker(type: EntityType, targetField: 'content' | 'conclussion'): void {
    this.pickerEntityType = type;
    this.pickerTargetField = targetField;
    this.pickerSearchTerm = '';
    this.showEntityPicker = true;
  }

  closeEntityPicker(): void {
    this.showEntityPicker = false;
  }

  get entityPickerList(): { id: number; name: string; subtitle?: string }[] {
    const term = this.pickerSearchTerm.toLowerCase().trim();
    const normType = String(this.pickerEntityType).toLowerCase();

    switch (normType) {
      case 'player':
        return this.lookup.players
          .filter(p => !term || p.name.toLowerCase().includes(term) || (p.race && p.race.toLowerCase().includes(term)) || (p.origin && p.origin.toLowerCase().includes(term)))
          .map(p => ({ id: p.id, name: p.name, subtitle: `${p.race || ''}${p.origin ? ' • ' + p.origin : ''}`.trim() || 'Player Character' }));
      case 'npc':
        return this.lookup.npcs
          .filter(n => !term || n.name.toLowerCase().includes(term) || (n.faction && n.faction.toLowerCase().includes(term)) || (n.role && n.role.toLowerCase().includes(term)))
          .map(n => ({ id: n.id, name: n.name, subtitle: `${n.faction || 'Independent'} ${n.role ? '• ' + n.role : ''}` }));
      case 'location':
        return this.lookup.locations
          .filter(l => !term || l.name.toLowerCase().includes(term) || (l.faction && l.faction.toLowerCase().includes(term)))
          .map(l => ({ id: l.id, name: l.name, subtitle: l.faction || 'Location' }));
      case 'shop':
        return this.lookup.shops
          .filter(s => !term || s.name.toLowerCase().includes(term) || (s.location && s.location.toLowerCase().includes(term)))
          .map(s => ({ id: s.id, name: s.name, subtitle: s.location || 'Merchant' }));
      case 'bestiary':
        return this.lookup.bestiary
          .filter(b => !term || b.name.toLowerCase().includes(term) || (b.faction && b.faction.toLowerCase().includes(term)) || (b.subgroup && b.subgroup.toLowerCase().includes(term)))
          .map(b => ({ id: b.id, name: b.name, subtitle: `${b.faction || 'Creature'}${b.subgroup ? ' • ' + b.subgroup : ''} (PR ${b.pr})` }));
      case 'letter':
        return this.lookup.letters
          .filter(l => !term || ((l.subject || '').toLowerCase().includes(term)) || ((l.senderName || '').toLowerCase().includes(term)))
          .map(l => ({ id: l.id, name: l.subject || `Letter #${l.id}`, subtitle: l.senderName ? `From: ${l.senderName} (${l.date})` : `Date: ${l.date}` }));
      case 'item':
        return this.lookup.items
          .filter(i => !term || ((i.name || '').toLowerCase().includes(term)) || ((i.type || '').toLowerCase().includes(term)))
          .map(i => ({ id: i.id ?? 0, name: i.name || 'Item', subtitle: `${i.type || 'item'} • ${i.price || 0} Mistrals` }));
      case 'weapon':
        return this.lookup.weapons
          .filter(w => !term || ((w.name || '').toLowerCase().includes(term)))
          .map(w => ({ id: w.id ?? 0, name: w.name || 'Weapon', subtitle: `${w.price || 0} Mistrals` }));
      case 'weaponrule':
        return this.lookup.weaponRules
          .filter(r => !term || ((r.name || '').toLowerCase().includes(term)) || ((r.effect || '').toLowerCase().includes(term)))
          .map(r => ({ id: r.id ?? 0, name: r.name || 'Rule', subtitle: r.effect || '' }));
      case 'alteredstate':
        return this.lookup.alteredStates
          .filter(s => !term || ((s.name || '').toLowerCase().includes(term)) || ((s.effect || '').toLowerCase().includes(term)))
          .map(s => ({ id: s.id ?? 0, name: s.name || 'State', subtitle: s.effect || '' }));
      case 'affliction':
        return this.lookup.afflictions
          .filter(a => !term || ((a.name || '').toLowerCase().includes(term)) || ((a.effect || '').toLowerCase().includes(term)))
          .map(a => ({ id: Number(a.id) || 0, name: a.name || 'Affliction', subtitle: a.effect || a.treatment || '' }));
      default:
        return [];
    }
  }

  insertEntityTag(entity: { id: number; name: string }): void {
    const tag = `@${this.pickerEntityType}[${entity.id}]`;
    this.insertTextAtCursor(this.pickerTargetField, tag);
    this.closeEntityPicker();
    this.toastService.show(`Inserted tag: ${tag} (${entity.name})`, 'info');
  }

  insertSnippet(snippetType: string, targetField: 'content' | 'conclussion'): void {
    let snippet = '';
    switch (snippetType) {
      case 'title':
        snippet = `\n### Session ${this.sessionId}: Title\n`;
        break;
      case 'conclusion-title':
        snippet = `\n### Conclusion: Subtitle / Summary\n`;
        break;
      case 'branch-a':
        snippet = `\n#### Act II — Branch A: The Path of Action\nDescription of this branching narrative...\n`;
        break;
      case 'branch-b':
        snippet = `\n#### Act II — Branch B: The Alternate Path\nDescription of alternate route...\n`;
        break;
      case 'phase':
        snippet = `\n- **Phase 1 (Infiltration):** Primary phase actions.\n- **Phase 2 (Confrontation):** Secondary phase.\n`;
        break;
      case 'primary-obj':
        snippet = `\n- **Primary Objective:** Complete the main mission.\n`;
        break;
      case 'secondary-obj':
        snippet = `\n- **Secondary Objective:** Secure bonus intelligence or relics.\n`;
        break;
      case 'branch-decision':
        snippet = `\n- **Branching Decision:** Choose whether to ally with faction A or faction B.\n`;
        break;
      case 'outcome-a':
        snippet = `\n- **Outcome A:** Consequences if Branch A was chosen.\n`;
        break;
      case 'outcome-b':
        snippet = `\n- **Outcome B:** Consequences if Branch B was chosen.\n`;
        break;
      case 'divider':
        snippet = `\n---\n`;
        break;
      case 'bold':
        snippet = `**bold text**`;
        break;
      case 'italic':
        snippet = `*italic text*`;
        break;
    }

    if (snippet) {
      this.insertTextAtCursor(targetField, snippet);
    }
  }

  private insertTextAtCursor(targetField: 'content' | 'conclussion', textToInsert: string): void {
    const textarea = targetField === 'content'
      ? this.contentTextareaRef?.nativeElement
      : this.conclusionTextareaRef?.nativeElement;

    if (!textarea) {
      if (targetField === 'content') {
        this.content += textToInsert;
      } else {
        this.conclussion += textToInsert;
      }
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = textarea.value;

    const newVal = currentVal.substring(0, start) + textToInsert + currentVal.substring(end);

    if (targetField === 'content') {
      this.content = newVal;
    } else {
      this.conclussion = newVal;
    }

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + textToInsert.length, start + textToInsert.length);
    }, 0);
  }

  // --- CRUD Actions ---

  saveSession(): void {
    if (!this.isAdmin) {
      this.toastService.show('Admin privileges required to manage Sessions.', 'error');
      return;
    }

    if (!this.sessionId || this.sessionId <= 0) {
      this.toastService.show('Session Number must be a positive integer.', 'error');
      return;
    }

    if (!this.content.trim()) {
      this.toastService.show('Session Content / Plan is required.', 'error');
      return;
    }

    this.isSaving = true;

    let targetId = this.id;
    if (targetId === null || targetId === 0) {
      const maxId = this.sessions.reduce((max, s) => ((s.id || 0) > max ? (s.id || 0) : max), 0);
      targetId = maxId + 1;
    }

    const sessionData: CampaignSession = {
      id: targetId,
      campaignId: Number(this.campaignId),
      sessionId: Number(this.sessionId),
      content: this.content.trim(),
      conclussion: this.conclussion.trim(),
      playerVisibleBranches: [...this.playerVisibleBranches]
    };

    if (this._id) {
      sessionData._id = this._id;
    }

    if (this.isEditing) {
      this.dataService.updateCampaignSession(sessionData).subscribe({
        next: saved => {
          this.isSaving = false;
          this.toastService.show(`Session ${saved.sessionId} updated successfully!`, 'success');
          this.dataService.refreshCampaignSessions().subscribe(updatedList => {
            this.sessions = updatedList || [];
            this.populateForm(saved);
          });
        },
        error: err => {
          this.isSaving = false;
          this.toastService.show(`Error updating Session: ${err?.message || err}`, 'error');
        }
      });
    } else {
      this.dataService.createCampaignSession(sessionData).subscribe({
        next: created => {
          this.isSaving = false;
          this.toastService.show(`Session ${created.sessionId} created successfully!`, 'success');
          this.dataService.refreshCampaignSessions().subscribe(updatedList => {
            this.sessions = updatedList || [];
            this.populateForm(created);
          });
        },
        error: err => {
          this.isSaving = false;
          this.toastService.show(`Error creating Session: ${err?.message || err}`, 'error');
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
    const targetId = this.id || this.sessionId;
    if (!this.canDelete || !targetId) return;

    this.isDeleting = true;
    const deletedSessionNum = this.sessionId;

    this.dataService.deleteCampaignSession(targetId).subscribe({
      next: () => {
        this.isDeleting = false;
        this.showDeleteConfirm = false;
        this.toastService.show(`Session ${deletedSessionNum} deleted successfully!`, 'info');
        this.dataService.refreshCampaignSessions().subscribe(updatedList => {
          this.sessions = updatedList || [];
          if (this.sessions.length > 0) {
            this.populateForm(this.sessions[0]);
          } else {
            this.startNewSession();
          }
        });
      },
      error: err => {
        this.isDeleting = false;
        this.showDeleteConfirm = false;
        this.toastService.show(`Error deleting Session: ${err?.message || err}`, 'error');
      }
    });
  }

  backToChronicles(): void {
    this.viewChange.emit('campaignSessions');
  }

  // --- Markdown and HTML Parsing ---

  private normalizeNewlines(text: string): string {
    if (!text) return '';
    return text
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\n')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
  }

  extractTitle(content: string, sessionId: number): string {
    if (!content) return `Session ${sessionId}`;
    const text = this.normalizeNewlines(content);
    const match = text.match(/^#{1,3}\s*(?:Session\s*\d+\s*:\s*)?(.*)$/m);
    if (match && match[1]?.trim()) {
      return match[1].trim();
    }
    return `Session ${sessionId}`;
  }

  private extractConclusionSubtitle(conclussion: string): string {
    if (!conclussion) return '';
    const text = this.normalizeNewlines(conclussion);
    const match = text.match(/^#{1,3}\s*(?:Conclusion\s*:\s*)(.*)$/m);
    if (match && match[1]?.trim()) {
      return match[1].trim();
    }
    return '';
  }

  private renderMarkdown(
    rawText: string,
    stripMainHeader = true,
    playerVisibleBranches: string[] = [],
    isAdmin = true
  ): SafeHtml {
    if (!rawText || !rawText.trim()) {
      return this.sanitizer.bypassSecurityTrustHtml('');
    }

    let text = this.normalizeNewlines(rawText).trim();

    if (stripMainHeader) {
      text = text.replace(/^#{1,3}\s*Session\s*\d+\s*:[^\n]*\n*/i, '');
      text = text.replace(/^#{1,3}\s*Conclusion\s*:[^\n]*\n*/i, '');
    }

    const lines = text.split('\n');
    const resultHtml: string[] = [];
    let inList = false;
    let isBranchActive = true;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

      if (!trimmed) {
        if (inList) {
          resultHtml.push('</ul>');
          inList = false;
        }
        continue;
      }

      // Horizontal Divider
      if (/^---+$/.test(trimmed) || /^___+$/.test(trimmed)) {
        if (inList) {
          resultHtml.push('</ul>');
          inList = false;
        }
        if (isBranchActive) {
          resultHtml.push('<div class="narrative-hr"><span class="hr-diamond"></span></div>');
        }
        isBranchActive = true;
        continue;
      }

      // Branch Headings
      const actBranchMatch = trimmed.match(/^#{1,5}\s*(?:Act\s+([IVXLCDM]+)\s*[—–-]\s*)?Branch\s*([A-Z0-9]+)\s*:\s*(.*)$/i);
      if (actBranchMatch) {
        if (inList) {
          resultHtml.push('</ul>');
          inList = false;
        }
        const actNum = actBranchMatch[1] ? actBranchMatch[1].toUpperCase() : '';
        const branchCode = actBranchMatch[2].toUpperCase();
        const branchName = `Branch ${branchCode}`;
        const title = this.formatInline(actBranchMatch[3]);
        const isPlayerVis = this.isBranchVisible(branchName);

        isBranchActive = isAdmin || isPlayerVis;

        if (isBranchActive) {
          const actBadge = actNum ? `<span class="act-badge">ACT ${actNum}</span> ` : '';
          const branchBadge = `<span class="branch-badge">BRANCH ${branchCode}</span> `;
          const titleSpan = `<span class="heading-text">${title}</span>`;
          const gmPill = isPlayerVis
            ? `<span class="branch-gm-pill branch-gm-pill--visible"><span class="material-icons pill-icon">visibility</span> Visible to Players</span>`
            : `<span class="branch-gm-pill branch-gm-pill--hidden"><span class="material-icons pill-icon">visibility_off</span> GM Only</span>`;

          resultHtml.push(`<h3 class="narrative-h3 heading--branch">${actBadge}${branchBadge}${titleSpan} ${gmPill}</h3>`);
        }
        continue;
      }

      // Standard Headings
      if (trimmed.startsWith('##### ')) {
        if (inList) { resultHtml.push('</ul>'); inList = false; }
        isBranchActive = true;
        resultHtml.push(this.parseHeading(trimmed.substring(6), 5));
        continue;
      }
      if (trimmed.startsWith('#### ')) {
        if (inList) { resultHtml.push('</ul>'); inList = false; }
        isBranchActive = true;
        resultHtml.push(this.parseHeading(trimmed.substring(5), 4));
        continue;
      }
      if (trimmed.startsWith('### ')) {
        if (inList) { resultHtml.push('</ul>'); inList = false; }
        isBranchActive = true;
        resultHtml.push(this.parseHeading(trimmed.substring(4), 3));
        continue;
      }
      if (trimmed.startsWith('## ')) {
        if (inList) { resultHtml.push('</ul>'); inList = false; }
        isBranchActive = true;
        resultHtml.push(this.parseHeading(trimmed.substring(3), 2));
        continue;
      }

      if (!isBranchActive) continue;

      // Bullet & Numbered Lists
      const listMatch = trimmed.match(/^(?:[-*]|\d+\.)\s+(.*)$/);
      if (listMatch) {
        if (!inList) {
          resultHtml.push('<ul class="narrative-list">');
          inList = true;
        }
        resultHtml.push(this.parseListItem(listMatch[1]));
        continue;
      }

      if (inList) {
        resultHtml.push('</ul>');
        inList = false;
      }

      const formatted = this.formatInline(trimmed);
      resultHtml.push(`<p class="narrative-p">${formatted}</p>`);
    }

    if (inList) {
      resultHtml.push('</ul>');
    }

    return this.sanitizer.bypassSecurityTrustHtml(resultHtml.join(''));
  }

  private parseHeading(content: string, level: number): string {
    const formatted = this.formatInline(content);
    return `<h${level} class="narrative-h${level}">${formatted}</h${level}>`;
  }

  private parseListItem(rawItem: string): string {
    // Check for Phase
    const phaseMatch = rawItem.match(/^\*\*Phase\s*(\d+)\s*(?:\(([^)]+)\))?:\*\*\s*(.*)$/i);
    if (phaseMatch) {
      const num = phaseMatch[1];
      const phaseTitle = phaseMatch[2] ? ` (${this.formatInline(phaseMatch[2])})` : '';
      const rest = this.formatInline(phaseMatch[3]);
      return `<li class="narrative-list-item item--phase">`
        + `<span class="narrative-tag tag--phase">PHASE ${num}${phaseTitle}</span> `
        + `<span class="item-body">${rest}</span>`
        + `</li>`;
    }

    // Check for Primary Objective
    const primaryMatch = rawItem.match(/^\*\*Primary Objective:\*\*\s*(.*)$/i);
    if (primaryMatch) {
      const rest = this.formatInline(primaryMatch[1]);
      return `<li class="narrative-list-item item--primary">`
        + `<span class="narrative-tag tag--primary"><span class="material-icons tag-icon">track_changes</span> Primary Objective</span> `
        + `<span class="item-body">${rest}</span>`
        + `</li>`;
    }

    // Check for Secondary Objective
    const secondaryMatch = rawItem.match(/^\*\*Secondary Objective:\*\*\s*(.*)$/i);
    if (secondaryMatch) {
      const rest = this.formatInline(secondaryMatch[1]);
      return `<li class="narrative-list-item item--secondary">`
        + `<span class="narrative-tag tag--secondary"><span class="material-icons tag-icon">flag</span> Secondary Objective</span> `
        + `<span class="item-body">${rest}</span>`
        + `</li>`;
    }

    // Check for Branching Decision
    const branchingMatch = rawItem.match(/^\*\*Branching Decision:\*\*\s*(.*)$/i);
    if (branchingMatch) {
      const rest = this.formatInline(branchingMatch[1]);
      return `<li class="narrative-list-item item--branching">`
        + `<span class="narrative-tag tag--branching"><span class="material-icons tag-icon">call_split</span> Branching Decision</span> `
        + `<span class="item-body">${rest}</span>`
        + `</li>`;
    }

    // Check for Outcome A / Outcome B
    const outcomeMatch = rawItem.match(/^\*\*Outcome\s*([A-Z0-9]+)\s*(?:\(([^)]+)\))?\s*:\*\*\s*(.*)$/i);
    if (outcomeMatch) {
      const letter = outcomeMatch[1].toUpperCase();
      const label = outcomeMatch[2] ? ` (${outcomeMatch[2]})` : '';
      const rest = this.formatInline(outcomeMatch[3]);
      const tagClass = letter === 'A' ? 'tag--outcome-a' : 'tag--outcome-b';
      return `<li class="narrative-list-item item--outcome">`
        + `<span class="narrative-tag ${tagClass}">OUTCOME ${letter}${label}</span> `
        + `<span class="item-body">${rest}</span>`
        + `</li>`;
    }

    const formatted = this.formatInline(rawItem);
    return `<li class="narrative-list-item">${formatted}</li>`;
  }

  private formatInline(text: string): string {
    let escaped = this.escapeHtml(text);

    // Bold (**text**)
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong class="narrative-bold">$1</strong>');

    // Italic (*text*)
    escaped = escaped.replace(/(^|[^*])\*([^*]+)\*([^*]|$)/g, '$1<em class="narrative-italic">$2</em>$3');

    // Entity Chips: @(player|npc|location|shop|bestiary|letter|item|weapon|weaponrule|weaponRule|alteredstate|alteredState|affliction)[tagContent]
    escaped = escaped.replace(
      /@(player|npc|location|shop|bestiary|letter|item|weapon|weaponrule|weaponRule|alteredstate|alteredState|affliction)\[([^\]]+)\]/gi,
      (_match, rawType: string, tagContent: string) => {
        const type = (rawType.toLowerCase() === 'weaponrules' ? 'weaponrule' : (rawType.toLowerCase() === 'alteredstates' ? 'alteredstate' : rawType.toLowerCase())) as EntityType;
        const { id, name } = this.resolveEntity(type, tagContent.trim());
        const config = ENTITY_CONFIG[type] || { icon: 'bookmark', cssClass: 'entity-chip--item', label: 'Entity' };

        return `<span class="entity-chip ${config.cssClass}" title="${config.label}: ${name} (ID: ${id})">${name}</span>`;
      }
    );

    return escaped;
  }

  private resolveEntity(type: EntityType, tagContent: string): { id: number; name: string } {
    let rawId: number | null = null;
    let labelHint: string | null = null;

    const colonIndex = tagContent.indexOf(':');
    if (colonIndex !== -1) {
      const idPart = tagContent.substring(0, colonIndex).trim();
      const parsedId = parseInt(idPart, 10);
      if (!isNaN(parsedId)) rawId = parsedId;
      labelHint = tagContent.substring(colonIndex + 1).trim();
    } else {
      const parsedId = parseInt(tagContent, 10);
      if (!isNaN(parsedId)) {
        rawId = parsedId;
      } else {
        labelHint = tagContent;
      }
    }

    const normType = String(type).toLowerCase();

    switch (normType) {
      case 'player': {
        const player = rawId !== null
          ? this.lookup.players.find(p => p.id === rawId)
          : this.lookup.players.find(p => p.name.toLowerCase() === (labelHint || '').toLowerCase());
        return { id: player?.id ?? rawId ?? 0, name: player?.name ?? labelHint ?? `Player #${rawId ?? tagContent}` };
      }
      case 'npc': {
        const npc = rawId !== null
          ? this.lookup.npcs.find(n => n.id === rawId)
          : this.lookup.npcs.find(n => n.name.toLowerCase() === (labelHint || '').toLowerCase());
        return { id: npc?.id ?? rawId ?? 0, name: npc?.name ?? labelHint ?? `NPC #${rawId ?? tagContent}` };
      }
      case 'location': {
        const location = rawId !== null
          ? this.lookup.locations.find(l => l.id === rawId)
          : this.lookup.locations.find(l => l.name.toLowerCase() === (labelHint || '').toLowerCase());
        return { id: location?.id ?? rawId ?? 0, name: location?.name ?? labelHint ?? `Location #${rawId ?? tagContent}` };
      }
      case 'shop': {
        const shop = rawId !== null
          ? this.lookup.shops.find(s => s.id === rawId)
          : this.lookup.shops.find(s => s.name.toLowerCase() === (labelHint || '').toLowerCase());
        return { id: shop?.id ?? rawId ?? 0, name: shop?.name ?? labelHint ?? `Shop #${rawId ?? tagContent}` };
      }
      case 'bestiary': {
        const creature = rawId !== null
          ? this.lookup.bestiary.find(b => b.id === rawId)
          : this.lookup.bestiary.find(b => b.name.toLowerCase() === (labelHint || '').toLowerCase());
        return { id: creature?.id ?? rawId ?? 0, name: creature?.name ?? labelHint ?? `Creature #${rawId ?? tagContent}` };
      }
      case 'letter': {
        const letter = rawId !== null
          ? this.lookup.letters.find(l => l.id === rawId)
          : this.lookup.letters.find(l => (l.subject || '').toLowerCase() === (labelHint || '').toLowerCase());
        return { id: letter?.id ?? rawId ?? 0, name: letter?.subject ?? labelHint ?? `Letter #${rawId ?? tagContent}` };
      }
      case 'item': {
        const item = rawId !== null
          ? this.lookup.items.find(i => i.id === rawId)
          : this.lookup.items.find(i => (i.name || '').toLowerCase() === (labelHint || '').toLowerCase());
        return { id: item?.id ?? rawId ?? 0, name: item?.name ?? labelHint ?? `Item #${rawId ?? tagContent}` };
      }
      case 'weapon': {
        const weapon = rawId !== null
          ? this.lookup.weapons.find(w => w.id === rawId)
          : this.lookup.weapons.find(w => (w.name || '').toLowerCase() === (labelHint || '').toLowerCase());
        return { id: weapon?.id ?? rawId ?? 0, name: weapon?.name ?? labelHint ?? `Weapon #${rawId ?? tagContent}` };
      }
      case 'weaponrule': {
        const rule = rawId !== null
          ? this.lookup.weaponRules.find(r => r.id === rawId)
          : this.lookup.weaponRules.find(r => (r.name || '').toLowerCase() === (labelHint || '').toLowerCase());
        return { id: rule?.id ?? rawId ?? 0, name: rule?.name ?? labelHint ?? `Rule #${rawId ?? tagContent}` };
      }
      case 'alteredstate': {
        const state = rawId !== null
          ? this.lookup.alteredStates.find(s => s.id === rawId)
          : this.lookup.alteredStates.find(s => (s.name || '').toLowerCase() === (labelHint || '').toLowerCase());
        return { id: state?.id ?? rawId ?? 0, name: state?.name ?? labelHint ?? `State #${rawId ?? tagContent}` };
      }
      case 'affliction': {
        const aff = rawId !== null
          ? this.lookup.afflictions.find(a => String(a.id) === String(rawId))
          : this.lookup.afflictions.find(a => (a.name || '').toLowerCase() === (labelHint || '').toLowerCase());
        return { id: aff ? Number(aff.id) : (rawId ?? 0), name: aff?.name ?? labelHint ?? `Affliction #${rawId ?? tagContent}` };
      }
      default:
        return { id: rawId ?? 0, name: labelHint ?? tagContent };
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  getCampaignName(cId: number): string {
    const c = this.campaigns.find(camp => camp.id === cId);
    return c ? c.name : `Campaign #${cId}`;
  }
}
