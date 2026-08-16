import {
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  OnInit,
  Output,
  ViewChild,
  inject,
  AfterViewChecked
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import {
  AiSessionManagerService,
  ChatMessage,
  ConnectionStatus,
  PendingCommand
} from './ai-session-manager.service';
import { CampaignService } from '../campaign.service';
import { DataService } from '../data.service';
import { AdminService } from '../admin.service';
import { ToastService } from '../toast.service';
import { AppView } from '../app-view.types';

interface Campaign {
  id: number;
  name: string;
  [key: string]: any;
}

interface Player {
  id: number;
  name: string;
  [key: string]: any;
}

@Component({
  selector: 'app-ai-session-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-session-manager.component.html',
  styleUrls: ['./ai-session-manager.component.css']
})
export class AiSessionManagerComponent implements OnInit, AfterViewChecked {
  @Output() viewChange = new EventEmitter<AppView>();

  @ViewChild('messagesContainer') messagesContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('inputArea') inputArea!: ElementRef<HTMLTextAreaElement>;

  private readonly destroyRef = inject(DestroyRef);

  isAdmin = false;
  messages: ChatMessage[] = [];
  connectionStatus: ConnectionStatus = 'disconnected';
  isAgentTyping = false;
  inputText = '';
  sidebarCollapsed = false;
  isAtBottom = true;

  activeCampaign: Campaign | null = null;
  activePlayers: Player[] = [];
  conversationId: string | null = null;
  agentStatus: string | null = null;

  private shouldScrollToBottom = false;
  private previousMessageCount = 0;

  constructor(
    private readonly aiService: AiSessionManagerService,
    private readonly campaignService: CampaignService,
    private readonly dataService: DataService,
    private readonly sanitizer: DomSanitizer,
    private readonly adminService: AdminService,
    private readonly toastService: ToastService
  ) {}

  ngOnInit(): void {
    // Check admin role
    this.adminService.isAdmin$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(isAdmin => {
        this.isAdmin = isAdmin;
        if (isAdmin) {
          this.aiService.connect();
        } else {
          this.aiService.disconnect();
        }
      });

    // Subscribe to real-time agent status (tools, reasoning)
    this.aiService.currentStatus$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(status => {
        this.agentStatus = status;
        if (status) {
          this.shouldScrollToBottom = true;
        }
      });

    // Subscribe to messages
    this.aiService.messages$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(messages => {
        const isNew = messages.length > this.previousMessageCount;
        this.messages = messages;
        this.previousMessageCount = messages.length;

        // Auto-scroll on new messages or streaming
        if (isNew || this.isAgentTyping) {
          this.shouldScrollToBottom = true;
        }
      });

    // Subscribe to connection status
    this.aiService.connectionStatus$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(status => {
        this.connectionStatus = status;
      });

    // Subscribe to typing state
    this.aiService.isAgentTyping$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(typing => {
        this.isAgentTyping = typing;
        if (typing) {
          this.shouldScrollToBottom = true;
        }
      });

    // Track conversation ID
    this.aiService.rawEvents$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(event => {
        if (event.type === 'response_end' && event['conversationId']) {
          this.conversationId = event['conversationId'];
        }
      });

    // Subscribe to command execution results
    this.aiService.commandResult$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(res => {
        this.shouldScrollToBottom = true;
        if (res.status === 'approved') {
          this.toastService.show(`✓ Successfully applied: ${res.summary}`, 'success', 4500);
        } else if (res.status === 'declined') {
          this.toastService.show(`✕ Declined: ${res.summary}`, 'info', 3000);
        } else if (res.status === 'error') {
          this.toastService.show(`⚠️ Execution failed: ${res.error || 'Unknown error'}`, 'error', 6000);
        }
      });

    // Get active campaign
    this.campaignService.selectedCampaign$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(campaign => {
        this.activeCampaign = campaign as Campaign | null;
      });

    // Get players
    this.dataService.getPlayers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(players => {
        this.activePlayers = (players || []) as Player[];
      });

    // Collapse sidebar on mobile by default
    if (window.innerWidth <= 768) {
      this.sidebarCollapsed = true;
    }
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom && this.isAtBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  // ─── Message Handling ─────────────────────────────────────────

  sendCurrentMessage(): void {
    const text = this.inputText.trim();
    if (!text) return;

    this.aiService.sendMessage(text, this.activeCampaign?.id);
    this.inputText = '';
    this.resetInputHeight();
    this.isAtBottom = true;
    this.shouldScrollToBottom = true;
  }

  sendQuickAction(action: string): void {
    const campaignId = this.activeCampaign?.id;
    const campaignRef = campaignId ? ` for campaign ${campaignId}` : '';

    const prompts: Record<string, string> = {
      'get-context': `Get the full campaign context${campaignRef}. Show me the current sessions, active players, NPCs, and locations.`,
      'plan-session': `Let's plan a new campaign session${campaignRef}. Follow the Session Manager skill workflow — read the previous sessions, identify unresolved plot hooks, and present 2-3 structured session ideas for my review.`,
      'conclude-session': `Let's conclude the latest session${campaignRef}. Follow the Session Manager skill conclusion workflow — fetch the latest session, then ask me debrief questions about what happened.`,
      'list-sessions': `List all sessions${campaignRef} with their titles and status (planned vs concluded).`,
    };

    const prompt = prompts[action];
    if (prompt) {
      this.aiService.sendMessage(prompt, campaignId);
      this.isAtBottom = true;
      this.shouldScrollToBottom = true;

      // Collapse sidebar on mobile after action
      if (window.innerWidth <= 768) {
        this.sidebarCollapsed = true;
      }
    }
  }

  cancelResponse(): void {
    this.aiService.cancelResponse();
  }

  startNewConversation(): void {
    this.aiService.clearHistory();
    this.conversationId = null;
    this.aiService.disconnect();
    setTimeout(() => this.aiService.connect(), 300);
  }

  reconnect(): void {
    this.aiService.connect();
  }

  // ─── Input Handling ───────────────────────────────────────────

  onInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendCurrentMessage();
    }
  }

  autoResizeInput(): void {
    if (!this.inputArea?.nativeElement) return;
    const el = this.inputArea.nativeElement;
    el.style.height = 'auto';
    el.style.height = Math.max(24, Math.min(el.scrollHeight, 120)) + 'px';
  }

  private resetInputHeight(): void {
    if (!this.inputArea?.nativeElement) return;
    this.inputArea.nativeElement.style.height = '24px';
  }

  // ─── Scroll Management ────────────────────────────────────────

  scrollToBottom(): void {
    if (!this.messagesContainer?.nativeElement) return;
    const el = this.messagesContainer.nativeElement;
    el.scrollTop = el.scrollHeight;
    this.isAtBottom = true;
  }

  onScroll(): void {
    if (!this.messagesContainer?.nativeElement) return;
    const el = this.messagesContainer.nativeElement;
    const threshold = 60;
    this.isAtBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) < threshold;
  }

  // ─── Markdown Rendering ───────────────────────────────────────

  renderMarkdown(text: string): SafeHtml {
    if (!text) return this.sanitizer.bypassSecurityTrustHtml('');

    let html = this.escapeHtml(text);

    // Code blocks (``` ... ```)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
      return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr>');

    // Blockquotes
    html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

    // Unordered lists
    html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Tables (simple)
    html = html.replace(/^\|(.+)\|$/gm, (match, content) => {
      const cells = content.split('|').map((c: string) => c.trim());
      const isHeader = cells.every((c: string) => /^[-:]+$/.test(c));
      if (isHeader) return '';
      const tag = 'td';
      return '<tr>' + cells.map((c: string) => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
    });
    html = html.replace(/((?:<tr>.*<\/tr>\n?)+)/g, '<table>$1</table>');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    // Clean up double <br> around block elements
    html = html.replace(/<br><(h[1-3]|pre|blockquote|ul|ol|table|hr)/g, '<$1');
    html = html.replace(/<\/(h[1-3]|pre|blockquote|ul|ol|table)><br>/g, '</$1>');

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ─── Command Approval Management ─────────────────────────────

  approveCommand(cmd: PendingCommand): void {
    if (cmd.status === 'approving' || cmd.status === 'approved') return;
    this.aiService.approveCommand(cmd, this.activeCampaign?.id);
    this.toastService.show(`Executing: ${cmd.summary}`, 'info');
  }

  declineCommand(cmd: PendingCommand): void {
    if (cmd.status === 'declined' || cmd.status === 'approving') return;
    this.aiService.declineCommand(cmd, this.activeCampaign?.id);
    this.toastService.show(`Declined: ${cmd.summary}`, 'info');
  }

  toggleCommandExpanded(cmd: PendingCommand): void {
    cmd.expanded = !cmd.expanded;
  }

  copyCommandLine(cmd: PendingCommand, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(cmd.rawCommandLine).then(() => {
        this.toastService.show('Command copied to clipboard!', 'success');
      });
    }
  }

  getPayloadEntries(payload: any): { key: string; value: any }[] {
    if (!payload || typeof payload !== 'object') return [];
    return Object.keys(payload).map(key => ({
      key,
      value: payload[key]
    }));
  }

  getCommandIcon(command: string): string {
    const c = (command || '').toLowerCase();
    if (c === 'save') return 'save';
    if (c === 'finalize') return 'task_alt';
    if (c.startsWith('create-npc') || c.startsWith('update-npc')) return 'person';
    if (c.startsWith('create-location') || c.startsWith('update-location')) return 'place';
    if (c.startsWith('create-shop') || c.startsWith('update-shop')) return 'storefront';
    if (c.startsWith('create-bestiary') || c.startsWith('update-bestiary') || c.startsWith('create-combat-npc')) return 'pest_control';
    if (c.startsWith('update-player')) return 'manage_accounts';
    if (c.startsWith('create-letter') || c.startsWith('update-letter')) return 'mail';
    if (c.startsWith('create-item') || c.startsWith('update-item')) return 'inventory_2';
    if (c.startsWith('create-weapon') || c.startsWith('update-weapon')) return 'colorize';
    if (c.startsWith('create-weapon-rule') || c.startsWith('update-weapon-rule')) return 'gavel';
    if (c.startsWith('create-altered-state') || c.startsWith('update-altered-state')) return 'warning';
    if (c.startsWith('create-affliction') || c.startsWith('update-affliction')) return 'healing';
    if (c.startsWith('delete-') || c === 'delete-entity') return 'delete_forever';
    return 'terminal';
  }

  formatPayloadValue(value: any): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2);
      } catch (e) {
        return String(value);
      }
    }
    return String(value);
  }

  rawResultExpanded: Record<string, boolean> = {};

  toggleRawResult(commandId: string, event?: Event): void {
    if (event) event.stopPropagation();
    this.rawResultExpanded[commandId] = !this.rawResultExpanded[commandId];
  }

  isRawResultExpanded(commandId: string): boolean {
    return Boolean(this.rawResultExpanded[commandId]);
  }

  getEntityTag(cmd: PendingCommand): string {
    if (!cmd.result) return '';
    if (cmd.result.entityTag) return cmd.result.entityTag;
    if (cmd.result.displayTag) return cmd.result.displayTag;

    const id = cmd.result.id !== undefined ? cmd.result.id : (cmd.result.sessionId !== undefined ? cmd.result.sessionId : null);
    if (id === null || id === undefined) return '';

    const c = (cmd.command || '').toLowerCase();
    if (c.includes('npc')) return `@npc[${id}]`;
    if (c.includes('location')) return `@location[${id}]`;
    if (c.includes('shop')) return `@shop[${id}]`;
    if (c.includes('bestiary')) return `@bestiary[${id}]`;
    if (c.includes('player')) return `@player[${id}]`;
    if (c.includes('letter')) return `@letter[${id}]`;
    if (c.includes('item')) return `@item[${id}]`;
    if (c.includes('weapon-rule') || c.includes('weaponrule')) return `@weaponrule[${id}]`;
    if (c.includes('weapon')) return `@weapon[${id}]`;
    if (c.includes('altered-state') || c.includes('alteredstate')) return `@alteredstate[${id}]`;
    if (c.includes('affliction')) return `@affliction[${id}]`;
    if (c.includes('save') || c.includes('finalize') || c.includes('session')) return `@session[${id}]`;

    return `@entity[${id}]`;
  }

  getEntityDisplayFields(result: any): { label: string; value: string }[] {
    if (!result || typeof result !== 'object') return [];
    const fields: { label: string; value: string }[] = [];

    const addField = (label: string, val: any) => {
      if (val !== undefined && val !== null && val !== '') {
        if (typeof val === 'object') {
          try {
            fields.push({ label, value: JSON.stringify(val) });
          } catch (e) {
            fields.push({ label, value: String(val) });
          }
        } else {
          fields.push({ label, value: String(val) });
        }
      }
    };

    addField('Faction', result.faction);
    addField('Subgroup', result.subgroup);
    addField('Role', result.role);
    addField('Location', result.location || result.locationName);
    addField('Category', result.category);
    addField('Type', result.type || result.subtype);
    if (result.price !== undefined) addField('Price', `${result.price} Gold`);
    if (result.pr !== undefined) addField('PR', String(result.pr));
    if (result.prModifier !== undefined) addField('PR Mod', result.prModifier > 0 ? `+${result.prModifier}` : String(result.prModifier));
    addField('Race', result.race || result.raceReq);
    addField('Origin', result.origin);
    addField('Personality', result.personality);
    addField('Mission', result.mission);
    addField('Effect', result.effect);
    addField('Treatment', result.treatment);
    if (result.toHeal !== undefined) addField('To Heal', String(result.toHeal));
    if (result.sessionId !== undefined) addField('Session #', String(result.sessionId));
    addField('Date', result.date);
    addField('Sender', result.senderName || result.senderRole);

    if (result.attributes && typeof result.attributes === 'object') {
      if (result.attributes.Movement) addField('Movement', `${result.attributes.Movement}"`);
      if (result.attributes.Wounds) addField('Wounds', String(result.attributes.Wounds));
      if (result.attributes.Save) addField('Save', `${result.attributes.Save}+`);
      if (result.attributes.APL) addField('APL', String(result.attributes.APL));
    }

    if (result.shipWounds) addField('Ship Wounds', String(result.shipWounds));
    if (result.defense) addField('Defense', String(result.defense));
    if (result.maxSpeed) addField('Max Speed', String(result.maxSpeed));
    if (result.maxCargo) addField('Max Cargo', String(result.maxCargo));

    if (Array.isArray(result.weapons) && result.weapons.length > 0) {
      addField('Weapons', result.weapons.join(', '));
    }
    if (Array.isArray(result.playerVisibleBranches) && result.playerVisibleBranches.length > 0) {
      addField('Visible Branches', result.playerVisibleBranches.join(', '));
    }
    if (result.message && !result.name && !result.title) {
      addField('Message', result.message);
    }

    return fields;
  }

  formatJson(val: any): string {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val;
    try {
      return JSON.stringify(val, null, 2);
    } catch (e) {
      return String(val);
    }
  }

  copyText(text: string, label: string = 'Copied to clipboard!'): void {
    if (!text) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        this.toastService.show(label, 'success');
      });
    }
  }

  isObject(val: any): boolean {
    return val !== null && typeof val === 'object' && !Array.isArray(val);
  }

  // ─── Utilities ────────────────────────────────────────────────

  trackByMessageId(_index: number, msg: ChatMessage): string {
    return msg.id;
  }
}
