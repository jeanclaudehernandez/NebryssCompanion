import {
  Component,
  DestroyRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';

import { DataService } from '../data.service';
import { AdminService } from '../admin.service';
import { CampaignService } from '../campaign.service';
import { ActivePlayerService } from '../active-player.service';
import {
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
import { AdminEditorSession } from '../admin-editor.models';

export function toRomanNumeral(num: number): string {
  if (!num || num <= 0 || isNaN(num)) {
    return String(num || 0);
  }
  const romanMap: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I']
  ];
  let result = '';
  let n = Math.floor(num);
  for (const [val, roman] of romanMap) {
    while (n >= val) {
      result += roman;
      n -= val;
    }
  }
  return result || String(num);
}

interface ParsedSession {
  session: CampaignSession;
  sessionRoman: string;
  titleHtml: SafeHtml;
  conclusionTitleHtml: SafeHtml;
  rawTitle: string;
  parsedContent: SafeHtml;
  parsedConclusion: SafeHtml;
  isConcluded: boolean;
  isLatest: boolean;
  expanded: boolean;
  branches: string[];
  playerVisibleBranches: string[];
  visibleBranchesCount: number;
  playerBranchesLabel: string;
}

type EntityType = 'player' | 'npc' | 'location' | 'shop' | 'bestiary' | 'letter' | 'item' | 'weapon' | 'weaponrule' | 'weaponRule' | 'alteredstate' | 'alteredState' | 'affliction';

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
  selector: 'app-campaign-sessions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './campaign-sessions.component.html',
  styleUrls: ['./campaign-sessions.component.css']
})
export class CampaignSessionsComponent implements OnInit, OnChanges {
  @Input() initialSessionId: number | null = null;
  @Input() initialExpandedSessionIds: number[] | null = null;
  @Input() initialScrollY: number | null = null;

  @Output() viewChange = new EventEmitter<AppView>();
  @Output() openAdminEditor = new EventEmitter<AdminEditorSession>();
  @Output() navigateToNpc = new EventEmitter<{ npcName?: string }>();
  @Output() navigateToLocation = new EventEmitter<{ locationName: string; backTarget: string | null }>();
  @Output() navigateToShop = new EventEmitter<{ shopName?: string }>();
  @Output() navigateToBestiary = new EventEmitter<number>();
  @Output() navigateToItem = new EventEmitter<{ itemName?: string; itemId?: number }>();
  @Output() navigateToLetter = new EventEmitter<{ letterId?: number; letterSubject?: string }>();
  @Output() sessionStateChange = new EventEmitter<{ selectedSessionId: number | null; expandedSessionIds: number[]; scrollY: number }>();

  private readonly destroyRef = inject(DestroyRef);

  parsedSessions: ParsedSession[] = [];
  isAdmin = false;
  isLoading = true;
  hasSessions = false;
  sortDirection: 'asc' | 'desc' = 'asc';

  selectedSessionId: number | null = null;
  expandedSessionIds: number[] = [];
  currentScrollY = 0;
  private scrollDebounceTimer: any = null;
  private hasAutoScrolledOnEntry = false;

  private lookup: EntityLookup = {
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

  constructor(
    private readonly dataService: DataService,
    private readonly adminService: AdminService,
    private readonly campaignService: CampaignService,
    private readonly activePlayerService: ActivePlayerService,
    private readonly sanitizer: DomSanitizer
  ) { }

  ngOnInit(): void {
    this.adminService.isAdmin$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(isAdmin => {
        this.isAdmin = isAdmin;
        this.rebuildVisibleSessions();
      });

    this.campaignService.selectedCampaign$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(campaign => {
        this.hasAutoScrolledOnEntry = false;
        this.loadSessionsForCampaign(campaign?.id);
      });

    this.dataService.campaignSessions$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(allSessions => {
        const campaign = this.campaignService.getSelectedCampaign();
        const campaignId = campaign?.id;
        const filtered = campaignId
          ? (allSessions || []).filter(s => s.campaignId === campaignId)
          : (allSessions || []);

        this.allSessions = filtered.slice();
        this.sortSessions();
        this.rebuildVisibleSessions();

        if (!this.isLoading) {
          this.handleInitialScrollRestoration(campaignId);
        }
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialSessionId'] || changes['initialExpandedSessionIds']) {
      if (this.initialExpandedSessionIds && this.initialExpandedSessionIds.length > 0) {
        this.expandedSessionIds = [...this.initialExpandedSessionIds];
      } else if (this.initialSessionId) {
        this.selectedSessionId = this.initialSessionId;
        if (!this.expandedSessionIds.includes(this.initialSessionId)) {
          this.expandedSessionIds = [this.initialSessionId];
        }
      }
      if (this.parsedSessions.length > 0) {
        this.syncExpandedStateToParsedSessions();
      }
    }

    if (changes['initialScrollY'] && this.initialScrollY != null && this.initialScrollY > 0) {
      this.currentScrollY = this.initialScrollY;
      if (!this.isLoading && this.hasSessions) {
        this.restoreScrollPosition(this.initialScrollY);
      }
    }
  }

  private getStorageKey(campaignId?: number): string {
    const id = campaignId ?? this.campaignService.getSelectedCampaign()?.id ?? 0;
    return `nebryss_campaign_session_state_${id}`;
  }

  private saveStateToStorage(): void {
    const campaignId = this.campaignService.getSelectedCampaign()?.id;
    const state = {
      selectedSessionId: this.selectedSessionId,
      expandedSessionIds: this.expandedSessionIds,
      scrollY: this.currentScrollY
    };
    try {
      sessionStorage.setItem(this.getStorageKey(campaignId), JSON.stringify(state));
      localStorage.setItem(this.getStorageKey(campaignId), JSON.stringify(state));
    } catch {}
  }

  private loadSavedState(campaignId?: number): { selectedSessionId: number | null; expandedSessionIds: number[]; scrollY: number } | null {
    try {
      const key = this.getStorageKey(campaignId);
      const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {}
    return null;
  }

  private loadSessionsForCampaign(campaignId?: number): void {
    this.isLoading = true;

    forkJoin({
      sessions: this.dataService.getCampaignSessions(campaignId),
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
        next: ({ sessions, players, npcs, locations, shops, bestiary, letters, items, weapons, weaponRules, alteredStates, afflictions }) => {
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

          this.allSessions = (sessions || []).slice();
          this.sortSessions();

          this.rebuildVisibleSessions();
          this.isLoading = false;

          this.handleInitialScrollRestoration(campaignId);
        },
        error: () => {
          this.isLoading = false;
        }
      });
  }

  private allSessions: CampaignSession[] = [];

  private sortSessions(): void {
    if (this.sortDirection === 'asc') {
      this.allSessions.sort((a, b) => a.sessionId - b.sessionId);
    } else {
      this.allSessions.sort((a, b) => b.sessionId - a.sessionId);
    }
  }

  toggleSortDirection(): void {
    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    this.sortSessions();
    this.rebuildVisibleSessions();
  }

  private handleInitialScrollRestoration(campaignId?: number): void {
    if (this.hasAutoScrolledOnEntry || !this.hasSessions) {
      return;
    }

    const savedState = this.loadSavedState(campaignId);
    const targetScrollY = this.initialScrollY ?? (savedState?.scrollY != null && savedState.scrollY > 0 ? savedState.scrollY : null);

    if (targetScrollY !== null && targetScrollY > 0) {
      this.restoreScrollPosition(targetScrollY);
    } else if (this.selectedSessionId) {
      this.scrollToSession(this.selectedSessionId);
    } else {
      this.hasAutoScrolledOnEntry = true;
      this.scrollToBottomIfOverflowing();
    }
  }

  private restoreScrollPosition(targetScrollY: number): void {
    if (targetScrollY == null || targetScrollY <= 0) {
      return;
    }
    this.hasAutoScrolledOnEntry = true;

    // Run after angular change detection and browser layout
    setTimeout(() => {
      window.scrollTo({
        top: targetScrollY,
        behavior: 'instant' as ScrollBehavior
      });

      // Secondary check in case content or images caused layout shift
      setTimeout(() => {
        const current = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
        if (Math.abs(current - targetScrollY) > 30) {
          window.scrollTo({
            top: targetScrollY,
            behavior: 'instant' as ScrollBehavior
          });
        }
      }, 100);
    }, 60);
  }

  private scrollToSession(sessionId: number): void {
    this.hasAutoScrolledOnEntry = true;
    setTimeout(() => {
      const el = document.getElementById(`session-card-${sessionId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 80);
  }

  private scrollToBottomIfOverflowing(): void {
    setTimeout(() => {
      const scrollHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
      );
      const clientHeight = window.innerHeight || document.documentElement.clientHeight;

      if (scrollHeight > clientHeight + 20) {
        window.scrollTo({
          top: scrollHeight,
          behavior: 'smooth'
        });
      }
    }, 120);
  }

  private syncExpandedStateToParsedSessions(): void {
    const targetExpandedIds = new Set(this.expandedSessionIds);
    this.parsedSessions.forEach(p => {
      p.expanded = targetExpandedIds.has(p.session.sessionId);
    });
  }

  private rebuildVisibleSessions(): void {
    const visible = this.isAdmin
      ? this.allSessions
      : this.allSessions.filter(s => this.isConcluded(s));

    const latestSessionId = visible.reduce((max, s) => s.sessionId > max ? s.sessionId : max, 0);

    const campaignId = this.campaignService.getSelectedCampaign()?.id;
    const savedState = this.loadSavedState(campaignId);

    const targetExpandedIds = new Set<number>();
    if (this.initialExpandedSessionIds && this.initialExpandedSessionIds.length > 0) {
      this.initialExpandedSessionIds.forEach(id => targetExpandedIds.add(id));
    } else if (this.initialSessionId) {
      targetExpandedIds.add(this.initialSessionId);
    } else if (this.expandedSessionIds.length > 0) {
      this.expandedSessionIds.forEach(id => targetExpandedIds.add(id));
    } else if (savedState?.expandedSessionIds && savedState.expandedSessionIds.length > 0) {
      savedState.expandedSessionIds.forEach(id => targetExpandedIds.add(id));
    } else if (savedState?.selectedSessionId) {
      targetExpandedIds.add(savedState.selectedSessionId);
    }

    this.parsedSessions = visible.map(session => {
      const rawTitle = this.extractTitle(session.content || '', session.sessionId);
      const titleFormatted = this.formatInline(rawTitle);
      const titleHtml = this.sanitizer.bypassSecurityTrustHtml(titleFormatted);

      const rawConclusionTitle = this.extractConclusionSubtitle(session.conclussion || '');
      const conclusionTitleFormatted = rawConclusionTitle ? this.formatInline(rawConclusionTitle) : '';
      const conclusionTitleHtml = this.sanitizer.bypassSecurityTrustHtml(conclusionTitleFormatted);

      const branches = this.extractBranches(session.content || '');
      const playerVisibleBranches = session.playerVisibleBranches || [];

      const visibleBranchesCount = branches.filter(b => this.isBranchVisible(b, playerVisibleBranches)).length;
      const playerBranchesLabel = visibleBranchesCount > 0
        ? `Path: ${playerVisibleBranches.join(', ')}`
        : '';

      const expanded = targetExpandedIds.has(session.sessionId);

      return {
        session,
        sessionRoman: toRomanNumeral(session.sessionId),
        rawTitle,
        titleHtml,
        conclusionTitleHtml,
        parsedContent: this.renderMarkdown(session.content || '', true, playerVisibleBranches, this.isAdmin),
        parsedConclusion: this.renderMarkdown(session.conclussion || '', true, playerVisibleBranches, this.isAdmin),
        isConcluded: this.isConcluded(session),
        isLatest: session.sessionId === latestSessionId && latestSessionId > 0,
        expanded,
        branches,
        playerVisibleBranches,
        visibleBranchesCount,
        playerBranchesLabel
      };
    });

    this.expandedSessionIds = this.parsedSessions.filter(s => s.expanded).map(s => s.session.sessionId);
    if (this.initialSessionId) {
      this.selectedSessionId = this.initialSessionId;
    } else if (savedState?.selectedSessionId) {
      this.selectedSessionId = savedState.selectedSessionId;
    } else if (this.expandedSessionIds.length > 0) {
      this.selectedSessionId = this.expandedSessionIds[this.expandedSessionIds.length - 1];
    }

    this.hasSessions = this.parsedSessions.length > 0;
  }

  private isConcluded(session: CampaignSession): boolean {
    return !!session.conclussion && session.conclussion.trim().length > 0;
  }

  toggleSession(index: number): void {
    this.parsedSessions[index].expanded = !this.parsedSessions[index].expanded;
    const session = this.parsedSessions[index];
    const sessionId = session.session.sessionId;

    this.expandedSessionIds = this.parsedSessions.filter(s => s.expanded).map(s => s.session.sessionId);
    if (session.expanded) {
      this.selectedSessionId = sessionId;
    } else {
      this.selectedSessionId = this.expandedSessionIds[this.expandedSessionIds.length - 1] ?? null;
    }

    this.currentScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    this.saveStateToStorage();
    this.emitSessionState();
  }

  @HostListener('window:scroll')
  onWindowScroll(): void {
    if (!this.isLoading && this.hasSessions) {
      this.currentScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
      if (this.scrollDebounceTimer) {
        clearTimeout(this.scrollDebounceTimer);
      }
      this.scrollDebounceTimer = setTimeout(() => {
        this.saveStateToStorage();
        this.emitSessionState();
      }, 250);
    }
  }

  private emitSessionState(overrideScrollY?: number): void {
    const scrollY = overrideScrollY !== undefined
      ? overrideScrollY
      : (window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0);
    this.currentScrollY = scrollY;
    this.sessionStateChange.emit({
      selectedSessionId: this.selectedSessionId,
      expandedSessionIds: this.expandedSessionIds,
      scrollY
    });
  }

  editSession(session: CampaignSession, event?: MouseEvent): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const currentScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    this.currentScrollY = currentScrollY;
    this.selectedSessionId = session.sessionId;
    this.saveStateToStorage();
    this.emitSessionState(currentScrollY);
    this.openAdminEditor.emit({ mode: 'session', session });
  }

  createNewSession(): void {
    this.openAdminEditor.emit({ mode: 'session', session: null });
  }

  openSessionEditor(): void {
    this.openAdminEditor.emit({ mode: 'session', session: null });
  }


  // --- Branch Extraction & Matching ---

  private normalizeNewlines(text: string): string {
    if (!text) {
      return '';
    }
    return text
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\n')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
  }

  extractBranches(content: string): string[] {
    if (!content) {
      return [];
    }
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

  isBranchVisible(branchKey: string, visibleBranches?: string[]): boolean {
    if (!visibleBranches || visibleBranches.length === 0) {
      return false;
    }
    const cleanKey = branchKey.trim().toLowerCase();
    const letterMatch = cleanKey.match(/(?:branch\s*)?([a-z0-9]+)/i);
    const coreKey = letterMatch ? letterMatch[1].toLowerCase() : cleanKey;

    return visibleBranches.some(v => {
      const cleanV = v.trim().toLowerCase();
      if (cleanV === cleanKey) return true;
      if (cleanV === `branch ${cleanKey}`) return true;
      if (`branch ${cleanV}` === cleanKey) return true;
      const vMatch = cleanV.match(/(?:branch\s*)?([a-z0-9]+)/i);
      const coreV = vMatch ? vMatch[1].toLowerCase() : cleanV;
      if (coreV === coreKey) return true;
      if (cleanKey.includes(cleanV) || cleanV.includes(cleanKey)) return true;
      return false;
    });
  }

  // --- Title & Markdown Parsing ---

  private extractTitle(content: string, sessionId: number): string {
    if (!content) {
      return '';
    }
    const text = this.normalizeNewlines(content);
    // Match line like "### Session 1: Title" or "### Session I: Title" or "### Title"
    const match = text.match(/^#{1,3}\s*(?:Session\s*(?:\d+|[IVXLCDM]+)\s*:\s*)?(.*)$/mi);
    if (match && match[1]?.trim()) {
      const candidate = match[1].trim();
      if (/^Session\s*(?:\d+|[IVXLCDM]+)$/i.test(candidate)) {
        return '';
      }
      return candidate;
    }
    return '';
  }

  private extractConclusionSubtitle(conclussion: string): string {
    if (!conclussion) {
      return '';
    }
    const text = this.normalizeNewlines(conclussion);
    // Match line like "### Conclusion: Title"
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
    isAdmin = false
  ): SafeHtml {
    if (!rawText || !rawText.trim()) {
      return this.sanitizer.bypassSecurityTrustHtml('');
    }

    let text = this.normalizeNewlines(rawText).trim();

    // Strip redundant leading Session/Conclusion header if present
    if (stripMainHeader) {
      text = text.replace(/^#{1,3}\s*Session\s*(?:\d+|[IVXLCDM]+)\s*:[^\n]*\n*/i, '');
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

      // Check for Branch Headings (e.g. "#### Act II — Branch A: ...", "#### Branch A: ...")
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
        const isPlayerVis = this.isBranchVisible(branchName, playerVisibleBranches);

        isBranchActive = isAdmin || isPlayerVis;

        if (isBranchActive) {
          const actBadge = actNum ? `<span class="act-badge">ACT ${actNum}</span> ` : '';
          const branchBadge = `<span class="branch-badge">BRANCH ${branchCode}</span> `;
          const titleSpan = `<span class="heading-text">${title}</span>`;
          const gmPill = isAdmin
            ? (isPlayerVis
              ? `<span class="branch-gm-pill branch-gm-pill--visible"><span class="material-icons pill-icon">visibility</span> Visible to Players</span>`
              : `<span class="branch-gm-pill branch-gm-pill--hidden"><span class="material-icons pill-icon">visibility_off</span> GM Only</span>`)
            : '';

          resultHtml.push(`<h3 class="narrative-h3 heading--branch">${actBadge}${branchBadge}${titleSpan} ${gmPill}</h3>`);
        }
        continue;
      }

      // Headings (Non-branch)
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

      // If currently inside a branch that is hidden from player, skip content
      if (!isBranchActive) {
        continue;
      }

      // Bullet & Numbered List Items
      const listMatch = trimmed.match(/^(?:[-*]|\d+\.)\s+(.*)$/);
      if (listMatch) {
        const itemContent = listMatch[1];
        // Check if list item specifies a branch (e.g. Outcome A, Branch A Combat Objectives)
        let itemBranchCode: string | null = null;
        const outcomeMatch = itemContent.match(/^\*\*Outcome\s*([A-Z0-9]+)\s*(?:\(([^)]+)\))?\s*:\*\*\s*(.*)$/i);
        if (outcomeMatch) {
          itemBranchCode = outcomeMatch[1].toUpperCase();
        }
        const branchCombatMatch = itemContent.match(/^\*\*Branch\s*([A-Z0-9]+)\s*(?:Combat\s+Objectives|Objectives)?\s*:\*\*\s*(.*)$/i);
        if (branchCombatMatch) {
          itemBranchCode = branchCombatMatch[1].toUpperCase();
        }

        if (itemBranchCode) {
          const isItemVis = isAdmin || this.isBranchVisible(`Branch ${itemBranchCode}`, playerVisibleBranches);
          if (!isItemVis) {
            continue; // Skip hidden branch-specific objective/outcome in non-GM mode
          }
        }

        if (!inList) {
          resultHtml.push('<ul class="narrative-list">');
          inList = true;
        }
        resultHtml.push(this.parseListItem(itemContent, isAdmin, playerVisibleBranches));
        continue;
      }

      // Regular paragraph
      if (inList) {
        resultHtml.push('</ul>');
        inList = false;
      }
      const paragraphContent = this.formatInline(trimmed);
      resultHtml.push(`<p class="narrative-p">${paragraphContent}</p>`);
    }

    if (inList) {
      resultHtml.push('</ul>');
    }

    return this.sanitizer.bypassSecurityTrustHtml(resultHtml.join('\n'));
  }

  private parseHeading(headingText: string, level: number): string {
    const formatted = this.formatInline(headingText);

    // Standard Act match: e.g. "Act I: The Proclamation...", "Act III: ..."
    const actMatch = headingText.match(/^Act\s+([IVXLCDM]+)\s*:\s*(.*)$/i);
    if (actMatch) {
      const actNum = actMatch[1].toUpperCase();
      const title = this.formatInline(actMatch[2]);
      return `<h3 class="narrative-h3 heading--act">`
        + `<span class="act-badge">ACT ${actNum}</span> `
        + `<span class="heading-text">${title}</span>`
        + `</h3>`;
    }

    // Specific category matches
    const lower = headingText.toLowerCase();

    if (lower.startsWith('overview')) {
      return `<h3 class="narrative-h3 heading--overview">`
        + `<span class="material-icons heading-icon">explore</span> `
        + `<span class="heading-text">${formatted}</span>`
        + `</h3>`;
    }

    if (lower.includes('objective') || lower.includes('branching decision') || lower.includes('branching path')) {
      return `<h3 class="narrative-h3 heading--objectives">`
        + `<span class="material-icons heading-icon">track_changes</span> `
        + `<span class="heading-text">${formatted}</span>`
        + `</h3>`;
    }

    if (lower.includes('combat') || lower.includes('breach') || lower.includes('assault') || lower.includes('battle')) {
      return `<h3 class="narrative-h3 heading--combat">`
        + `<span class="material-icons heading-icon">sports_kabaddi</span> `
        + `<span class="heading-text">${formatted}</span>`
        + `</h3>`;
    }

    if (lower.includes('summary of action') || lower.includes('summary')) {
      return `<h3 class="narrative-h3 heading--summary">`
        + `<span class="material-icons heading-icon">history_edu</span> `
        + `<span class="heading-text">${formatted}</span>`
        + `</h3>`;
    }

    if (lower.includes('current state') || lower.includes('return to')) {
      return `<h3 class="narrative-h3 heading--state">`
        + `<span class="material-icons heading-icon">night_shelter</span> `
        + `<span class="heading-text">${formatted}</span>`
        + `</h3>`;
    }

    if (level === 2) {
      return `<h2 class="narrative-h2">${formatted}</h2>`;
    }
    if (level === 3) {
      return `<h3 class="narrative-h3"><span class="material-icons h3-icon">bookmark</span> <span class="heading-text">${formatted}</span></h3>`;
    }
    if (level === 5) {
      return `<h5 class="narrative-h5">${formatted}</h5>`;
    }

    // Default h3
    return `<h3 class="narrative-h3"><span class="h4-ornament"></span> <span class="heading-text">${formatted}</span></h3>`;
  }

  private parseListItem(rawItem: string, isAdmin = false, playerVisibleBranches: string[] = []): string {
    // Check for Phase: "- **Phase 1 (Beach Landing):** ..."
    const phaseMatch = rawItem.match(/^\*\*Phase\s*(\d+)\s*(?:\(([^)]+)\))?\s*:\*\*\s*(.*)$/i);
    if (phaseMatch) {
      const num = phaseMatch[1];
      const phaseTitle = phaseMatch[2] ? ` · ${phaseMatch[2]}` : '';
      const rest = this.formatInline(phaseMatch[3]);
      return `<li class="narrative-list-item item--phase">`
        + `<span class="narrative-tag tag--phase">PHASE ${num}${phaseTitle}</span> `
        + `<span class="item-body">${rest}</span>`
        + `</li>`;
    }

    // Check for Primary Objective: "- **Primary Objective:** ..."
    const primaryMatch = rawItem.match(/^\*\*Primary Objective:\*\*\s*(.*)$/i);
    if (primaryMatch) {
      const rest = this.formatInline(primaryMatch[1]);
      return `<li class="narrative-list-item item--primary">`
        + `<span class="narrative-tag tag--primary"><span class="material-icons tag-icon">track_changes</span> Primary Objective</span> `
        + `<span class="item-body">${rest}</span>`
        + `</li>`;
    }

    // Check for Secondary Objective: "- **Secondary Objective:** ..."
    const secondaryMatch = rawItem.match(/^\*\*Secondary Objective:\*\*\s*(.*)$/i);
    if (secondaryMatch) {
      const rest = this.formatInline(secondaryMatch[1]);
      return `<li class="narrative-list-item item--secondary">`
        + `<span class="narrative-tag tag--secondary"><span class="material-icons tag-icon">flag</span> Secondary Objective</span> `
        + `<span class="item-body">${rest}</span>`
        + `</li>`;
    }

    // Check for Branching Decision: "- **Branching Decision:** ..."
    const branchingMatch = rawItem.match(/^\*\*Branching Decision:\*\*\s*(.*)$/i);
    if (branchingMatch) {
      const rest = this.formatInline(branchingMatch[1]);
      return `<li class="narrative-list-item item--branching">`
        + `<span class="narrative-tag tag--branching"><span class="material-icons tag-icon">call_split</span> Branching Decision</span> `
        + `<span class="item-body">${rest}</span>`
        + `</li>`;
    }

    // Check for Investigation Objective: "- **Investigation Objective:** ..."
    const investMatch = rawItem.match(/^\*\*Investigation Objective:\*\*\s*(.*)$/i);
    if (investMatch) {
      const rest = this.formatInline(investMatch[1]);
      return `<li class="narrative-list-item item--investigation">`
        + `<span class="narrative-tag tag--investigation"><span class="material-icons tag-icon">search</span> Investigation</span> `
        + `<span class="item-body">${rest}</span>`
        + `</li>`;
    }

    // Check for Branch Combat Objectives: "- **Branch A Combat Objectives:** ..."
    const branchCombatMatch = rawItem.match(/^\*\*Branch\s*([A-Z0-9]+)\s*(?:Combat\s+Objectives|Objectives)?\s*:\*\*\s*(.*)$/i);
    if (branchCombatMatch) {
      const letter = branchCombatMatch[1].toUpperCase();
      const rest = this.formatInline(branchCombatMatch[2]);
      const isPlayerVis = this.isBranchVisible(`Branch ${letter}`, playerVisibleBranches);
      const tagClass = letter === 'A' ? 'tag--outcome-a' : 'tag--outcome-b';
      const gmStatus = isAdmin
        ? (isPlayerVis
          ? `<span class="item-gm-status item-gm-status--visible">(Player Visible)</span> `
          : `<span class="item-gm-status item-gm-status--hidden">(GM Only)</span> `)
        : '';
      return `<li class="narrative-list-item item--branch-combat">`
        + `<span class="narrative-tag ${tagClass}"><span class="material-icons tag-icon">sports_kabaddi</span> Branch ${letter} Objectives</span> `
        + `${gmStatus}<span class="item-body">${rest}</span>`
        + `</li>`;
    }

    // Check for Outcome A / Outcome B: "- **Outcome A (...):** ..."
    const outcomeMatch = rawItem.match(/^\*\*Outcome\s*([A-Z0-9]+)\s*(?:\(([^)]+)\))?\s*:\*\*\s*(.*)$/i);
    if (outcomeMatch) {
      const letter = outcomeMatch[1].toUpperCase();
      const label = outcomeMatch[2] ? ` (${outcomeMatch[2]})` : '';
      const rest = this.formatInline(outcomeMatch[3]);
      const isPlayerVis = this.isBranchVisible(`Branch ${letter}`, playerVisibleBranches);
      const tagClass = letter === 'A' ? 'tag--outcome-a' : 'tag--outcome-b';
      const gmStatus = isAdmin
        ? (isPlayerVis
          ? `<span class="item-gm-status item-gm-status--visible">(Player Visible)</span> `
          : `<span class="item-gm-status item-gm-status--hidden">(GM Only)</span> `)
        : '';
      return `<li class="narrative-list-item item--outcome">`
        + `<span class="narrative-tag ${tagClass}">OUTCOME ${letter}${label}</span> `
        + `${gmStatus}<span class="item-body">${rest}</span>`
        + `</li>`;
    }

    // Standard list item with inline formatting
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
        const isDiscovered = this.isEntityDiscovered(type, id, name);
        const undiscoveredClass = isDiscovered ? '' : 'entity-chip--undiscovered';
        const titleText = isDiscovered
          ? `Navigate to ${config.label}: ${name}`
          : `${config.label}: ${name} (Undiscovered)`;

        return `<span class="entity-chip ${config.cssClass} ${undiscoveredClass}" `
          + `data-entity-type="${type}" `
          + `data-entity-id="${id}" `
          + `data-entity-name="${name}" `
          + `data-discovered="${isDiscovered}" `
          + `role="${isDiscovered ? 'button' : 'text'}" `
          + `tabindex="${isDiscovered ? '0' : '-1'}" `
          + `title="${titleText}">`
          + `${name}`
          + `</span>`;
      }
    );

    return escaped;
  }

  isEntityDiscovered(type: EntityType, id: number, nameHint = ''): boolean {
    if (this.isAdmin) {
      return true;
    }

    const normType = String(type).toLowerCase();

    switch (normType) {
      case 'player': {
        const player = (id > 0 ? this.lookup.players.find(p => p.id === id) : null)
          || (nameHint ? this.lookup.players.find(p => p.name.toLowerCase() === nameHint.toLowerCase()) : null);
        return !!player;
      }
      case 'npc': {
        const npc = (id > 0 ? this.lookup.npcs.find(n => n.id === id) : null)
          || (nameHint ? this.lookup.npcs.find(n => n.name.toLowerCase() === nameHint.toLowerCase()) : null);
        if (!npc || npc.discovered === false) {
          return false;
        }
        if (npc.location) {
          const loc = this.lookup.locations.find(l => l.name.trim().toLowerCase() === npc.location!.trim().toLowerCase());
          if (loc && (loc.discovered === false || (loc.isSecret && !loc.isSecretRevealed))) {
            return false;
          }
        }
        return true;
      }
      case 'location': {
        const location = (id > 0 ? this.lookup.locations.find(l => l.id === id) : null)
          || (nameHint ? this.lookup.locations.find(l => l.name.toLowerCase() === nameHint.toLowerCase()) : null);
        if (!location) {
          return false;
        }
        return location.discovered !== false && (!location.isSecret || !!location.isSecretRevealed);
      }
      case 'shop': {
        const shop = (id > 0 ? this.lookup.shops.find(s => s.id === id) : null)
          || (nameHint ? this.lookup.shops.find(s => s.name.toLowerCase() === nameHint.toLowerCase()) : null);
        if (!shop || shop.discovered === false) {
          return false;
        }
        if (shop.locationId) {
          const loc = this.lookup.locations.find(l => l.id === shop.locationId);
          if (loc && (loc.discovered === false || (loc.isSecret && !loc.isSecretRevealed))) {
            return false;
          }
        } else if (shop.locationName || shop.location) {
          const locName = (shop.locationName || shop.location || '').trim().toLowerCase();
          const loc = this.lookup.locations.find(l => l.name.trim().toLowerCase() === locName);
          if (loc && (loc.discovered === false || (loc.isSecret && !loc.isSecretRevealed))) {
            return false;
          }
        }
        return true;
      }
      case 'bestiary': {
        const creature = (id > 0 ? this.lookup.bestiary.find(b => b.id === id) : null)
          || (nameHint ? this.lookup.bestiary.find(b => b.name.toLowerCase() === nameHint.toLowerCase()) : null);
        if (!creature) {
          return false;
        }
        const activeCamp = this.campaignService.getSelectedCampaign();
        const targetCampId = activeCamp?.id;
        if (creature.discoveredCampaignIds && Array.isArray(creature.discoveredCampaignIds)) {
          return targetCampId ? creature.discoveredCampaignIds.includes(targetCampId) : creature.discoveredCampaignIds.length > 0;
        }
        return creature.isDiscovered !== false && (creature as any).discovered !== false;
      }
      case 'letter': {
        const letter = (id > 0 ? this.lookup.letters.find(l => l.id === id) : null)
          || (nameHint ? this.lookup.letters.find(l => (l.subject || '').toLowerCase() === nameHint.toLowerCase()) : null);
        return !!letter && !letter.isDeleted;
      }
      case 'item':
      case 'weapon':
      case 'weaponrule':
      case 'alteredstate':
      case 'affliction':
        return true;
      default:
        return true;
    }
  }

  private resolveEntity(type: EntityType, tagContent: string): { id: number; name: string } {
    let rawId: number | null = null;
    let labelHint: string | null = null;

    // Check if format is "<id>: <label>" or just "<id>"
    const colonIndex = tagContent.indexOf(':');
    if (colonIndex !== -1) {
      const idPart = tagContent.substring(0, colonIndex).trim();
      const parsedId = parseInt(idPart, 10);
      if (!isNaN(parsedId)) {
        rawId = parsedId;
      }
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
        return {
          id: player?.id ?? rawId ?? 0,
          name: player?.name ?? labelHint ?? `Player #${rawId ?? tagContent}`
        };
      }
      case 'npc': {
        const npc = rawId !== null
          ? this.lookup.npcs.find(n => n.id === rawId)
          : this.lookup.npcs.find(n => n.name.toLowerCase() === (labelHint || '').toLowerCase());
        return {
          id: npc?.id ?? rawId ?? 0,
          name: npc?.name ?? labelHint ?? `NPC #${rawId ?? tagContent}`
        };
      }
      case 'location': {
        const location = rawId !== null
          ? this.lookup.locations.find(l => l.id === rawId)
          : this.lookup.locations.find(l => l.name.toLowerCase() === (labelHint || '').toLowerCase());
        return {
          id: location?.id ?? rawId ?? 0,
          name: location?.name ?? labelHint ?? `Location #${rawId ?? tagContent}`
        };
      }
      case 'shop': {
        const shop = rawId !== null
          ? this.lookup.shops.find(s => s.id === rawId)
          : this.lookup.shops.find(s => s.name.toLowerCase() === (labelHint || '').toLowerCase());
        return {
          id: shop?.id ?? rawId ?? 0,
          name: shop?.name ?? labelHint ?? `Shop #${rawId ?? tagContent}`
        };
      }
      case 'bestiary': {
        const creature = rawId !== null
          ? this.lookup.bestiary.find(b => b.id === rawId)
          : this.lookup.bestiary.find(b => b.name.toLowerCase() === (labelHint || '').toLowerCase());
        return {
          id: creature?.id ?? rawId ?? 0,
          name: creature?.name ?? labelHint ?? `Creature #${rawId ?? tagContent}`
        };
      }
      case 'letter': {
        const letter = rawId !== null
          ? this.lookup.letters.find(l => l.id === rawId)
          : this.lookup.letters.find(l => (l.subject || '').toLowerCase() === (labelHint || '').toLowerCase());
        return {
          id: letter?.id ?? rawId ?? 0,
          name: letter?.subject ?? labelHint ?? `Letter #${rawId ?? tagContent}`
        };
      }
      case 'item': {
        const item = rawId !== null
          ? this.lookup.items.find(i => i.id === rawId)
          : this.lookup.items.find(i => (i.name || '').toLowerCase() === (labelHint || '').toLowerCase());
        return {
          id: item?.id ?? rawId ?? 0,
          name: item?.name ?? labelHint ?? `Item #${rawId ?? tagContent}`
        };
      }
      case 'weapon': {
        const weapon = rawId !== null
          ? this.lookup.weapons.find(w => w.id === rawId)
          : this.lookup.weapons.find(w => (w.name || '').toLowerCase() === (labelHint || '').toLowerCase());
        return {
          id: weapon?.id ?? rawId ?? 0,
          name: weapon?.name ?? labelHint ?? `Weapon #${rawId ?? tagContent}`
        };
      }
      case 'weaponrule': {
        const rule = rawId !== null
          ? this.lookup.weaponRules.find(r => r.id === rawId)
          : this.lookup.weaponRules.find(r => (r.name || '').toLowerCase() === (labelHint || '').toLowerCase());
        return {
          id: rule?.id ?? rawId ?? 0,
          name: rule?.name ?? labelHint ?? `Rule #${rawId ?? tagContent}`
        };
      }
      case 'alteredstate': {
        const state = rawId !== null
          ? this.lookup.alteredStates.find(s => s.id === rawId)
          : this.lookup.alteredStates.find(s => (s.name || '').toLowerCase() === (labelHint || '').toLowerCase());
        return {
          id: state?.id ?? rawId ?? 0,
          name: state?.name ?? labelHint ?? `State #${rawId ?? tagContent}`
        };
      }
      case 'affliction': {
        const aff = rawId !== null
          ? this.lookup.afflictions.find(a => String(a.id) === String(rawId))
          : this.lookup.afflictions.find(a => (a.name || '').toLowerCase() === (labelHint || '').toLowerCase());
        return {
          id: aff ? Number(aff.id) : (rawId ?? 0),
          name: aff?.name ?? labelHint ?? `Affliction #${rawId ?? tagContent}`
        };
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

  // --- Chip Click Navigation ---

  @HostListener('click', ['$event'])
  onChipClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const chip = target.closest('.entity-chip') as HTMLElement | null;
    if (!chip) {
      return;
    }

    const entityType = chip.getAttribute('data-entity-type') as EntityType;
    const entityId = parseInt(chip.getAttribute('data-entity-id') || '0', 10);
    const entityName = chip.getAttribute('data-entity-name') || '';

    if (!this.isEntityDiscovered(entityType, entityId, entityName)) {
      return;
    }

    const sessionCard = chip.closest('.session-card') as HTMLElement | null;
    if (sessionCard && sessionCard.id) {
      const match = sessionCard.id.match(/session-card-(\d+)/);
      if (match) {
        this.selectedSessionId = parseInt(match[1], 10);
      }
    }

    const currentScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    this.currentScrollY = currentScrollY;
    this.saveStateToStorage();
    this.emitSessionState(currentScrollY);

    event.preventDefault();
    event.stopPropagation();
    this.navigateToEntity(entityType, entityId, entityName);
  }

  @HostListener('keydown', ['$event'])
  onChipKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    const target = event.target as HTMLElement;
    if (!target.classList.contains('entity-chip')) {
      return;
    }

    const entityType = target.getAttribute('data-entity-type') as EntityType;
    const entityId = parseInt(target.getAttribute('data-entity-id') || '0', 10);
    const entityName = target.getAttribute('data-entity-name') || '';

    if (!this.isEntityDiscovered(entityType, entityId, entityName)) {
      return;
    }

    const sessionCard = target.closest('.session-card') as HTMLElement | null;
    if (sessionCard && sessionCard.id) {
      const match = sessionCard.id.match(/session-card-(\d+)/);
      if (match) {
        this.selectedSessionId = parseInt(match[1], 10);
      }
    }

    const currentScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    this.currentScrollY = currentScrollY;
    this.saveStateToStorage();
    this.emitSessionState(currentScrollY);

    event.preventDefault();
    this.navigateToEntity(entityType, entityId, entityName);
  }

  private navigateToEntity(type: EntityType, id: number, nameHint = ''): void {
    if (!this.isEntityDiscovered(type, id, nameHint)) {
      return;
    }

    const normType = String(type).toLowerCase();

    switch (normType) {
      case 'player': {
        const player = (id > 0 ? this.lookup.players.find(p => p.id === id) : null)
          || (nameHint ? this.lookup.players.find(p => p.name.toLowerCase() === nameHint.toLowerCase()) : null);
        if (player) {
          this.activePlayerService.setActivePlayer(player);
        }
        this.viewChange.emit('players');
        break;
      }
      case 'npc': {
        const npc = (id > 0 ? this.lookup.npcs.find(n => n.id === id) : null)
          || (nameHint ? this.lookup.npcs.find(n => n.name.toLowerCase() === nameHint.toLowerCase()) : null);
        this.navigateToNpc.emit({ npcName: npc?.name ?? nameHint });
        break;
      }
      case 'location': {
        const location = (id > 0 ? this.lookup.locations.find(l => l.id === id) : null)
          || (nameHint ? this.lookup.locations.find(l => l.name.toLowerCase() === nameHint.toLowerCase()) : null);
        const resolvedName = location?.name ?? nameHint;
        if (resolvedName) {
          this.navigateToLocation.emit({
            locationName: resolvedName,
            backTarget: 'campaignSessions'
          });
        }
        break;
      }
      case 'shop': {
        const shop = (id > 0 ? this.lookup.shops.find(s => s.id === id) : null)
          || (nameHint ? this.lookup.shops.find(s => s.name.toLowerCase() === nameHint.toLowerCase()) : null);
        this.navigateToShop.emit({ shopName: shop?.name ?? nameHint });
        break;
      }
      case 'bestiary': {
        const creature = (id > 0 ? this.lookup.bestiary.find(b => b.id === id) : null)
          || (nameHint ? this.lookup.bestiary.find(b => b.name.toLowerCase() === nameHint.toLowerCase()) : null);
        const resolvedId = creature?.id ?? id;
        if (resolvedId > 0) {
          this.navigateToBestiary.emit(resolvedId);
        }
        break;
      }
      case 'letter': {
        const letter = (id > 0 ? this.lookup.letters.find(l => l.id === id) : null)
          || (nameHint ? this.lookup.letters.find(l => (l.subject || '').toLowerCase() === nameHint.toLowerCase()) : null);
        const resolvedId = letter?.id ?? id;
        const resolvedSubject = letter?.subject ?? nameHint;
        this.navigateToLetter.emit({ letterId: resolvedId, letterSubject: resolvedSubject });
        break;
      }
      case 'item': {
        const item = (id > 0 ? this.lookup.items.find(i => i.id === id) : null)
          || (nameHint ? this.lookup.items.find(i => (i.name || '').toLowerCase() === nameHint.toLowerCase()) : null);
        const resolvedName = item?.name ?? nameHint;
        const resolvedId = item?.id ?? id;
        this.navigateToItem.emit({ itemName: resolvedName, itemId: resolvedId });
        break;
      }
      case 'weapon': {
        const weapon = (id > 0 ? this.lookup.weapons.find(w => w.id === id) : null)
          || (nameHint ? this.lookup.weapons.find(w => (w.name || '').toLowerCase() === nameHint.toLowerCase()) : null);
        const resolvedName = weapon?.name ?? nameHint;
        const resolvedId = weapon?.id ?? id;
        this.navigateToItem.emit({ itemName: resolvedName, itemId: resolvedId });
        break;
      }
      case 'weaponrule': {
        this.viewChange.emit('weaponRules');
        break;
      }
      case 'alteredstate': {
        this.viewChange.emit('alteredStates');
        break;
      }
      case 'affliction': {
        this.viewChange.emit('afflictions');
        break;
      }
    }
  }

  trackBySessionId(_index: number, item: ParsedSession): number {
    return item.session.sessionId;
  }
}
