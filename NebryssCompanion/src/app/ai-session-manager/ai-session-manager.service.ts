import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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
  reasoning?: string;
  reasoningExpanded?: boolean;
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
  engine?: 'colibri' | 'llamacpp'; // the server that answered
  // llama.cpp only (from its timings, for the last request of the reply):
  cachedTokens?: number;     // prompt tokens reused from the server's cache
  newPromptTokens?: number;  // prompt tokens it had to read anew
  promptPerSecond?: number;  // prompt reading speed, tok/s
  replyPerSecond?: number;   // reply speed, tok/s
}

/** A context report from the bridge (response_end / context_estimate) as ContextUsage; null if it has no limit. */
function toContextUsage(ctx: any): ContextUsage | null {
  if (!ctx || !(Number(ctx.limit) > 0)) return null;
  const optional = (v: any) => (v === undefined || v === null || !Number.isFinite(Number(v)) ? undefined : Number(v));
  return {
    used: Number(ctx.used) || 0,
    limit: Number(ctx.limit),
    replyReserve: Number(ctx.replyReserve) || 0,
    historyBudget: Number(ctx.historyBudget) || 0,
    percent: Number(ctx.percent) || 0,
    engine: ctx.engine === 'llamacpp' ? 'llamacpp' : (ctx.engine === 'colibri' ? 'colibri' : undefined),
    cachedTokens: optional(ctx.cachedTokens),
    newPromptTokens: optional(ctx.newPromptTokens),
    promptPerSecond: optional(ctx.promptPerSecond),
    replyPerSecond: optional(ctx.replyPerSecond)
  };
}

/** One message of the model's stored conversation, exactly as the bridge will resend it. */
export interface HistoryMessage {
  id: string;
  seq: number;           // place in the conversation (deleted messages included)
  deleted: boolean;      // removed from the model's context; still listed, greyed out
  index: number | null;  // position in what the model is sent; null once deleted
  role: 'system' | 'user' | 'assistant' | 'tool' | string;
  content: string;
  reasoning: string;
  toolCalls: { id: string; name: string; arguments: string }[];
  toolCallId: string | null;
  ragChars: number;      // length of the RAG block at the start of a user message
  tokens: number;        // estimated
  group: string | null;  // id of the assistant turn whose tool call this belongs to
  locked: boolean;       // the system prompt: rebuilt every turn, cannot be deleted
}

export interface HistorySnapshot {
  supported: boolean;
  reason?: string;
  processing: boolean;
  messages: HistoryMessage[];
  deletedCount?: number;
  estimatedTokens?: number;
  toolDefinitionTokens?: number;
  outcome?: { ok: boolean; deleted?: number; notFound?: number; error?: string } | null;
}

/** A Colibri model setup's id, as api/colibri-engine.js defines them (e.g. 'iq2m-120k'). */
export type ColibriEngineMode = string;

export interface ColibriProfile {
  id: ColibriEngineMode;
  label: string;          // the quantization, e.g. 'IQ3_XXS'
  detail: string;         // one line on what it is good for
  contextTokens: number;
  engine?: 'colibri' | 'llamacpp';
  engineName?: string;    // 'Colibri' | 'llama.cpp'
  kvCache?: string;       // 'f16' (16-bit) | 'q8_0' (8-bit)
}

/** The local model server's setup (Colibri or llama.cpp) and the progress of a switch, as the API reports it. */
export interface ColibriEngineState {
  // A profile id, 'custom' (a server started some other way), 'offline' or
  // 'unknown' (the port is used by another program)
  mode: ColibriEngineMode;
  runningModel: string;   // the running server's model folder
  contextTokens: number;
  engineName?: string;            // the engine running now: 'Colibri' | 'llama.cpp' | ''
  targetEngineName?: string;      // the engine a switch is starting
  runningProfile?: ColibriProfile | null;   // the running setup, also when it is not offered
  switching: boolean;
  targetMode: ColibriEngineMode | null;
  phase: 'idle' | 'stopping' | 'starting' | 'loading' | 'ready' | 'error';
  failedPhase: string | null;
  message: string;
  error: string | null;
  startedAt: number | null;
  logFile: string;
  log: string[];
  profiles: ColibriProfile[];
  defaultProfile?: ColibriProfile | null;   // the setup the Start button starts
  // FLUX image generation (ComfyUI), the other thing the switch can give the GPU to
  flux?: { id: string; label: string; detail: string };
}

/** The engine-switch target that stops Colibri and starts ComfyUI for FLUX images. */
export const FLUX_MODE = 'flux';

/** The target of a stop: Colibri and ComfyUI both stopped, the GPU free (as api/colibri-engine.js). */
export const STOP_MODE = 'offline';

/** The studio's one workflow (FLUX (Nebryss studio).json in ComfyUI): the base settings. */
export interface FluxStudioWorkflow {
  id: string;
  name: string;
  found: boolean;         // false: the file is missing and built-in defaults are used
  checkpoint: string;
  width: number;
  height: number;
  guidance: number;
  steps: number;
  sampler: string;
  scheduler: string;
}

export interface FluxLora {
  file: string;
  label: string;          // e.g. 'Orks · step 1500'
  family: string;         // e.g. 'Orks'
  trigger: string;        // the words the prompt must start with
  strength: number;       // default strength
  step: number | null;    // a training checkpoint's step
  group: 'best' | 'other'; // best = the recommended file of each LoRA
  style: boolean;         // a drawing style, stacked on top of a subject LoRA
  detail: boolean;        // a part (weapon, helmet) stacked on a subject LoRA
  category?: string;      // the studio dropdown it is listed under ('Xenos', 'Details'...)
  always?: boolean;       // added to every image by the API (the Hand-drawn style): never picked
}

/** A LoRA in use: which file, how strong, and its readable name. */
export interface FluxLoraUse { file: string; strength: number; name: string; }

export interface FluxSize { id: string; label: string; width: number; height: number; }

export interface FluxCatalog {
  workflow: FluxStudioWorkflow;
  loras: FluxLora[];
  sizes: FluxSize[];
  defaults: { checkpoint: string; guidance: number; steps: number; sampler: string; scheduler: string };
  maxLoras: number;       // LoRAs the GM picks (the always-on style comes on top)
  categories?: string[];  // the studio's dropdowns, in order
  tempDir: string;
  saveDir: string;
}

/** An image made but not yet saved or discarded (in the temporary folder). */
export interface FluxImage {
  id: string;
  file: string;
  createdAt: number;
  prompt: string;
  checkpoint: string;
  loras?: FluxLoraUse[];
  // Images made before the multi-LoRA picker
  lora?: string | null;
  loraName?: string;
  loraStrength?: number;
  lora2?: string | null;
  lora2Name?: string;
  lora2Strength?: number;
  seed: number;
  width: number;
  height: number;
  steps: number;
  guidance: number;
  seconds: number;
  fixOf?: string;         // set when this picture is an area fix of another one (its file)
  denoise?: number;
}

export interface FluxJob {
  id: string;
  imageId: string | null;
  phase: 'queued' | 'loading' | 'sampling' | 'decoding' | 'done' | 'error' | 'cancelled';
  message: string;
  step: number;
  totalSteps: number;
  startedAt: number;
  finishedAt: number | null;
  error: string | null;
}

export interface FluxState { job: FluxJob | null; images: FluxImage[]; tempDir: string; saveDir: string; }

export interface FluxGenerateParams {
  prompt: string;
  checkpoint?: string;
  loras: FluxLoraUse[];   // in order; up to the catalog's maxLoras
  width: number;
  height: number;
  steps: number;
  guidance: number;
  sampler?: string;
  scheduler?: string;
  seed: number | null;    // null = random
}

/** Repaint the painted area of a picture (temporary or saved) with the studio's LoRAs and a prompt. */
export interface FluxFixParams {
  source: string;         // the picture's file name
  mask: string;           // PNG data URL the size of the picture, white = repaint
  area: { x: number; y: number; w: number; h: number }; // the painted box, in the picture's pixels
  prompt: string;
  checkpoint?: string;
  loras: FluxLoraUse[];
  denoise: number;        // 0.3 (subtle) .. 1 (redraw)
  steps: number;
  guidance: number;
  sampler?: string;
  scheduler?: string;
  seed: number | null;
}

export type FluxEvent =
  | { type: 'saved'; id: string; file: string; path: string; url: string }
  | { type: 'discarded'; id: string }
  | { type: 'error'; action: string; message: string };

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
  private historySubject = new Subject<HistorySnapshot>();
  // FLUX image studio
  private fluxCatalogSubject = new BehaviorSubject<FluxCatalog | null>(null);
  private fluxStateSubject = new BehaviorSubject<FluxState | null>(null);
  private fluxEventsSubject = new Subject<FluxEvent>();
  // Experimental format (Colibri): list results sent to the model as tables instead of JSON
  private experimentalFormatSubject = new BehaviorSubject<boolean>(this.loadSavedExperimentalFormat());
  // Reasoning/thinking toggle for local models (off by default for fast turns)
  private thinkingEnabledSubject = new BehaviorSubject<boolean>(this.loadSavedThinking());

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
  thinkingEnabled$: Observable<boolean> = this.thinkingEnabledSubject.asObservable();
  history$: Observable<HistorySnapshot> = this.historySubject.asObservable();
  fluxCatalog$: Observable<FluxCatalog | null> = this.fluxCatalogSubject.asObservable();
  fluxState$: Observable<FluxState | null> = this.fluxStateSubject.asObservable();
  fluxEvents$: Observable<FluxEvent> = this.fluxEventsSubject.asObservable();

  constructor(
    private readonly authService: AuthService,
    private readonly adminService: AdminService,
    private readonly http: HttpClient
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
    wsUrl += this.experimentalFormatSubject.value ? '&format=table' : '&format=json';

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
      thinking: this.thinkingEnabledSubject.value,
    }));

    // Prepare for streaming response
    this.isAgentTypingSubject.next(true);
    this.currentStreamingMessage = {
      id: this.generateId(),
      role: 'agent',
      content: '',
      reasoning: '',
      reasoningExpanded: false,
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

  setThinkingEnabled(enabled: boolean): void {
    const next = Boolean(enabled);
    if (this.thinkingEnabledSubject.value === next) return;
    this.thinkingEnabledSubject.next(next);
    try {
      localStorage.setItem('nebryss_ai_thinking', next ? 'true' : 'false');
    } catch (_) {}
  }

  private loadSavedThinking(): boolean {
    try {
      return localStorage.getItem('nebryss_ai_thinking') === 'true';
    } catch (_) {
      return false;
    }
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

  /** Asks the API which Colibri model setup is running. */
  requestColibriEngine(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'get_colibri_engine' }));
  }

  /** Stops the running Colibri server and starts it with another model setup; progress arrives as colibri_engine events. */
  switchColibriEngine(mode: ColibriEngineMode): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    // The bridge keeps its conversation across a switch, so the last context reading stays
    // valid (FLUX, or a setup with the same context size). Only a new size makes it stale.
    const usage = this.contextUsageSubject.value;
    const profile = this.colibriEngineSubject.value?.profiles?.find(p => p.id === mode);
    if (usage && mode !== FLUX_MODE && profile && profile.contextTokens !== usage.limit) {
      this.contextUsageSubject.next(null);
    }
    this.ws.send(JSON.stringify({ type: 'switch_colibri_engine', mode }));
    return true;
  }

  /**
   * Stops whatever has the GPU (Colibri and/or ComfyUI) without starting anything; progress
   * arrives as colibri_engine events. The bridge's conversation (and its context reading) stays.
   */
  stopColibriEngine(): boolean {
    return this.sendIfOpen({ type: 'stop_colibri_engine' });
  }

  /**
   * FLUX picked while Antigravity is the bridge: the studio opens over the AGY chat without
   * switching the backend (a switch would end the AGY conversation). Not kept across reloads.
   */
  imageStudioOverAgy = false;

  /** Phase of the image being made, if any (to warn before stopping ComfyUI). */
  get fluxJobPhase(): string | null {
    return this.fluxStateSubject.value?.job?.phase || null;
  }

  // ─── FLUX image studio ──────────────────────────────────────────

  private sendIfOpen(payload: object): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(payload));
    return true;
  }

  /** Asks for the FLUX workflows, LoRAs and sizes (fluxCatalog$) and the studio's state (fluxState$). */
  requestFluxCatalog(): boolean {
    return this.sendIfOpen({ type: 'flux_get_catalog' });
  }

  /** Starts an image; progress and the result arrive on fluxState$, a refusal on fluxEvents$. */
  /** Repaints an area of a picture; progress and the new picture arrive on fluxState$ like a generation. */
  fixFluxArea(params: FluxFixParams): boolean {
    return this.sendIfOpen({ type: 'flux_fix', params });
  }

  generateFluxImage(params: FluxGenerateParams): boolean {
    return this.sendIfOpen({ type: 'flux_generate', params });
  }

  cancelFluxImage(): boolean {
    return this.sendIfOpen({ type: 'flux_cancel' });
  }

  /** Moves an image from the temporary folder to the app's assets folder (name optional). */
  saveFluxImage(id: string, name: string): boolean {
    return this.sendIfOpen({ type: 'flux_save', id, name });
  }

  /** Deletes an image from the temporary folder. */
  discardFluxImage(id: string): boolean {
    return this.sendIfOpen({ type: 'flux_discard', id });
  }

  /** The picture itself (temporary or saved), fetched with the session's credentials. */
  loadFluxImage(file: string): Observable<Blob> {
    const win = window as any;
    const apiUrl = win.API_URL || `${window.location.origin}/api`;
    return this.http.get(`${apiUrl}/flux/images/${encodeURIComponent(file)}`, { responseType: 'blob' });
  }

  /** Colibri only: list results as tables (fewer tokens) instead of JSON; applies from the next tool call. */
  setExperimentalFormat(enabled: boolean): void {
    this.experimentalFormatSubject.next(enabled);
    try {
      localStorage.setItem('nebryss_experimental_format_v2', enabled ? '1' : '0');
    } catch (_) {}
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'set_experimental_format', enabled }));
    }
  }

  /** Asks the bridge for every message it holds for the model; the answer arrives on history$. */
  requestHistory(): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify({ type: 'get_history' }));
    return true;
  }

  /** Removes these stored messages from the model's context; the updated list arrives on history$. */
  deleteHistoryMessages(ids: string[]): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || ids.length === 0) return false;
    this.ws.send(JSON.stringify({ type: 'delete_history', ids }));
    return true;
  }

  /** On by default; off only when it was turned off here. */
  private loadSavedExperimentalFormat(): boolean {
    try {
      return localStorage.getItem('nebryss_experimental_format_v2') !== '0';
    } catch (_) {
      return true;
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
          // With AGY too on connect: the stop button and the image studio need the GPU engine's state.
          if (event['backend'] === 'colibri' || event.type === 'connected') {
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

      case 'flux_catalog':
        if (event['catalog'] && typeof event['catalog'] === 'object') {
          this.fluxCatalogSubject.next(event['catalog'] as FluxCatalog);
        }
        break;

      case 'flux_state':
        if (event['state'] && typeof event['state'] === 'object') {
          this.fluxStateSubject.next(event['state'] as FluxState);
        }
        break;

      case 'flux_saved':
        this.fluxEventsSubject.next({ type: 'saved', id: event['id'], file: event['file'], path: event['path'], url: event['url'] });
        break;

      case 'flux_discarded':
        this.fluxEventsSubject.next({ type: 'discarded', id: event['id'] });
        break;

      case 'flux_error':
        this.fluxEventsSubject.next({ type: 'error', action: String(event['action'] || ''), message: String(event['message'] || 'FLUX error') });
        break;

      case 'history':
        this.historySubject.next({
          supported: event['supported'] !== false,
          reason: event['reason'],
          processing: Boolean(event['processing']),
          messages: Array.isArray(event['messages']) ? event['messages'] : [],
          deletedCount: Number(event['deletedCount']) || 0,
          estimatedTokens: event['estimatedTokens'],
          toolDefinitionTokens: event['toolDefinitionTokens'],
          outcome: event['outcome'] || null
        });
        break;

      case 'context_estimate':
        // After messages were deleted: the bridge's estimate until the next reply reports the real size.
        {
          const usage = toContextUsage(event['context']);
          if (usage) this.contextUsageSubject.next(usage);
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

      case 'reasoning_token':
        this.appendReasoningToken(event['content'] || '');
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
        {
          const usage = toContextUsage(event['context']);
          if (usage) this.contextUsageSubject.next(usage);
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

  private appendReasoningToken(content: string): void {
    if (!content) return;
    const msg = this.ensureStreamingMessage();
    msg.reasoning = (msg.reasoning || '') + content;
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
