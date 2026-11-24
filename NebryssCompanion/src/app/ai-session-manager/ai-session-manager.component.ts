import {
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  HostListener,
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
  AgentBackend,
  AgyModelOption,
  AiSessionManagerService,
  ChatMessage,
  ColibriEngineMode,
  ColibriEngineState,
  ColibriProfile,
  ConnectionStatus,
  ContextUsage,
  FLUX_MODE,
  STOP_MODE,
  HistoryMessage,
  HistorySnapshot,
  PendingCommand
} from './ai-session-manager.service';
import { FluxStudioComponent } from './flux-studio/flux-studio.component';

// Separates a stored user message's RAG block from the user's own text (as in colibri-bridge.js).
const USER_REQUEST_MARKER = '\n\n[USER REQUEST]\n';
const HISTORY_PREVIEW_CHARS = 280;
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
  imports: [CommonModule, FormsModule, FluxStudioComponent],
  templateUrl: './ai-session-manager.component.html',
  styleUrls: [
    './ai-session-manager.component.css',
    './ai-session-manager.engine.css',
    './ai-session-manager.history.css',
    './ai-session-manager.markdown.css'
  ]
})
export class AiSessionManagerComponent implements OnInit, AfterViewChecked {
  @Output() viewChange = new EventEmitter<AppView>();

  @ViewChild('messagesContainer') messagesContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('inputArea') inputArea!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('engineLog') engineLog?: ElementRef<HTMLPreElement>;
  @ViewChild('enginePicker') enginePicker?: ElementRef<HTMLDivElement>;
  @ViewChild('enginePickerButton') enginePickerButton?: ElementRef<HTMLButtonElement>;

  private readonly destroyRef = inject(DestroyRef);

  isAdmin = false;
  messages: ChatMessage[] = [];
  connectionStatus: ConnectionStatus = 'disconnected';
  agentBackend: AgentBackend = 'colibri';
  agyModels: AgyModelOption[] = [];
  selectedAgyModel = '';
  isAgentTyping = false;
  inputText = '';
  sidebarCollapsed = false;
  isAtBottom = true;

  activeCampaign: Campaign | null = null;
  activePlayers: Player[] = [];
  conversationId: string | null = null;
  agentStatus: string | null = null;
  contextUsage: ContextUsage | null = null;

  // Colibri's model setup (quantization + context) and the blocking popup shown while it switches
  colibriEngine: ColibriEngineState | null = null;
  engineModalOpen = false;
  engineElapsed = '';
  readonly engineSteps: { key: string; label: string }[] = [
    { key: 'stopping', label: 'Stop the running model' },
    { key: 'starting', label: 'Launch the engine' },
    { key: 'loading', label: 'Load the model' },
    { key: 'ready', label: 'Ready to answer' }
  ];
  // Experimental format (Colibri): list results as tables instead of JSON (on by default)
  experimentalFormat = true;
  // Reasoning/thinking mode for local models (off by default; toggleable per message without restart)
  thinkingEnabled = false;

  // AI Engine menu: level 1 picks Local, FLUX or AGY; level 2 the local setup (Colibri or
  // llama.cpp) or AGY's model
  engineMenuOpen = false;
  engineMenuView: 'bridges' | 'colibri' | 'agy' = 'bridges';
  // Icons for the known setups (the list itself comes from the API with the engine state)
  private readonly colibriProfileIcons: Record<string, string> = {
    'iq3xxs-64k': 'bolt',
    'q2kxl-96k': 'balance',
    'iq2m-120k': 'unfold_more',
    'llamacpp-q2kxl-150k-q8': 'star',
    'llamacpp-iq3xxs-120k-q8': 'speed',
    'llamacpp-iq3xxs-128k': 'speed',
    'llamacpp-iq3xxs-256k': 'all_inclusive'
  };
  private engineCloseTimer: any = null;
  private engineElapsedTimer: any = null;
  private shouldScrollEngineLog = false;

  // Context editor: every message the model holds, with checkboxes to delete some
  historyOpen = false;
  historyLoading = false;
  history: HistorySnapshot | null = null;
  historySelected = new Set<string>();
  historyExpanded = new Set<string>();
  historyConfirming = false;
  historyDeleting = false;

  private shouldScrollToBottom = false;
  private readonly markdownCache = new Map<string, SafeHtml>();
  private previousMessageCount = 0;

  constructor(
    private readonly aiService: AiSessionManagerService,
    private readonly campaignService: CampaignService,
    private readonly dataService: DataService,
    private readonly sanitizer: DomSanitizer,
    private readonly adminService: AdminService,
    private readonly toastService: ToastService
  ) { }

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

    // Subscribe to active AI backend (Colibri / AGY)
    this.aiService.agentBackend$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(backend => {
        this.agentBackend = backend;
      });

    // Subscribe to AGY model list and selected model
    this.aiService.agyModels$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(models => {
        this.agyModels = models;
      });

    this.aiService.agyModel$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(model => {
        this.selectedAgyModel = model;
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

    // How full the model's context is (Colibri reports it with each reply)
    this.aiService.contextUsage$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(usage => {
        this.contextUsage = usage;
      });

    this.aiService.experimentalFormat$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(on => {
        this.experimentalFormat = on;
      });

    this.aiService.thinkingEnabled$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(on => {
        this.thinkingEnabled = on;
      });

    // Colibri engine state and switch progress (from this or any other open UI)
    this.aiService.colibriEngine$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(state => this.onColibriEngineState(state));
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.engineCloseTimer);
      clearInterval(this.engineElapsedTimer);
    });

    // Track conversation ID
    this.aiService.rawEvents$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(event => {
        if (event.type === 'response_end' && event['conversationId']) {
          this.conversationId = event['conversationId'];
        }
        // A reply finished while the context editor is open: show what it added.
        if (event.type === 'response_end' && this.historyOpen) {
          this.aiService.requestHistory();
        }
      });

    this.aiService.history$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(snapshot => this.onHistory(snapshot));

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

    // Get active campaign — notify the AI bridge when it changes
    this.campaignService.selectedCampaign$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(campaign => {
        const previousId = this.activeCampaign?.id;
        this.activeCampaign = campaign as Campaign | null;
        const newId = campaign?.id;

        // Notify the backend bridge of the new active campaign whenever it changes
        if (newId !== undefined && newId !== previousId) {
          this.aiService.setActiveCampaign(newId);
        }

        // Re-fetch players for the newly selected campaign
        this.dataService.getPlayers()
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(players => {
            this.activePlayers = (players || []) as Player[];
          });
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
    if (this.shouldScrollEngineLog && this.engineLog) {
      const el = this.engineLog.nativeElement;
      el.scrollTop = el.scrollHeight;
      this.shouldScrollEngineLog = false;
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

  /**
   * Draft templates for the "Draft" quick actions: they fill the message box (nothing is sent),
   * with [bracketed] fields to replace. The fields follow the designer guides' schemas.
   */
  readonly draftTemplates: { id: string; label: string; icon: string; text: string }[] = [
    {
      id: 'weapon', label: 'Weapon', icon: 'colorize',
      text: 'Design a new weapon: [name or concept]. Kind: [melee / ranged / heavy / spell]. ' +
        'Wielder body: [human / astartes / universal / spell / ...]. Profiles: [one, or e.g. Standard + Overcharge]. ' +
        'Feel: [e.g. slow but devastating]. Special rules: [rules it should have, or "suggest existing ones"]. ' +
        'Price: [mistrals, 0-250]. Use only existing weapon rules, and draft it in chat first; do not stage it until I approve.'
    },
    {
      id: 'npc', label: 'NPC', icon: 'person_add',
      text: 'Create a new NPC: [name]. Faction: [Imperium of Man / Gilded Accord / Abyssal Cabal / Nebryssian Liberation Republic / Crimson Corsairs]. ' +
        'Role: [e.g. dock master, smuggler captain]. Location: [an existing location]. Personality: [traits]. ' +
        'Mission and methods: [what they want and how they get it]. Combat: [civilian / fighter with bestiary stats]. ' +
        'Hooks: [ties to players, NPCs or past sessions]. Draft it in chat first; do not stage it until I approve.'
    },
    {
      id: 'bestiary', label: 'Creature', icon: 'pest_control',
      text: 'Create a new bestiary creature: [name or concept]. Faction: [Imperium of Man / Gilded Accord / Abyssal Cabal / Nebryssian Liberation Republic / Crimson Corsairs]. ' +
        'Subgroup: [e.g. Construct, Daemon, Behemoth, Swarm]. Threat tier: [minion / troop / elite / boss]. Habitat: [where it lives]. ' +
        'Weapons: [existing weapons it should use, or "suggest some"]. Abilities: [special traits]. ' +
        'Use only existing weapons, calculate its PR, and draft it in chat first; do not stage it until I approve.'
    },
    {
      id: 'location', label: 'Location', icon: 'add_location_alt',
      text: 'Create a new location: [name]. Category: [fortress / trading post / city / island / ruins / reef / sanctuary / shipwreck / dock], size [1-5]. ' +
        'Faction: [faction, or Neutral / Forces of Nature]. Map position: [near which existing location, or "pick a free spot"]. ' +
        'Description: [atmosphere and key features]. Secrets: [hidden hooks for the GM]. Discovered by the players: [yes / no]. ' +
        'Include a battle map layout. Draft it in chat first; do not stage it until I approve.'
    }
  ];

  /** Puts a draft template in the message box (without sending it) and selects its first [field]. */
  prefillDraft(id: string): void {
    const template = this.draftTemplates.find(t => t.id === id);
    if (!template) return;
    const current = this.inputText.trim();
    const isTemplate = this.draftTemplates.some(t => t.text === current);
    if (current && !isTemplate && !window.confirm('Replace the text in the message box with this template?')) return;

    this.inputText = template.text;
    if (window.innerWidth <= 768) this.sidebarCollapsed = true;
    // After Angular has written the new value into the textarea.
    setTimeout(() => {
      const el = this.inputArea?.nativeElement;
      if (!el) return;
      this.autoResizeInput();
      el.focus();
      const start = template.text.indexOf('[');
      const end = template.text.indexOf(']', start);
      if (start >= 0 && end > start) el.setSelectionRange(start, end + 1);
      el.scrollTop = 0;
    });
  }

  inspectPlayer(player: Player): void {
    if (this.isAgentTyping || this.connectionStatus !== 'connected') return;

    const campaignId = this.activeCampaign?.id;
    const campaignRef = campaignId ? ` in campaign ${campaignId}` : '';
    const prompt =
      `Give me ALL information regarding player "${player.name}" (ID ${player.id})${campaignRef}. ` +
      `Fetch their full player record and cross-reference all related data so nothing is omitted: ` +
      `1) Identity, race, origin, notes, and complete stats/attributes (including effective/modified values if applicable); ` +
      `2) All equipped/owned weapons with their full profiles and all weapon rules with their full descriptions; ` +
      `3) All abilities, equipment, items/inventory (with descriptions/quantities), and progression (talent points, digital and physical mistrals); ` +
      `4) All talents with their full descriptions and mechanical effects; ` +
      `5) All afflictions and any active altered states (if applicable) with their full descriptions and effects; ` +
      `6) Session participation across all sessions (which sessions they appeared in, their actions, choices, and outcomes): ` +
      `the player record does not include it, so read the sessions (search_sessions for their name).`;

    this.aiService.sendMessage(prompt, campaignId);
    this.isAtBottom = true;
    this.shouldScrollToBottom = true;

    if (window.innerWidth <= 768) {
      this.sidebarCollapsed = true;
    }
  }

  cancelResponse(): void {
    this.aiService.cancelResponse();
  }

  get showThinkingToggle(): boolean {
    return this.agentBackend === 'colibri';
  }

  toggleThinking(): void {
    this.aiService.setThinkingEnabled(!this.thinkingEnabled);
  }

  toggleMessageReasoning(msg: ChatMessage): void {
    msg.reasoningExpanded = !msg.reasoningExpanded;
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

  /** 12345 -> "12.3k" for the context gauge. */
  formatTokens(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return '0';
    return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(Math.round(value));
  }

  /**
   * llama.cpp only: how much of the last request's prompt the server reused from its cache,
   * e.g. "Cache reused 250.1k of 251.0k prompt tokens · 61 tok/s". Empty for Colibri.
   */
  get contextCacheLine(): string {
    const u = this.contextUsage;
    if (!u || u.engine !== 'llamacpp' || u.cachedTokens === undefined) return '';
    const prompt = u.cachedTokens + (u.newPromptTokens || 0);
    const speed = u.replyPerSecond ? ` · ${u.replyPerSecond} tok/s` : '';
    return `Cache reused ${this.formatTokens(u.cachedTokens)} of ${this.formatTokens(prompt)} prompt tokens${speed}`;
  }

  /** Tooltip for the cache line: the last request's new prompt tokens and both speeds. */
  get contextSpeedTitle(): string {
    const u = this.contextUsage;
    if (!u || u.engine !== 'llamacpp') return '';
    const rate = (v?: number) => (v ? `${v} tok/s` : 'an unknown speed');
    return `llama.cpp, last request: read ${this.formatTokens(u.newPromptTokens || 0)} new prompt tokens at ` +
      `${rate(u.promptPerSecond)} and wrote the reply at ${rate(u.replyPerSecond)}.`;
  }

  /** Gauge colour step: normal until the bridge is close to trimming old messages. */
  get contextLevel(): 'ok' | 'warn' | 'high' {
    const u = this.contextUsage;
    if (!u || !u.historyBudget) return 'ok';
    const ofBudget = u.used / u.historyBudget;
    return ofBudget >= 0.9 ? 'high' : ofBudget >= 0.7 ? 'warn' : 'ok';
  }

  switchBackend(backend: AgentBackend): void {
    if (this.isAgentTyping || this.agentBackend === backend) return;
    this.aiService.setAgentBackend(backend);
    this.conversationId = null;
    this.toastService.show(
      `Switched AI Engine to ${backend === 'agy' ? 'AGY' : 'Local'}`,
      'info',
      3000
    );
  }

  onExperimentalFormatChange(enabled: boolean): void {
    this.aiService.setExperimentalFormat(enabled);
    this.toastService.show(
      enabled ? 'Experimental format on: lists go to the model as tables' : 'Experimental format off: lists go to the model as JSON',
      'info',
      3000
    );
  }

  // ─── Context editor (all stored messages) ────────────────────

  openHistory(): void {
    this.historyOpen = true;
    this.historyConfirming = false;
    this.refreshHistory();
  }

  closeHistory(): void {
    this.historyOpen = false;
    this.historyConfirming = false;
    this.historySelected.clear();
    this.historyExpanded.clear();
  }

  refreshHistory(): void {
    if (!this.aiService.requestHistory()) {
      this.historyLoading = false;
      this.toastService.show('Not connected to the AI bridge; reconnect and try again.', 'error', 4000);
      return;
    }
    this.historyLoading = true;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.historyOpen) return;
    if (this.historyConfirming) this.historyConfirming = false;
    else this.closeHistory();
  }

  get historyMessages(): HistoryMessage[] {
    return this.history?.messages || [];
  }

  private get selectableHistory(): HistoryMessage[] {
    return this.historyMessages.filter(m => !m.locked && !m.deleted);
  }

  /** Messages the model still holds (the list also shows deleted ones, greyed out). */
  get liveHistoryCount(): number {
    return this.historyMessages.length - (this.history?.deletedCount || 0);
  }

  get allHistorySelected(): boolean {
    const selectable = this.selectableHistory;
    return selectable.length > 0 && selectable.every(m => this.historySelected.has(m.id));
  }

  get selectedHistoryTokens(): number {
    return this.historyMessages
      .filter(m => this.historySelected.has(m.id))
      .reduce((sum, m) => sum + m.tokens, 0);
  }

  /** A tool call and its results are selected together: the model cannot have one without the other. */
  toggleHistorySelect(msg: HistoryMessage): void {
    if (msg.locked || msg.deleted) return;
    const members = msg.group ? this.historyMessages.filter(m => m.group === msg.group && !m.deleted) : [msg];
    const select = !this.historySelected.has(msg.id);
    for (const m of members) {
      if (select) this.historySelected.add(m.id);
      else this.historySelected.delete(m.id);
    }
    this.historyConfirming = false;
  }

  toggleSelectAllHistory(): void {
    if (this.allHistorySelected) this.historySelected.clear();
    else for (const m of this.selectableHistory) this.historySelected.add(m.id);
    this.historyConfirming = false;
  }

  toggleHistoryExpanded(msg: HistoryMessage): void {
    if (this.historyExpanded.has(msg.id)) this.historyExpanded.delete(msg.id);
    else this.historyExpanded.add(msg.id);
  }

  /** First click arms the button; the second deletes. */
  deleteSelectedHistory(): void {
    if (this.historySelected.size === 0 || this.history?.processing || this.historyDeleting) return;
    if (!this.historyConfirming) {
      this.historyConfirming = true;
      return;
    }
    if (!this.aiService.deleteHistoryMessages([...this.historySelected])) {
      this.toastService.show('Not connected to the AI bridge; reconnect and try again.', 'error', 4000);
      return;
    }
    this.historyConfirming = false;
    this.historyDeleting = true;
  }

  historyRoleLabel(msg: HistoryMessage): string {
    if (msg.role === 'system') return 'System prompt';
    if (msg.role === 'tool') return 'Tool result';
    if (msg.role === 'assistant') return msg.toolCalls.length ? 'Assistant · tool call' : 'Assistant';
    if (msg.role === 'user') return msg.content.startsWith('[BRIDGE CHECK]') ? 'Bridge note' : 'User';
    return msg.role;
  }

  /** Name of the tool whose call a tool result answers. */
  historyToolName(msg: HistoryMessage): string {
    if (!msg.toolCallId) return '';
    for (const m of this.historyMessages) {
      const call = m.toolCalls.find(tc => tc.id === msg.toolCallId);
      if (call) return call.name;
    }
    return '';
  }

  historyToolNames(msg: HistoryMessage): string {
    return msg.toolCalls.map(tc => tc.name).join(', ');
  }

  /** Collapsed view: a user message's own request (its RAG block hidden), cut to a few lines. */
  historyPreview(msg: HistoryMessage): string {
    let text = msg.content || '';
    const marker = text.indexOf(USER_REQUEST_MARKER);
    if (msg.ragChars > 0 && marker >= 0) text = text.slice(marker + USER_REQUEST_MARKER.length);
    if (!text && msg.toolCalls.length) {
      text = msg.toolCalls.map(tc => `${tc.name}(${tc.arguments})`).join('\n');
    }
    return text.length > HISTORY_PREVIEW_CHARS ? `${text.slice(0, HISTORY_PREVIEW_CHARS)}...` : text;
  }

  historyHasMore(msg: HistoryMessage): boolean {
    return (msg.content || '').length > HISTORY_PREVIEW_CHARS || msg.ragChars > 0 ||
      msg.toolCalls.length > 0 || Boolean(msg.reasoning);
  }

  formatToolArguments(args: string): string {
    try {
      return JSON.stringify(JSON.parse(args), null, 2);
    } catch (_) {
      return args;
    }
  }

  trackByHistoryId(_index: number, msg: HistoryMessage): string {
    return msg.id;
  }

  private onHistory(snapshot: HistorySnapshot): void {
    this.history = snapshot;
    this.historyLoading = false;
    this.historyDeleting = false;

    const present = new Set(snapshot.messages.map(m => m.id));
    const live = new Set(snapshot.messages.filter(m => !m.deleted).map(m => m.id));
    for (const id of [...this.historySelected]) if (!live.has(id)) this.historySelected.delete(id);
    for (const id of [...this.historyExpanded]) if (!present.has(id)) this.historyExpanded.delete(id);

    const outcome = snapshot.outcome;
    if (!outcome) return;
    if (!outcome.ok) {
      this.toastService.show(outcome.error || 'Could not delete the messages.', 'error', 5000);
    } else if (outcome.notFound) {
      this.toastService.show(
        `Deleted ${outcome.deleted || 0} message(s); ${outcome.notFound} had changed (the bridge trimmed them). Check the list and try again.`,
        'info',
        6000
      );
    } else if (outcome.deleted) {
      this.toastService.show(`Removed ${outcome.deleted} message(s) from the model's context`, 'success', 3500);
    }
  }

  // ─── AI Engine menu ──────────────────────────────────────────

  /** Second line of the AI Engine button / Local row: the running model setup. */
  get colibriEngineSummary(): string {
    const e = this.colibriEngine;
    if (!e) return 'Checking model...';
    if (e.switching) return e.targetMode === STOP_MODE ? 'Stopping...' : `Switching to ${this.engineProfileLabel(e.targetMode)}...`;
    if (e.mode === FLUX_MODE) return 'Stopped: FLUX has the GPU';
    if (e.mode === 'offline') return 'Server offline';
    if (e.mode === 'unknown') return 'Port in use';
    if (e.mode === 'custom') {
      const engine = e.engineName ? `${e.engineName} ` : '';
      return `${engine}${e.runningModel || 'Other model'}${e.contextTokens ? ` · ${this.formatContext(e.contextTokens)}` : ''}`;
    }
    return `${this.engineProfileLabel(e.mode)} context`;
  }

  /**
   * The local engine running now ('Colibri' / 'llama.cpp'), for messages; while a switch starts
   * one, the engine being started. '' when none is running.
   */
  get localEngineName(): string {
    const e = this.colibriEngine;
    if (!e) return '';
    if (e.switching && e.targetMode !== FLUX_MODE && e.targetMode !== STOP_MODE && e.targetEngineName) return e.targetEngineName;
    return e.engineName || '';
  }

  /** A setup's name in the Local menu: "llama.cpp · IQ3_XXS". */
  profileName(p: ColibriProfile): string {
    return p.engineName ? `${p.engineName} · ${p.label}` : p.label;
  }

  /** A setup's second line in the Local menu: "120k max context · 8-bit KV cache". */
  profileDescription(p: ColibriProfile): string {
    return `${this.formatContext(p.contextTokens)} max context · ${this.kvCacheLabel(p.kvCache)} KV cache`;
  }

  /** 'q8_0' -> '8-bit', 'f16' (or unset) -> '16-bit'. */
  kvCacheLabel(kv: string | undefined): string {
    if (!kv || kv === 'f16') return '16-bit';
    const bits = /^q(\d+)/i.exec(kv);
    return bits ? `${bits[1]}-bit` : kv;
  }

  /** The model setups the switch offers (sent by the API with the engine state). */
  get colibriProfiles(): ColibriProfile[] {
    return this.colibriEngine?.profiles || [];
  }

  colibriProfileIcon(id: string): string {
    return this.colibriProfileIcons[id] || 'memory';
  }

  /** 65536 -> "64k", 96000 -> "96k", 120000 -> "120k". */
  formatContext(tokens: number): string {
    if (!tokens) return '';
    return `${tokens % 1024 === 0 ? tokens / 1024 : Math.round(tokens / 1000)}k`;
  }

  /** Second line of the AI Engine button / Antigravity row: the chosen model. */
  get agyModelLabel(): string {
    if (!this.selectedAgyModel) return 'Default model';
    return this.agyModels.find(m => m.id === this.selectedAgyModel)?.label || this.selectedAgyModel;
  }

  toggleEngineMenu(): void {
    if (this.engineMenuOpen) {
      this.closeEngineMenu();
      return;
    }
    this.engineMenuOpen = true;
    this.engineMenuView = 'bridges';
    this.focusFirstEngineMenuItem();
  }

  openEngineMenuView(view: 'bridges' | 'colibri' | 'agy'): void {
    this.engineMenuView = view;
    if (view === 'colibri') this.aiService.requestColibriEngine();
    if (view === 'agy' && this.agyModels.length === 0) this.aiService.requestAgyModels();
    this.focusFirstEngineMenuItem(view === 'bridges' ? 0 : 1);
  }

  closeEngineMenu(returnFocus = false): void {
    this.engineMenuOpen = false;
    if (returnFocus) this.enginePickerButton?.nativeElement.focus();
  }

  chooseColibriEngine(mode: ColibriEngineMode): void {
    this.closeEngineMenu();
    this.aiService.imageStudioOverAgy = false;
    if (this.agentBackend !== 'colibri') this.switchBackend('colibri');
    if (this.colibriEngine?.mode !== mode) this.switchColibriEngine(mode);
  }

  // ─── FLUX images (ComfyUI takes the GPU instead of Colibri) ───

  /**
   * FLUX has the GPU and the studio is picked: the image studio replaces the chat. With
   * Colibri that is whenever FLUX runs; with Antigravity only once FLUX was picked in the menu
   * (the AGY conversation goes on underneath, and comes back when Antigravity is picked again).
   */
  get fluxActive(): boolean {
    return this.colibriEngine?.mode === FLUX_MODE &&
      (this.agentBackend === 'colibri' || this.aiService.imageStudioOverAgy);
  }

  /** Second line of the FLUX row in the AI Engine menu. */
  get fluxSummary(): string {
    const e = this.colibriEngine;
    if (e?.switching && e.targetMode === FLUX_MODE) return 'Starting ComfyUI...';
    if (e?.mode === FLUX_MODE) return 'ComfyUI is running';
    return `Stops ${this.localEngineName || 'the local model'}, starts ComfyUI`;
  }

  /** Opens the studio, keeping the current bridge and its conversation (Colibri's or AGY's). */
  chooseFlux(): void {
    this.closeEngineMenu();
    if (this.agentBackend === 'agy') this.aiService.imageStudioOverAgy = true;
    if (this.colibriEngine?.mode !== FLUX_MODE) this.switchColibriEngine(FLUX_MODE);
  }

  chooseAgyModel(modelId: string): void {
    this.closeEngineMenu();
    this.aiService.imageStudioOverAgy = false;
    if (this.agentBackend !== 'agy') this.switchBackend('agy');
    if (this.selectedAgyModel !== modelId) this.onAgyModelChange(modelId);
  }

  // ─── Stop the GPU engine (Colibri or ComfyUI) ────────────────

  /** Colibri (one of the setups, or one started some other way) or ComfyUI is running. */
  get canStopEngine(): boolean {
    const e = this.colibriEngine;
    return !!e && !e.switching && e.mode !== 'offline' && e.mode !== 'unknown';
  }

  /** Text of the stop button: what it stops. */
  get stopEngineLabel(): string {
    return this.colibriEngine?.mode === FLUX_MODE ? 'Stop ComfyUI (FLUX)' : `Stop ${this.localEngineName || 'the local engine'}`;
  }

  /** Stops the running engine and frees the GPU; the conversation is kept for the next start. */
  stopEngine(): void {
    if (!this.canStopEngine) return;
    const flux = this.colibriEngine?.mode === FLUX_MODE;
    const busy = flux && ['queued', 'loading', 'sampling', 'decoding'].includes(this.aiService.fluxJobPhase || '');
    const question = flux
      ? `Stop ComfyUI and free the GPU?${busy ? ' The image being made is cancelled.' : ''} Unsaved images stay in the temporary folder.`
      : `Stop ${this.localEngineName || 'the local engine'} and free the GPU? The conversation is kept; pick a Local setup to start it again.`;
    if (!window.confirm(question)) return;
    if (!this.aiService.stopColibriEngine()) {
      this.toastService.show('Not connected to the AI bridge; reconnect and try again.', 'error', 4000);
      return;
    }
    this.openEngineModal();
  }

  // ─── Start the default local setup (one click, no menu) ──────

  /** The setup the Start button starts (llama.cpp UD-Q2_K_XL 150k), sent by the API. */
  get defaultEngineProfile(): ColibriProfile | null {
    return this.colibriEngine?.defaultProfile || null;
  }

  /** Nothing holds the GPU (the local engine was stopped or is not running) and no switch is on. */
  get canStartEngine(): boolean {
    const e = this.colibriEngine;
    return !!e && !e.switching && e.mode === 'offline' && !!this.defaultEngineProfile;
  }

  /** Text of the start button: "Start llama.cpp · UD-Q2_K_XL". */
  get startEngineLabel(): string {
    const p = this.defaultEngineProfile;
    return p ? `Start ${this.profileName(p)}` : 'Start the local engine';
  }

  /** Starts the default setup and makes Local the agent, as picking it in the menu does. */
  startEngine(): void {
    const p = this.defaultEngineProfile;
    if (!this.canStartEngine || !p) return;
    this.chooseColibriEngine(p.id);
  }

  /** Arrow keys move between the menu's items; Escape closes it. */
  onEngineMenuKeydown(event: KeyboardEvent): void {
    if (!this.engineMenuOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.engineMenuView !== 'bridges') this.openEngineMenuView('bridges');
      else this.closeEngineMenu(true);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = this.engineMenuItems();
    if (items.length === 0) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'ArrowDown'
      ? (index + 1) % items.length
      : (index <= 0 ? items.length - 1 : index - 1);
    items[next].focus();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    // composedPath() is fixed when the click happens: switching menu levels removes the clicked
    // button before this runs, so `contains(event.target)` would wrongly count it as outside.
    const picker = this.enginePicker?.nativeElement;
    if (this.engineMenuOpen && picker && !event.composedPath().includes(picker)) {
      this.closeEngineMenu();
    }
  }

  private engineMenuItems(): HTMLButtonElement[] {
    const root = this.enginePicker?.nativeElement;
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLButtonElement>('.engine-menu button:not([disabled])'));
  }

  private focusFirstEngineMenuItem(index = 0): void {
    setTimeout(() => {
      const items = this.engineMenuItems();
      (items[index] || items[0])?.focus();
    });
  }

  // ─── Colibri model setup (quantization + context) ────────────

  switchColibriEngine(mode: ColibriEngineMode): void {
    const engine = this.colibriEngine;
    if (this.isAgentTyping || engine?.switching || engine?.mode === mode) return;
    if (!this.aiService.switchColibriEngine(mode)) {
      this.toastService.show('Not connected to the AI bridge; reconnect and try again.', 'error', 4000);
      return;
    }
    // Block the UI at once; the server's first progress update follows within a moment.
    this.openEngineModal();
  }

  closeEngineModal(): void {
    if (this.colibriEngine?.switching) return;
    this.engineModalOpen = false;
    clearTimeout(this.engineCloseTimer);
    clearInterval(this.engineElapsedTimer);
  }

  /** "llama.cpp IQ3_XXS · 120k" for a setup id (also the running one when it is not offered). */
  engineProfileLabel(mode: string | null | undefined): string {
    if (mode === FLUX_MODE) return this.colibriEngine?.flux?.label || 'FLUX.1 [dev]';
    const running = this.colibriEngine?.runningProfile;
    const profile = this.colibriProfiles.find(p => p.id === mode) || (running && running.id === mode ? running : null);
    if (!profile) return 'the new model';
    const engine = profile.engineName ? `${profile.engineName} ` : '';
    return `${engine}${profile.label} · ${this.formatContext(profile.contextTokens)}`;
  }

  /** A setup the server is running (as opposed to offline, another program, or our own state). */
  private isRunningSetup(mode: string | undefined): boolean {
    return !!mode && mode !== 'offline' && mode !== 'unknown';
  }

  get engineStatusText(): string {
    const e = this.colibriEngine;
    if (!e) return 'Checking...';
    if (e.switching) return e.targetMode === STOP_MODE ? 'Stopping the engine...' : `Switching to ${this.engineProfileLabel(e.targetMode)}...`;
    switch (e.mode) {
      case FLUX_MODE:
        return 'FLUX (ComfyUI) has the GPU, so the local model is stopped';
      case 'offline':
        return 'No local model server is running';
      case 'unknown':
        return 'Port in use by another program';
      case 'custom':
        return `Running ${e.runningModel || 'a model of its own'}` +
          (e.contextTokens ? ` with ${this.formatContext(e.contextTokens)} context` : '') + ', not one of these setups';
      default:
        return `Running ${this.engineProfileLabel(e.mode)} context`;
    }
  }

  /** The switch popup is about FLUX (starting ComfyUI) rather than a Colibri model. */
  get engineTargetIsFlux(): boolean {
    return this.colibriEngine?.targetMode === FLUX_MODE;
  }

  /** The popup is about stopping the engine (nothing is started). */
  get engineTargetIsStop(): boolean {
    return this.colibriEngine?.targetMode === STOP_MODE;
  }

  /** A stop has only two steps: stop, then the GPU is free (launch and load are skipped). */
  engineStepVisible(index: number): boolean {
    return !this.engineTargetIsStop || index === 0 || index === this.engineSteps.length - 1;
  }

  /** A step's text in the switch popup. */
  engineStepLabel(index: number): string {
    if (this.engineTargetIsStop) return index === 0 ? 'Stop the running engine' : 'GPU is free';
    const flux = this.engineTargetIsFlux;
    if (index === 0) return flux ? 'Stop the local model (frees the GPU)' : this.engineSteps[0].label;
    if (index === 1) return flux ? 'Launch ComfyUI' : 'Launch ' + this.engineProfileLabel(this.colibriEngine?.targetMode);
    if (index === 2) return flux ? 'Load ComfyUI' : this.engineSteps[2].label;
    return flux ? 'Ready to make images' : this.engineSteps[3].label;
  }

  get engineModalTitle(): string {
    const e = this.colibriEngine;
    if (this.engineTargetIsStop) {
      return e?.phase === 'error' ? 'Stopping the engine failed' : e?.phase === 'ready' ? 'Engine stopped' : 'Stopping the engine';
    }
    if (e?.phase === 'error') return 'Engine switch failed';
    if (e?.phase === 'ready') return this.engineTargetIsFlux ? 'FLUX is ready' : `${this.localEngineName || 'The local engine'} is ready`;
    return this.engineTargetIsFlux ? 'Switching to FLUX images' : 'Switching to ' + this.engineProfileLabel(e?.targetMode);
  }

  /** done / active / error / pending, for a step of the switch popup. */
  engineStepStatus(index: number): 'done' | 'active' | 'error' | 'pending' {
    const e = this.colibriEngine;
    if (!e) return index === 0 ? 'active' : 'pending';
    const order = this.engineSteps.map(s => s.key);
    if (e.phase === 'ready') return 'done';
    if (e.phase === 'error') {
      const failed = Math.max(0, order.indexOf(e.failedPhase || 'stopping'));
      return index < failed ? 'done' : index === failed ? 'error' : 'pending';
    }
    const current = Math.max(0, order.indexOf(e.phase));
    return index < current ? 'done' : index === current ? 'active' : 'pending';
  }

  private openEngineModal(): void {
    clearTimeout(this.engineCloseTimer);
    if (!this.engineModalOpen) {
      this.engineModalOpen = true;
      this.updateEngineElapsed();
      clearInterval(this.engineElapsedTimer);
      this.engineElapsedTimer = setInterval(() => this.updateEngineElapsed(), 1000);
    }
  }

  private onColibriEngineState(state: ColibriEngineState | null): void {
    const previous = this.colibriEngine;
    this.colibriEngine = state;
    if (!state) return;

    if (state.switching) {
      this.openEngineModal();
    } else if (state.mode === 'offline' && this.isRunningSetup(previous?.mode) && !previous?.switching) {
      // Its terminal window was closed (or the server stopped some other way).
      this.toastService.show(state.message || `${previous?.engineName || 'The local engine'} stopped.`, 'info', 5000);
    } else if (this.engineModalOpen && previous?.switching) {
      clearInterval(this.engineElapsedTimer);
      this.updateEngineElapsed();
      if (state.phase === 'ready') {
        this.toastService.show(state.message || `Running ${this.engineProfileLabel(state.mode)}`, 'success', 4000);
        this.engineCloseTimer = setTimeout(() => this.closeEngineModal(), 1500);
      }
      // On an error the popup stays open until it is closed, so the error can be read.
    }
    if (this.engineModalOpen) this.shouldScrollEngineLog = true;
  }

  private updateEngineElapsed(): void {
    const started = this.colibriEngine?.startedAt;
    if (!started) {
      this.engineElapsed = '';
      return;
    }
    const secs = Math.max(0, Math.round((Date.now() - started) / 1000));
    this.engineElapsed = secs >= 60 ? `${Math.floor(secs / 60)}m ${String(secs % 60).padStart(2, '0')}s` : `${secs}s`;
  }

  onAgyModelChange(modelId: string): void {
    if (this.isAgentTyping) return;
    this.aiService.setAgyModel(modelId);
    const matched = this.agyModels.find(m => m.id === modelId);
    this.toastService.show(
      `AGY model set to ${matched ? matched.label : (modelId || 'Default')}`,
      'info',
      2500
    );
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

  /**
   * The rendered HTML of a message, cached by its text. The template calls this on every change
   * detection; a new SafeHtml object each time made Angular rebuild the message's DOM each time,
   * so a click on a code block's Copy button was lost when anything (e.g. the message box losing
   * focus) triggered change detection between mouse-down and mouse-up.
   */
  renderMarkdown(text: string): SafeHtml {
    const key = text || '';
    const cached = this.markdownCache.get(key);
    if (cached) return cached;
    const html = this.buildMarkdown(key);
    this.markdownCache.set(key, html);
    // Streaming replies add a new text per token: keep only the most recent entries.
    if (this.markdownCache.size > 300) {
      const oldest = this.markdownCache.keys().next().value;
      if (oldest !== undefined) this.markdownCache.delete(oldest);
    }
    return html;
  }

  private buildMarkdown(text: string): SafeHtml {
    if (!text) return this.sanitizer.bypassSecurityTrustHtml('');

    let html = this.escapeHtml(text);

    // Code blocks (``` ... ```): set aside first, so the rules below (line breaks, bold, italics,
    // lists) leave their text exactly as written, and give each a Copy button (see onMessagesClick).
    const codeBlocks: string[] = [];
    html = html.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_match, lang, code) => {
      const body = code.replace(/^\n+/, '').replace(/\s+$/, '');
      codeBlocks.push(
        '<div class="code-block">' +
        '<button type="button" class="code-copy-btn" title="Copy to clipboard" aria-label="Copy code">' +
        '<span class="material-icons" aria-hidden="true">content_copy</span><span class="code-copy-label">Copy</span></button>' +
        `<pre><code class="language-${lang}">${body}</code></pre></div>`
      );
      return `\u0000CODE${codeBlocks.length - 1}\u0000`;
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

    // Code blocks back in place
    html = html.replace(/\u0000CODE(\d+)\u0000/g, (_match, i) => codeBlocks[Number(i)] || '');

    // Clean up double <br> around block elements
    html = html.replace(/<br><(h[1-3]|pre|blockquote|ul|ol|table|hr|div)/g, '<$1');
    html = html.replace(/<\/(h[1-3]|pre|blockquote|ul|ol|table|div)><br>/g, '</$1>');

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
    if (c === 'save' || c === 'update-session') return 'save';
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
    addField('Location', result.location);
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

  copyText(text: string, label: string = 'Copied to clipboard!'): Promise<boolean> {
    if (!text) return Promise.resolve(false);
    const done = (ok: boolean) => {
      this.toastService.show(ok ? label : 'Could not copy; select the text and copy it by hand.', ok ? 'success' : 'error');
      return ok;
    };
    // navigator.clipboard only exists on https or localhost; over plain http on the LAN, fall back.
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(() => done(true), () => done(this.copyWithTextarea(text)));
    }
    return Promise.resolve(done(this.copyWithTextarea(text)));
  }

  private copyWithTextarea(text: string): boolean {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    document.body.removeChild(area);
    return ok;
  }

  /** Copy buttons on code blocks in agent messages (they are inside [innerHTML], so no Angular bindings). */
  onMessagesClick(event: MouseEvent): void {
    const button = (event.target as HTMLElement | null)?.closest?.('.code-copy-btn') as HTMLElement | null;
    if (!button) return;
    const code = button.parentElement?.querySelector('pre code');
    const text = code?.textContent || '';
    if (!text) return;
    this.copyText(text, 'Copied!').then((ok) => {
      if (!ok) return;
      const label = button.querySelector('.code-copy-label');
      const icon = button.querySelector('.material-icons');
      button.classList.add('copied');
      if (label) label.textContent = 'Copied';
      if (icon) icon.textContent = 'check';
      setTimeout(() => {
        button.classList.remove('copied');
        if (label) label.textContent = 'Copy';
        if (icon) icon.textContent = 'content_copy';
      }, 1500);
    });
  }

  isObject(val: any): boolean {
    return val !== null && typeof val === 'object' && !Array.isArray(val);
  }

  // ─── Utilities ────────────────────────────────────────────────

  trackByMessageId(_index: number, msg: ChatMessage): string {
    return msg.id;
  }
}
