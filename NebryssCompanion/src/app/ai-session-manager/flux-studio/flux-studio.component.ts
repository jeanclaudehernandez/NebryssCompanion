import { Component, DestroyRef, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import {
  AiSessionManagerService,
  FluxCatalog,
  FluxImage,
  FluxJob,
  FluxLora,
  FluxLoraUse,
  FluxState
} from '../ai-session-manager.service';
import { ToastService } from '../../toast.service';

const SETTINGS_KEY = 'nebryss_flux_studio';

/**
 * Stacked LoRAs add up, so the studio lowers them by itself (values from the test renders):
 * - a style (hand-drawn) keeps its own strength (1.2);
 * - a detail LoRA (Bolters, helmets): alone 1.0; with a subject 0.8, or 0.7 with a style too;
 *   with only a style 0.8;
 * - a subject LoRA: alone its own strength; with a style or a detail 0.6; with both 0.5;
 *   two subjects together 0.7 each.
 */
const STACK = { subjectWithOne: 0.6, subjectWithBoth: 0.5, twoSubjects: 0.7, detailWithSubject: 0.8, detailWithSubjectAndStyle: 0.7, detailWithStyle: 0.8 };

// manual: the strength was moved by hand, so the automatic stacking leaves it alone.
interface SelectedLora { file: string; strength: number; manual?: boolean; }

interface SavedSettings {
  prompt?: string;
  loras?: SelectedLora[];
  // older versions of the studio
  lora?: string;
  loraStrength?: number;
  lora2?: string;
  lora2Strength?: number;
  width?: number;
  height?: number;
  steps?: number;
  guidance?: number;
}

/**
 * FLUX image studio, shown instead of the chat while the AI engine is FLUX (ComfyUI has the GPU).
 * It always uses the one studio workflow (its size, steps, guidance and sampler); the GM picks
 * any number of LoRAs (up to the catalog's maxLoras), writes the prompt and generates, then saves
 * the picture to the app's assets folder or discards it. Pictures neither saved nor discarded
 * stay in the temporary folder and are listed below the output.
 */
@Component({
  selector: 'app-flux-studio',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './flux-studio.component.html',
  styleUrls: ['./flux-studio.component.css']
})
export class FluxStudioComponent implements OnInit {
  private readonly ai = inject(AiSessionManagerService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  catalog: FluxCatalog | null = null;
  state: FluxState | null = null;

  // Settings
  prompt = '';
  loras: SelectedLora[] = [];
  width = 832;
  height = 1216;
  steps = 20;
  guidance = 3.5;
  checkpoint = '';
  sampler = 'euler';
  scheduler = 'simple';
  randomSeed = true;
  seed: number | null = null;
  triggerNote = '';

  // Output
  currentId: string | null = null;
  saveName = '';
  saving = false;
  savedNotice: { file: string; url: string } | null = null;
  private savedPreview: string | null = null; // object URL of the picture just saved
  private pendingGenerate = false;
  private lastDoneJob: string | null = null;
  private readonly urls = new Map<string, string>();
  private readonly loading = new Set<string>();
  elapsed = '';
  private elapsedTimer: any = null;

  // Fix an area: paint over part of the current picture, then repaint it
  @ViewChild('fixCanvas') fixCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('fixImg') fixImg?: ElementRef<HTMLImageElement>;
  fixing = false;
  fixPrompt = '';
  fixDenoise = 0.85;
  brushPct = 6;           // brush diameter, % of the picture's width
  erasing = false;
  hasMask = false;
  private painting = false;
  private lastPoint: { x: number; y: number } | null = null;

  ngOnInit(): void {
    this.ai.fluxCatalog$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(c => this.onCatalog(c));
    this.ai.fluxState$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(s => this.onState(s));
    this.ai.fluxEvents$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(e => {
      if (e.type === 'saved') {
        this.saving = false;
        this.savedNotice = { file: e.file, url: e.url };
        if (this.savedPreview) URL.revokeObjectURL(this.savedPreview);
        this.savedPreview = this.urls.get(e.id) || null;
        this.urls.delete(e.id); // keep showing it; revoked when another picture is selected
        this.currentId = null;
        this.saveName = '';
        this.toast.show(`Saved to the assets folder as ${e.file}`, 'success', 4000);
        if (this.state) this.onState(this.state);
      } else if (e.type === 'discarded') {
        this.toast.show('Image discarded.', 'info', 2500);
      } else {
        this.saving = false;
        this.pendingGenerate = false;
        this.toast.show(e.message, 'error', 6000);
      }
    });
    this.ai.requestFluxCatalog();
    this.destroyRef.onDestroy(() => {
      clearInterval(this.elapsedTimer);
      this.urls.forEach(u => URL.revokeObjectURL(u));
      if (this.savedPreview) URL.revokeObjectURL(this.savedPreview);
    });
  }

  // ─── Catalog: the studio workflow and the LoRAs ─────────────────

  private onCatalog(catalog: FluxCatalog | null): void {
    const first = !this.catalog;
    this.catalog = catalog;
    if (!catalog || !first) return;
    this.applyWorkflowDefaults();
    // Then what was being edited last time, where it still exists.
    const saved = this.loadSettings();
    if (saved.prompt) this.prompt = saved.prompt;
    const older = [
      saved.lora ? { file: saved.lora, strength: saved.loraStrength ?? 1 } : null,
      saved.lora2 ? { file: saved.lora2, strength: saved.lora2Strength ?? 1 } : null
    ].filter((l): l is SelectedLora => !!l);
    this.loras = (saved.loras || older).filter(l => this.loraInfo(l.file)).slice(0, this.maxLoras);
    if (saved.width && saved.height) { this.width = saved.width; this.height = saved.height; }
    if (saved.steps) this.steps = saved.steps;
    if (saved.guidance) this.guidance = saved.guidance;
  }

  /** Size, steps, guidance and sampler from the studio workflow (FLUX (Nebryss studio) in ComfyUI). */
  applyWorkflowDefaults(persist = false): void {
    const wf = this.catalog?.workflow;
    if (!wf) return;
    this.checkpoint = wf.checkpoint;
    this.width = wf.width;
    this.height = wf.height;
    this.steps = wf.steps;
    this.guidance = wf.guidance;
    this.sampler = wf.sampler;
    this.scheduler = wf.scheduler;
    if (persist) this.persist();
  }

  get maxLoras(): number {
    return this.catalog?.maxLoras || 4;
  }

  /** The add-a-LoRA list: 'best' = each LoRA's recommended file, 'other' = checkpoints and older versions. */
  lorasIn(group: FluxLora['group']): FluxLora[] {
    return (this.catalog?.loras || []).filter(l => l.group === group);
  }

  loraInfo(file: string): FluxLora | undefined {
    return this.catalog?.loras.find(l => l.file === file);
  }

  isSelected(file: string): boolean {
    return this.loras.some(l => l.file === file);
  }

  /** The strength the stacking rules (STACK) give a LoRA in the current combination. */
  autoStrength(info: FluxLora): number {
    const infos = this.loras.map(l => this.loraInfo(l.file)).filter((i): i is FluxLora => !!i);
    const hasStyle = infos.some(i => i.style);
    const hasDetail = infos.some(i => i.detail);
    const subjects = infos.filter(i => !i.style && !i.detail).length;
    if (info.style) return info.strength;
    // Fixing an area is about the detail (a helmet, a gun): it gets full strength, the subject only
    // keeps the armour colours consistent (tested on a helmet fix: helmets 1.0 + Space Marines 0.5).
    if (this.fixing) {
      if (info.detail) return info.strength;
      if (hasDetail) return Math.min(info.strength, STACK.subjectWithBoth);
    }
    if (info.detail) {
      if (subjects === 0) return hasStyle ? Math.min(info.strength, STACK.detailWithStyle) : info.strength;
      return Math.min(info.strength, hasStyle ? STACK.detailWithSubjectAndStyle : STACK.detailWithSubject);
    }
    if (hasStyle && hasDetail) return Math.min(info.strength, STACK.subjectWithBoth);
    if (hasStyle || hasDetail) return Math.min(info.strength, STACK.subjectWithOne);
    if (subjects > 1) return Math.min(info.strength, STACK.twoSubjects);
    return info.strength;
  }

  /** Re-applies the stacking rules to every LoRA whose strength was not moved by hand. */
  private rebalance(): void {
    for (const l of this.loras) {
      const info = this.loraInfo(l.file);
      if (info && !l.manual) l.strength = this.autoStrength(info);
    }
  }

  /** A strength moved by hand: the stacking rules leave that LoRA alone from now on. */
  onStrengthChange(l: SelectedLora): void {
    l.manual = true;
    this.persist();
  }

  /** Back to the automatic strength for this combination. */
  resetStrength(l: SelectedLora): void {
    const info = this.loraInfo(l.file);
    if (!info) return;
    l.manual = false;
    l.strength = this.autoStrength(info);
    this.persist();
  }

  /** Adds a LoRA (strengths of the whole stack follow the stacking rules) and puts its trigger words at the start of the prompt if missing (nothing else in the prompt changes). */
  addLora(file: string): void {
    const info = this.loraInfo(file);
    if (!info || this.busy || this.isSelected(file) || this.loras.length >= this.maxLoras) return;
    this.loras = [...this.loras, { file, strength: info.strength }];
    this.rebalance();
    this.triggerNote = this.prependTrigger(info) ? `Added "${info.trigger}" at the start of the ${this.fixing ? 'fix ' : ''}prompt.` : '';
    this.persist();
  }

  /** The prompt the next request uses: the fix prompt while fixing an area, the main one otherwise. */
  get activePrompt(): string {
    return this.fixing ? this.fixPrompt : this.prompt;
  }

  private setActivePrompt(text: string): void {
    if (this.fixing) this.fixPrompt = text;
    else this.prompt = text;
  }

  /** Removes a LoRA (its trigger words stay in the prompt: delete them by hand if you want). */
  removeLora(index: number): void {
    if (this.busy) return;
    const removed = this.loraInfo(this.loras[index]?.file);
    this.loras = this.loras.filter((_, i) => i !== index);
    this.rebalance();
    this.triggerNote = removed?.trigger && this.hasTrigger(this.activePrompt, removed)
      ? `Removed ${removed.family}; its trigger words are still in the ${this.fixing ? 'fix ' : ''}prompt.`
      : '';
    this.persist();
  }

  /** Puts a LoRA's trigger words at the start of the prompt in use (main or fix) if missing. True if it added them. */
  private prependTrigger(lora: FluxLora | undefined): boolean {
    if (!lora?.trigger || this.hasTrigger(this.activePrompt, lora)) return false;
    const text = this.activePrompt.trim();
    this.setActivePrompt(text ? `${lora.trigger}, ${text}` : `${lora.trigger}, `);
    return true;
  }

  /** The LoRA's trigger token (its first word, e.g. 0rk40k) is in the prompt. */
  hasTrigger(text: string, lora: FluxLora | undefined): boolean {
    if (!lora?.trigger) return true;
    const token = lora.trigger.split(',')[0].trim().toLowerCase();
    return text.toLowerCase().includes(token);
  }

  addTrigger(file: string): void {
    const info = this.loraInfo(file);
    if (!info?.trigger) return;
    this.setActivePrompt(`${info.trigger}, ${this.activePrompt.trim()}`);
    this.triggerNote = '';
    this.persist();
  }

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.persist();
  }

  isSize(width: number, height: number): boolean {
    return this.width === width && this.height === height;
  }

  persist(): void {
    const s: SavedSettings = {
      prompt: this.prompt, loras: this.loras,
      width: this.width, height: this.height, steps: this.steps, guidance: this.guidance
    };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (_) { }
  }

  private loadSettings(): SavedSettings {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch (_) { return {}; }
  }

  // ─── Generating ─────────────────────────────────────────────────

  get job(): FluxJob | null {
    return this.state?.job || null;
  }

  get busy(): boolean {
    const phase = this.job?.phase;
    return this.pendingGenerate || (!!phase && !['done', 'error', 'cancelled'].includes(phase));
  }

  get progressPercent(): number {
    const j = this.job;
    if (!j) return 0;
    if (j.phase === 'sampling' && j.totalSteps) return Math.round((j.step / j.totalSteps) * 90) + 5;
    if (j.phase === 'decoding') return 97;
    if (j.phase === 'loading') return 3;
    return 1;
  }

  generate(): void {
    if (this.busy || !this.prompt.trim()) return;
    const ok = this.ai.generateFluxImage({
      prompt: this.prompt.trim(),
      checkpoint: this.checkpoint || undefined,
      loras: this.loras.map(l => ({ file: l.file, strength: l.strength, name: this.loraInfo(l.file)?.family || l.file })),
      width: this.width,
      height: this.height,
      steps: this.steps,
      guidance: this.guidance,
      sampler: this.sampler,
      scheduler: this.scheduler,
      seed: this.randomSeed ? null : (this.seed ?? 0)
    });
    if (!ok) {
      this.toast.show('Not connected to the AI bridge; reconnect and try again.', 'error', 4000);
      return;
    }
    this.pendingGenerate = true;
    this.savedNotice = null;
    this.persist();
  }

  cancel(): void {
    this.ai.cancelFluxImage();
  }

  onPromptKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.generate();
    }
  }

  private onState(state: FluxState | null): void {
    this.state = state;
    if (!state) return;
    const job = state.job;
    if (job && this.pendingGenerate && job.phase !== 'done' && job.phase !== 'error' && job.phase !== 'cancelled') {
      this.pendingGenerate = false; // the server took it
    }
    if (job && ['done', 'error', 'cancelled'].includes(job.phase) && job.id !== this.lastDoneJob) {
      this.pendingGenerate = false;
      this.lastDoneJob = job.id;
      if (job.phase === 'done' && job.imageId) {
        if (this.fixing) {
          this.fixing = false; // the fixed picture is the new current one
          this.rebalance();
        }
        this.select(job.imageId);
      }
      if (job.phase === 'error') this.toast.show(job.error || 'The image failed.', 'error', 6000);
    }
    this.updateElapsedTimer();
    // The picture being saved leaves the list before the "saved" answer arrives: keep showing it.
    if (this.saving) return;
    // Show the newest unsaved image when nothing is selected (e.g. after a reload).
    if (this.currentId && !state.images.some(i => i.id === this.currentId)) this.currentId = null;
    if (!this.currentId && !this.savedNotice && state.images.length) this.currentId = state.images[0].id;
    // Pictures no longer in the temporary folder: free their object URLs.
    for (const [id, url] of this.urls) {
      if (!state.images.some(i => i.id === id)) { URL.revokeObjectURL(url); this.urls.delete(id); }
    }
    for (const img of state.images.slice(0, 24)) this.ensureLoaded(img);
  }

  private updateElapsedTimer(): void {
    if (this.busy && !this.elapsedTimer) {
      this.tickElapsed();
      this.elapsedTimer = setInterval(() => this.tickElapsed(), 1000);
    } else if (!this.busy && this.elapsedTimer) {
      clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
  }

  private tickElapsed(): void {
    const started = this.job?.startedAt;
    this.elapsed = started ? `${Math.max(0, Math.round((Date.now() - started) / 1000))}s` : '';
  }

  // ─── Output: the selected picture, save / discard ───────────────

  get images(): FluxImage[] {
    return this.state?.images || [];
  }

  get current(): FluxImage | undefined {
    return this.images.find(i => i.id === this.currentId);
  }

  imageUrl(id: string | null | undefined): string | null {
    return id ? this.urls.get(id) || null : null;
  }

  get savedPreviewUrl(): string | null {
    return this.savedPreview;
  }

  select(id: string): void {
    this.currentId = id;
    this.savedNotice = null;
    this.saveName = '';
    if (this.savedPreview) { URL.revokeObjectURL(this.savedPreview); this.savedPreview = null; }
    const img = this.images.find(i => i.id === id);
    if (img) this.ensureLoaded(img);
  }

  private ensureLoaded(img: FluxImage): void {
    if (this.urls.has(img.id) || this.loading.has(img.id)) return;
    this.loading.add(img.id);
    this.ai.loadFluxImage(img.file).subscribe({
      next: (blob) => {
        this.loading.delete(img.id);
        if (this.images.some(i => i.id === img.id)) this.urls.set(img.id, URL.createObjectURL(blob));
      },
      error: () => this.loading.delete(img.id)
    });
  }

  /** What the file will be called if no name is typed (the server adds the date and time). */
  get suggestedName(): string {
    const c = this.current;
    return (this.imageLoras(c)[0]?.name || 'flux').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-<date>';
  }

  save(): void {
    const c = this.current;
    if (!c || this.saving) return;
    if (this.ai.saveFluxImage(c.id, this.saveName.trim())) this.saving = true;
  }

  discard(): void {
    const c = this.current;
    if (!c) return;
    const index = this.images.findIndex(i => i.id === c.id);
    const next = this.images[index + 1] || this.images[index - 1];
    if (this.ai.discardFluxImage(c.id)) {
      this.currentId = next ? next.id : null;
      this.saveName = '';
    }
  }

  reuseSeed(): void {
    const c = this.current;
    if (!c) return;
    this.randomSeed = false;
    this.seed = c.seed;
  }

  /** Puts the selected picture's settings back in the form (to make a variation). */
  reuseSettings(): void {
    const c = this.current;
    if (!c || this.busy) return;
    this.prompt = c.prompt;
    this.loras = this.imageLoras(c).filter(l => this.loraInfo(l.file)).map(l => ({ file: l.file, strength: l.strength })).slice(0, this.maxLoras);
    this.width = c.width;
    this.height = c.height;
    this.steps = c.steps;
    this.guidance = c.guidance;
    this.triggerNote = '';
    this.persist();
  }

  // ─── Fix an area ────────────────────────────────────────────────

  /** Opens the painting tool on the current picture; the prompt starts as the studio's prompt. */
  startFix(): void {
    const c = this.current;
    if (!c || this.busy) return;
    this.fixing = true;
    this.erasing = false;
    this.hasMask = false;
    this.fixPrompt = this.prompt.trim() || c.prompt;
    this.rebalance(); // detail LoRAs to full strength for the fix
    setTimeout(() => this.setupFixCanvas());
  }

  cancelFix(): void {
    this.fixing = false;
    this.painting = false;
    this.rebalance(); // back to the whole-picture strengths
  }

  /** The canvas gets the picture's own pixel size (CSS scales it to the displayed picture). */
  setupFixCanvas(): void {
    const img = this.fixImg?.nativeElement;
    const canvas = this.fixCanvas?.nativeElement;
    if (!img || !canvas || !img.naturalWidth) return;
    if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      this.hasMask = false;
    }
  }

  private canvasPoint(event: PointerEvent): { x: number; y: number } {
    const canvas = this.fixCanvas!.nativeElement;
    const r = canvas.getBoundingClientRect();
    return { x: (event.clientX - r.left) * canvas.width / r.width, y: (event.clientY - r.top) * canvas.height / r.height };
  }

  private strokeTo(a: { x: number; y: number }, b: { x: number; y: number }): void {
    const canvas = this.fixCanvas?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.globalCompositeOperation = this.erasing ? 'destination-out' : 'source-over';
    ctx.strokeStyle = '#ff3b3b';
    ctx.lineWidth = Math.max(4, (this.brushPct / 100) * canvas.width);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x + 0.01, b.y);
    ctx.stroke();
    if (!this.erasing) this.hasMask = true;
  }

  onFixPointerDown(event: PointerEvent): void {
    if (!this.fixCanvas || this.busy) return;
    event.preventDefault();
    this.setupFixCanvas();
    this.fixCanvas.nativeElement.setPointerCapture(event.pointerId);
    this.painting = true;
    const p = this.canvasPoint(event);
    this.strokeTo(p, p);
    this.lastPoint = p;
  }

  onFixPointerMove(event: PointerEvent): void {
    if (!this.painting || !this.lastPoint) return;
    const p = this.canvasPoint(event);
    this.strokeTo(this.lastPoint, p);
    this.lastPoint = p;
  }

  onFixPointerUp(): void {
    this.painting = false;
    this.lastPoint = null;
  }

  clearMask(): void {
    const canvas = this.fixCanvas?.nativeElement;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    this.hasMask = false;
  }

  /** Sends the painted area (as a soft-edged black-and-white mask) and the fix settings. */
  applyFix(): void {
    const c = this.current;
    const canvas = this.fixCanvas?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!c || !canvas || !ctx || this.busy) return;
    const w = canvas.width;
    const h = canvas.height;
    const alpha = ctx.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (alpha[(y * w + x) * 4 + 3] > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) {
      this.toast.show('Paint over the area to fix first.', 'info', 3000);
      return;
    }
    // White where painted, on black, with softened edges so the repaint blends in.
    const white = document.createElement('canvas');
    white.width = w;
    white.height = h;
    const wctx = white.getContext('2d')!;
    wctx.drawImage(canvas, 0, 0);
    wctx.globalCompositeOperation = 'source-in';
    wctx.fillStyle = '#fff';
    wctx.fillRect(0, 0, w, h);
    const mask = document.createElement('canvas');
    mask.width = w;
    mask.height = h;
    const mctx = mask.getContext('2d')!;
    mctx.fillStyle = '#000';
    mctx.fillRect(0, 0, w, h);
    const blur = Math.max(3, Math.round(w * 0.008));
    mctx.filter = `blur(${blur}px)`;
    mctx.drawImage(white, 0, 0);
    const pad = blur * 2;
    const area = {
      x: Math.max(0, minX - pad), y: Math.max(0, minY - pad),
      w: Math.min(w, maxX + pad + 1) - Math.max(0, minX - pad), h: Math.min(h, maxY + pad + 1) - Math.max(0, minY - pad)
    };
    const ok = this.ai.fixFluxArea({
      source: c.file,
      mask: mask.toDataURL('image/png'),
      area,
      prompt: this.fixPrompt.trim(),
      checkpoint: this.checkpoint || undefined,
      loras: this.loras.map(l => ({ file: l.file, strength: l.strength, name: this.loraInfo(l.file)?.family || l.file })),
      denoise: this.fixDenoise,
      steps: this.steps,
      guidance: this.guidance,
      sampler: this.sampler,
      scheduler: this.scheduler,
      seed: this.randomSeed ? null : (this.seed ?? 0)
    });
    if (!ok) {
      this.toast.show('Not connected to the AI bridge; reconnect and try again.', 'error', 4000);
      return;
    }
    this.pendingGenerate = true;
    this.savedNotice = null;
  }

  /** The LoRAs a picture was made with (also for pictures made before the multi-LoRA picker). */
  imageLoras(img: FluxImage | undefined): FluxLoraUse[] {
    if (!img) return [];
    if (Array.isArray(img.loras)) return img.loras;
    return [
      img.lora ? { file: img.lora, strength: img.loraStrength ?? 1, name: img.loraName || img.lora } : null,
      img.lora2 ? { file: img.lora2, strength: img.lora2Strength ?? 1, name: img.lora2Name || img.lora2 } : null
    ].filter((l): l is FluxLoraUse => !!l);
  }

  trackById(_: number, img: FluxImage): string {
    return img.id;
  }

  timeAgo(ms: number): string {
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return new Date(ms).toLocaleDateString();
  }
}
