import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject, Observable } from 'rxjs';
import { AuthService } from '../auth.service';
import { AdminService } from '../admin.service';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
export type AgentBackend = 'colibri' | 'agy';

export interface AgyModelOption {
  id: string;
  label: string;
}

export interface PendingCommand {
  id: string;
  command: string;
  rawCommandLine: string;
  summary: string;
  payload?: Record<string, any>;
  status: 'pending' | 'approving' | 'approved' | 'declining' | 'declined' | 'error';
  result?: any;
  error?: string;
  timestamp: Date;
  expanded?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  toolCalls?: ToolCallInfo[];
  pendingCommands?: PendingCommand[];
}

export interface ToolCallInfo {
  name: string;
  args?: any;
  status: string;
  summary?: string;
  output?: string;
}

export interface AgentEvent {
  type: string;
  [key: string]: any;
}

/** How full the model's context is, as reported by the Colibri bridge with each reply. */
export interface ContextUsage {
  used: number;          // tokens in the conversation after the last reply
  limit: number;         // the server's context size
  replyReserve: number;  // tokens kept free for a reply
  historyBudget: number; // size at which the bridge trims old messages
  percent: number;       // used / limit, in %
}

export type ColibriEngineMode = 'cuda' | 'vulkan';

/** The local Colibri server's engine and the progress of a switch, as the API reports it. */
export interface ColibriEngineState {
  mode: ColibriEngineMode | 'offline' | 'unknown';
  contextTokens: number;
  switching: boolean;
  targetMode: ColibriEngineMode | null;
  phase: 'idle' | 'stopping' | 'starting' | 'loading' | 'ready' | 'error';
  failedPhase: string | null;
  message: string;
  error: string | null;
  startedAt: number | null;
  logFile: string;
  log: string[];
  profiles: { id: ColibriEngineMode; label: string; contextTokens: number }[];
}

@Injectable({ providedIn: 'root' })
export class AiSessionManagerService implements OnDestroy {
  private ws: WebSocket | null = null;
  private reconnectTimer: any = null;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30000;
  private destroyed = false;

  private connectionStatusSubject = new BehaviorSubject<ConnectionStatus>('disconnected');
  private agentBackendSubject = new BehaviorSubject<AgentBackend>(this.loadSavedBackend());
  private agyModelsSubject = new BehaviorSubject<AgyModelOption[]>([]);
  private agyModelSubject = new BehaviorSubject<string>(this.loadSavedAgyModel());
  private messagesSubject = new BehaviorSubject<ChatMessage[]>([]);
  private isAgentTypingSubject = new BehaviorSubject<boolean>(false);
  private currentStatusSubject = new BehaviorSubject<string | null>(null);
  private rawEventsSubject = new Subject<AgentEvent>();
  private contextUsageSubject = new BehaviorSubject<ContextUsage | null>(null);
  private colibriEngineSubject = new BehaviorSubject<ColibriEngineState | null>(null);
  // Experimental format (Colibri): list results sent to the model as tables instead of JSON
  private experimentalFormatSubject = new BehaviorSubject<boolean>(this.loadSavedExperimentalFormat());

  private commandResultSubject = new Subject<{ commandId: string; status: 'approved' | 'declined' | 'error'; summary: string; result?: any; error?: string }>();
  public commandResult$ = this.commandResultSubject.asObservable();

  // Currently streaming agent message (accumulates tokens)
  private currentStreamingMessage: ChatMessage | null = null;
  private conversationId: string | null = null;

  connectionStatus$: Observable<ConnectionStatus> = this.connectionStatusSubject.asObservable();
  agentBackend$: Observable<AgentBackend> = this.agentBackendSubject.asObservable();
  agyModels$: Observable<AgyModelOption[]> = this.agyModelsSubject.asObservable();
  agyModel$: Observable<string> = this.agyModelSubject.asObservable();
  messages$: Observable<ChatMessage[]> = this.messagesSubject.asObservable();
  isAgentTyping$: Observable<boolean> = this.isAgentTypingSubject.asObservable();
  currentStatus$: Observable<string | null> = this.currentStatusSubject.asObservable();
  rawEvents$: Observable<AgentEvent> = this.rawEventsSubject.asObservable();
  contextUsage$: Observable<ContextUsage | null> = this.contextUsageSubject.asObservable();
  colibriEngine$: Observable<ColibriEngineState | null> = this.colibriEngineSubject.asObservable();
  experimentalFormat$: Observable<boolean> = this.experimentalFormatSubject.asObservable();

  constructor(
    private readonly authService: AuthService,
    private readonly adminService: AdminService
  ) {}

  get isConnected(): boolean {
    return this.connectionStatusSubject.value === 'connected';
  }

  get currentConversationId(): string | null {
    return this.conversationId;
  }

  connect(): void {
    if (!this.adminService.hasAdminAccess) {
      console.warn('[AI Session] Connection aborted: User lacks admin role.');
      this.disconnect();
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.connectionStatusSubject.next('connecting');

    let wsUrl = this.getWebSocketUrl();
    const token = this.authService.getToken();
    if (token) {
      const sep = wsUrl.includes('?') ? '&' : '?';
      wsUrl += `${sep}token=${encodeURIComponent(token)}`;
    }
    const backendSep = wsUrl.includes('?') ? '&' : '?';
    wsUrl += `${backendSep}backend=${encodeURIComponent(this.agentBackendSubject.value)}`;
    if (this.agyModelSubject.value) {
      wsUrl += `&model=${encodeURIComponent(this.agyModelSubject.value)}`;
    }
    if (this.experimentalFormatSubject.value) {
      wsUrl += '&format=table';
    }

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (err) {
      console.error('[AI Session] WebSocket creation failed:', err);
      this.connectionStatusSubject.next('disconnected');
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log('[AI Session] WebSocket connected');
      this.connectionStatusSubject.next('connected');
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      try {
        const data: AgentEvent = JSON.parse(event.data);
        this.handleEvent(data);
        this.rawEventsSubject.next(data);
      } catch (err) {
        console.error('[AI Session] Failed to parse message:', err);
      }
    };

    this.ws.onclose = (event) => {
      console.log('[AI Session] WebSocket closed', event.code, event.reason);
      this.ws = null;
      if (!this.destroyed && this.adminService.hasAdminAccess && event.code !== 4003 && event.code !== 4001) {
        this.connectionStatusSubject.next('reconnecting');
        this.scheduleReconnect();
      } else {
        this.connectionStatusSubject.next('disconnected');
      }
    };

    this.ws.onerror = (err) => {
      console.error('[AI Session] WebSocket error:', err);
    };
  }

  disconnect(): void {
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connectionStatusSubject.next('disconnected');
  }

  sendMessage(text: string, campaignId?: number): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[AI Session] Cannot send — not connected');
      return;
    }

    // Add user message to the list
    const userMsg: ChatMessage = {
      id: this.generateId(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    this.addMessage(userMsg);

    // Send to server
    this.ws.send(JSON.stringify({
      type: 'chat',
      message: text,
      campaignId: campaignId || undefined,
    }));

    // Prepare for streaming response
    this.isAgentTypingSubject.next(true);
    this.currentStreamingMessage = {
      id: this.generateId(),
      role: 'agent',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
      toolCalls: [],
    };
    this.addMessage(this.currentStreamingMessage);
  }

  cancelResponse(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'cancel' }));
  }

  /**
   * Notify the backend bridge that the active campaign has changed.
   * This does NOT trigger a new AI response — it only updates the
   * server-side activeCampaignId so subsequent commands use the correct campaign.
   */
  setActiveCampaign(campaignId: number): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'set_campaign', campaignId }));
    console.log(`[AI Session] Campaign switched to ID: ${campaignId}`);
  }

  setAgentBackend(backend: AgentBackend): void {
    if (this.agentBackendSubject.value === backend) return;
    this.agentBackendSubject.next(backend);
    try {
      localStorage.setItem('nebryss_ai_backend', backend);
    } catch (_) {}

    this.conversationId = null;
    this.contextUsageSubject.next(null);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'set_backend', backend }));
    }
    console.log(`[AI Session] Backend switched to: ${backend}`);
  }

  private loadSavedBackend(): AgentBackend {
    try {
      const saved = localStorage.getItem('nebryss_ai_backend');
      if (saved === 'agy' || saved === 'colibri') return saved;
    } catch (_) {}
    return 'colibri';
  }

  setAgyModel(modelId: string): void {
    const clean = (modelId || '').trim();
    this.agyModelSubject.next(clean);
    try {
      localStorage.setItem('nebryss_agy_model', clean);
    } catch (_) {}
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'set_model', model: clean }));
    }
    console.log(`[AI Session] AGY model set to: ${clean || 'default'}`);
  }

  requestAgyModels(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'get_agy_models' }));
  }

  /** Asks the API which Colibri engine (CUDA / Vulkan) is running. */
  requestColibriEngine(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'get_colibri_engine' }));
  }

  /** Stops the running Colibri server and starts it on the other engine; progress arrives as colibri_engine events. */
  switchColibriEngine(mode: ColibriEngineMode): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.contextUsageSubject.next(null);
    this.ws.send(JSON.stringify({ type: 'switch_colibri_engine', mode }));
    return true;
  }

  /** Colibri only: list results as tables (fewer tokens) instead of JSON; applies from the next tool call. */
  setExperimentalFormat(enabled: boolean): void {
    this.experimentalFormatSubject.next(enabled);
    try {
      localStorage.setItem('nebryss_experimental_format', enabled ? '1' : '0');
    } catch (_) {}
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'set_experimental_format', enabled }));
    }
  }

  private loadSavedExperimentalFormat(): boolean {
    try {
      return localStorage.getItem('nebryss_experimental_format') === '1';
    } catch (_) {
      return false;
    }
  }

  private loadSavedAgyModel(): string {
    try {
      return localStorage.getItem('nebryss_agy_model') || '';
    } catch (_) {
      return '';
    }
  }

  clearHistory(): void {
    this.messagesSubject.next([]);
    this.contextUsageSubject.next(null);
    this.conversationId = null;
    this.currentStreamingMessage = null;
    this.isAgentTypingSubject.next(false);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.disconnect();
  }

  // ─── Event Handling ───────────────────────────────────────────────

  private handleEvent(event: AgentEvent): void {
    switch (event.type) {
      case 'connected':
      case 'backend_changed':
        if (event['backend'] === 'agy' || event['backend'] === 'colibri') {
          this.agentBackendSubject.next(event['backend']);
          if (event['backend'] === 'agy' && this.agyModelsSubject.value.length === 0) {
            this.requestAgyModels();
          }
          if (event['backend'] === 'colibri') {
            this.requestColibriEngine();
          }
        }
        if (typeof event['model'] === 'string') {
          this.agyModelSubject.next(event['model']);
        }
        break;

      case 'agy_models':
        if (Array.isArray(event['models'])) {
          this.agyModelsSubject.next(event['models']);
        }
        break;

      case 'model_changed':
        if (typeof event['model'] === 'string') {
          this.agyModelSubject.next(event['model']);
        }
        break;

      case 'experimental_format_changed':
        if (typeof event['enabled'] === 'boolean') {
          this.experimentalFormatSubject.next(event['enabled']);
        }
        break;

      case 'colibri_engine':
        if (event['state'] && typeof event['state'] === 'object') {
          this.colibriEngineSubject.next(event['state'] as ColibriEngineState);
        }
        break;

      case 'init':
        if (event['conversationId']) {
          this.conversationId = event['conversationId'];
        }
        this.currentStatusSubject.next('Initialized agent session');
        break;

      case 'token':
        this.currentStatusSubject.next(null);
        this.appendToken(event['content'] || '');
        break;

      case 'rewind':
        // The bridge dropped an unfinished last line of a reply cut by the length limit (the
        // continuation starts again on that line): take it back off the streaming message.
        if (this.currentStreamingMessage && Number(event['chars']) > 0) {
          this.currentStreamingMessage.content = this.currentStreamingMessage.content.slice(0, -Number(event['chars']));
          this.emitMessages();
        }
        break;

      case 'tool_call':
        this.ensureStreamingMessage();
        this.currentStatusSubject.next(event['summary'] || `Running ${event['name']}`);
        this.addToolCall({
          name: event['name'] || 'unknown',
          args: event['args'],
          status: event['status'] || 'running',
          summary: event['summary'] || '',
        });
        break;

      case 'tool_result':
        this.updateToolCallStatus(event['name'], event['status'] || 'done', event['output']);
        break;

      case 'response_end':
        this.currentStatusSubject.next(null);
        if (event['context'] && Number(event['context'].limit) > 0) {
          const ctx = event['context'];
          this.contextUsageSubject.next({
            used: Number(ctx.used) || 0,
            limit: Number(ctx.limit),
            replyReserve: Number(ctx.replyReserve) || 0,
            historyBudget: Number(ctx.historyBudget) || 0,
            percent: Number(ctx.percent) || 0
          });
        }
        this.finalizeResponse(event['conversationId'], event['status']);
        break;

      case 'pending_command':
        this.addPendingCommand({
          id: event['commandId'] || this.generateId(),
          command: event['command'] || 'unknown',
          rawCommandLine: event['rawCommandLine'] || '',
          summary: event['summary'] || event['command'] || 'Command',
          payload: event['payload'] || {},
          status: 'pending',
          timestamp: new Date(),
          expanded: false
        });
        break;

      case 'command_result':
        this.handleCommandResult(event['commandId'], event['status'], event['result'], event['error'] || event['message']);
        break;

      case 'task_update':
        if (event['summary']) {
          this.currentStatusSubject.next(event['summary']);
        }
        break;

      case 'error':
        this.currentStatusSubject.next(null);
        this.handleErrorEvent(event['message'] || 'Unknown error');
        break;

      case 'agent_event':
        // Unrecognized event — log for debugging
        console.log('[AI Session] Unhandled agent event:', event);
        break;
    }
  }

  approveCommand(cmd: PendingCommand, campaignId?: number): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[AI Session] Cannot approve command — WebSocket disconnected');
      return;
    }
    cmd.status = 'approving';
    this.isAgentTypingSubject.next(true);
    this.currentStatusSubject.next(`Executing ${cmd.summary}...`);
    this.emitMessages();

    this.ws.send(JSON.stringify({
      type: 'approve_command',
      commandId: cmd.id,
      command: cmd.command,
      rawCommandLine: cmd.rawCommandLine,
      payload: {
        ...(cmd.payload || {}),
        campaignId: campaignId || cmd.payload?.['campaignId'],
      },
    }));
  }

  declineCommand(cmd: PendingCommand, campaignId?: number): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[AI Session] Cannot decline command — WebSocket disconnected');
      return;
    }
    cmd.status = 'declining';
    this.isAgentTypingSubject.next(true);
    this.currentStatusSubject.next(`Declining ${cmd.summary}...`);
    this.emitMessages();

    this.ws.send(JSON.stringify({
      type: 'decline_command',
      commandId: cmd.id,
      command: cmd.command,
      summary: cmd.summary,
      payload: {
        ...(cmd.payload || {}),
        campaignId: campaignId || cmd.payload?.['campaignId'],
      },
    }));
  }

  private ensureStreamingMessage(): ChatMessage {
    if (!this.currentStreamingMessage) {
      this.isAgentTypingSubject.next(true);
      this.currentStreamingMessage = {
        id: this.generateId(),
        role: 'agent',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
        toolCalls: [],
        pendingCommands: [],
      };
      this.addMessage(this.currentStreamingMessage);
    }
    return this.currentStreamingMessage;
  }

  private addPendingCommand(cmd: PendingCommand): void {
    let targetMsg = this.currentStreamingMessage || this.getLastAgentMessage();
    if (!targetMsg) {
      targetMsg = {
        id: this.generateId(),
        role: 'agent',
        content: '',
        timestamp: new Date(),
        isStreaming: false,
        toolCalls: [],
        pendingCommands: [],
      };
      this.addMessage(targetMsg);
    }
    if (!targetMsg.pendingCommands) {
      targetMsg.pendingCommands = [];
    }
    if (!targetMsg.pendingCommands.some(c => c.id === cmd.id)) {
      targetMsg.pendingCommands.push(cmd);
      this.emitMessages();
    }
  }

  private handleCommandResult(commandId: string, status: string, result?: any, error?: string): void {
    this.isAgentTypingSubject.next(false);
    this.currentStatusSubject.next(null);
    const messages = this.messagesSubject.value;
    const finalStatus: 'approved' | 'declined' | 'error' = status === 'approved' ? 'approved' : (status === 'declined' ? 'declined' : 'error');
    for (const msg of messages) {
      if (msg.pendingCommands) {
        const cmd = msg.pendingCommands.find(c => c.id === commandId);
        if (cmd) {
          cmd.status = finalStatus;
          cmd.result = result;
          cmd.error = error;
          if (finalStatus === 'approved') {
            cmd.expanded = true;
          }
          this.emitMessages();
          this.commandResultSubject.next({
            commandId,
            status: finalStatus,
            summary: cmd.summary,
            result,
            error
          });
          return;
        }
      }
    }
  }

  private getLastAgentMessage(): ChatMessage | null {
    const messages = this.messagesSubject.value;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'agent') {
        return messages[i];
      }
    }
    return null;
  }

  private appendToken(content: string): void {
    const msg = this.ensureStreamingMessage();
    msg.content += content;
    this.emitMessages();
  }

  private addToolCall(toolCall: ToolCallInfo): void {
    const msg = this.ensureStreamingMessage();
    if (!msg.toolCalls) {
      msg.toolCalls = [];
    }
    msg.toolCalls.push(toolCall);
    this.emitMessages();
  }

  private updateToolCallStatus(name: string, status: string, output?: string): void {
    if (!this.currentStreamingMessage?.toolCalls) return;
    const tc = this.currentStreamingMessage.toolCalls.find(t => t.name === name && t.status === 'running');
    if (tc) {
      tc.status = status;
      if (output) tc.output = output;
      this.emitMessages();
    }
  }

  private finalizeResponse(conversationId: string | null, status: string): void {
    if (conversationId) {
      this.conversationId = conversationId;
    }

    if (this.currentStreamingMessage) {
      this.currentStreamingMessage.isStreaming = false;

      // If the response was empty but had an error status, add error info
      if (!this.currentStreamingMessage.content && status === 'ERROR') {
        this.currentStreamingMessage.content = '*The agent encountered an error processing this request.*';
      }
    }

    this.currentStreamingMessage = null;
    this.isAgentTypingSubject.next(false);
    this.emitMessages();
  }

  private handleErrorEvent(message: string): void {
    if (this.currentStreamingMessage) {
      // Append error to the streaming message
      this.currentStreamingMessage.content += `\n\n⚠️ **Error:** ${message}`;
      this.currentStreamingMessage.isStreaming = false;
      this.currentStreamingMessage = null;
      this.isAgentTypingSubject.next(false);
      this.emitMessages();
    } else {
      this.addSystemMessage(`⚠️ Error: ${message}`);
    }
  }

  // ─── Message Management ───────────────────────────────────────────

  private addMessage(msg: ChatMessage): void {
    const current = this.messagesSubject.value;
    this.messagesSubject.next([...current, msg]);
  }

  private addSystemMessage(text: string): void {
    this.addMessage({
      id: this.generateId(),
      role: 'system',
      content: text,
      timestamp: new Date(),
    });
  }

  private emitMessages(): void {
    // Trigger change detection by emitting a new array reference
    this.messagesSubject.next([...this.messagesSubject.value]);
  }

  // ─── Reconnection ────────────────────────────────────────────────

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
    this.reconnectAttempts++;
    console.log(`[AI Session] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ─── Utilities ───────────────────────────────────────────────────

  private getWebSocketUrl(): string {
    const win = window as any;

    // 1. Injected at runtime by server (e.g. "ws://localhost:8080/ws" or "wss://duckdns.org/ws")
    if (win.WS_URL) {
      return win.WS_URL.replace(/\/ws\/?$/, '') + '/ws/agent';
    }

    // 2. Derive from current host
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws/agent`;
  }

  private generateId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
}
