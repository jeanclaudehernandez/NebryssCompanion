import {
  Component,
  DestroyRef,
  EventEmitter,
  HostListener,
  OnInit,
  Output,
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
  BestiaryEntry
} from '../model';
import { AppView } from '../app-view.types';

interface ParsedSession {
  session: CampaignSession;
  titleHtml: SafeHtml;
  conclusionTitleHtml: SafeHtml;
  rawTitle: string;
  parsedContent: SafeHtml;
  parsedConclusion: SafeHtml;
  isConcluded: boolean;
  expanded: boolean;
  branches: string[];
  playerVisibleBranches: string[];
  visibleBranchesCount: number;
  playerBranchesLabel: string;
}

type EntityType = 'player' | 'npc' | 'location' | 'shop' | 'bestiary';

interface EntityLookup {
  players: Player[];
  npcs: NPC[];
  locations: Location[];
  shops: Shop[];
  bestiary: BestiaryEntry[];
}

const ENTITY_CONFIG: Record<EntityType, { icon: string; cssClass: string; label: string }> = {
  player: { icon: 'person', cssClass: 'entity-chip--player', label: 'Player' },
  npc: { icon: 'badge', cssClass: 'entity-chip--npc', label: 'NPC' },
  location: { icon: 'place', cssClass: 'entity-chip--location', label: 'Location' },
  shop: { icon: 'storefront', cssClass: 'entity-chip--shop', label: 'Shop' },
  bestiary: { icon: 'pets', cssClass: 'entity-chip--bestiary', label: 'Creature' }
};

@Component({
  selector: 'app-campaign-sessions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './campaign-sessions.component.html',
  styleUrls: ['./campaign-sessions.component.css']
})
export class CampaignSessionsComponent implements OnInit {
  @Output() viewChange = new EventEmitter<AppView>();
  @Output() navigateToNpc = new EventEmitter<{ npcName?: string }>();
  @Output() navigateToLocation = new EventEmitter<{ locationName: string; backTarget: string | null }>();
  @Output() navigateToShop = new EventEmitter<{ shopName?: string }>();
  @Output() navigateToBestiary = new EventEmitter<number>();

  private readonly destroyRef = inject(DestroyRef);

  parsedSessions: ParsedSession[] = [];
  isAdmin = false;
  isLoading = true;
  hasSessions = false;

  private lookup: EntityLookup = {
    players: [],
    npcs: [],
    locations: [],
    shops: [],
    bestiary: []
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

    const campaign = this.campaignService.getSelectedCampaign();
    const campaignId = campaign?.id;

    forkJoin({
      sessions: this.dataService.getCampaignSessions(campaignId),
      players: this.dataService.getPlayers(),
      npcs: this.dataService.getNpcs(),
      locations: this.dataService.getLocations(),
      shops: this.dataService.getShops(),
      bestiary: this.dataService.getBestiary()
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ sessions, players, npcs, locations, shops, bestiary }) => {
        this.lookup = {
          players,
          npcs,
          locations: (locations as any)?.locations ?? locations ?? [],
          shops,
          bestiary
        };

        this.allSessions = sessions
          .slice()
          .sort((a, b) => b.sessionId - a.sessionId);

        this.rebuildVisibleSessions();
        this.isLoading = false;
      });
  }

  private allSessions: CampaignSession[] = [];

  private rebuildVisibleSessions(): void {
    const visible = this.isAdmin
      ? this.allSessions
      : this.allSessions.filter(s => this.isConcluded(s));

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

      return {
        session,
        rawTitle,
        titleHtml,
        conclusionTitleHtml,
        parsedContent: this.renderMarkdown(session.content || '', true, playerVisibleBranches, this.isAdmin),
        parsedConclusion: this.renderMarkdown(session.conclussion || '', true, playerVisibleBranches, this.isAdmin),
        isConcluded: this.isConcluded(session),
        expanded: false,
        branches,
        playerVisibleBranches,
        visibleBranchesCount,
        playerBranchesLabel
      };
    });

    this.hasSessions = this.parsedSessions.length > 0;
  }

  private isConcluded(session: CampaignSession): boolean {
    return !!session.conclussion && session.conclussion.trim().length > 0;
  }

  toggleSession(index: number): void {
    this.parsedSessions[index].expanded = !this.parsedSessions[index].expanded;
  }

  expandAll(): void {
    this.parsedSessions.forEach(s => s.expanded = true);
  }

  collapseAll(): void {
    this.parsedSessions.forEach(s => s.expanded = false);
  }

  // --- Branch Extraction & Matching ---

  extractBranches(content: string): string[] {
    if (!content) {
      return [];
    }
    const branches: string[] = [];
    const regex = /#{1,5}\s*(?:Act\s+[IVXLCDM]+\s*[—–-]\s*)?Branch\s*([A-Z0-9]+)\b/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
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
      return `Session ${sessionId}`;
    }
    // Match line like "### Session 1: Title" or "### Title"
    const match = content.match(/^#{1,3}\s*(?:Session\s*\d+\s*:\s*)?(.*)$/m);
    if (match && match[1]?.trim()) {
      return match[1].trim();
    }
    return `Session ${sessionId}`;
  }

  private extractConclusionSubtitle(conclussion: string): string {
    if (!conclussion) {
      return '';
    }
    // Match line like "### Conclusion: Title"
    const match = conclussion.match(/^#{1,3}\s*(?:Conclusion\s*:\s*)(.*)$/m);
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

    let text = rawText.trim();

    // Strip redundant leading Session/Conclusion header if present
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

      // Bullet List Items
      const listMatch = trimmed.match(/^[-*]\s+(.*)$/);
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

    // Entity Chips: @(player|npc|location|shop|bestiary)[tagContent]
    escaped = escaped.replace(
      /@(player|npc|location|shop|bestiary)\[([^\]]+)\]/g,
      (_match, type: EntityType, tagContent: string) => {
        const { id, name } = this.resolveEntity(type, tagContent.trim());
        const config = ENTITY_CONFIG[type];
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

    switch (type) {
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
        return creature.isDiscovered !== false && (creature as any).discovered !== false;
      }
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

    switch (type) {
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

    event.preventDefault();
    this.navigateToEntity(entityType, entityId, entityName);
  }

  private navigateToEntity(type: EntityType, id: number, nameHint = ''): void {
    if (!this.isEntityDiscovered(type, id, nameHint)) {
      return;
    }

    switch (type) {
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
    }
  }

  trackBySessionId(_index: number, item: ParsedSession): number {
    return item.session.sessionId;
  }
}
