import { Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { DataService } from '../data.service';
import { AdminService } from '../admin.service';
import { ToastService } from '../toast.service';
import { MistStateService, emptyMistState, mistEffectKey } from '../mist-state.service';
import { GenericTableComponent } from '../generic-table/generic-table.component';
import { MistDensity, MistEffect, MistState, MistTier, MIST_TIERS } from '../model';

@Component({
  selector: 'app-mist-effects',
  standalone: true,
  imports: [CommonModule, FormsModule, GenericTableComponent],
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="mist-effects-container">
      <section class="mist-status" [class.mist-status-on]="activeEffects.length">
        <div class="mist-status-head">
          <span class="mist-status-label">Current mist</span>
          <span class="mist-density-badge" [attr.data-density]="state.density || 'none'">{{ state.density || 'No mist' }}</span>
          <span class="mist-status-count" *ngIf="activeEffects.length">{{ activeEffects.length }} active effect{{ activeEffects.length === 1 ? '' : 's' }}</span>
        </div>
        <ul class="mist-active-list" *ngIf="activeEffects.length; else noEffects">
          <li *ngFor="let e of activeEffects">
            <strong>{{ e.effectName }}</strong>
            <span class="mist-tier" *ngIf="e.densityLevel">{{ e.densityLevel }}</span>
          </li>
        </ul>
        <ng-template #noEffects><p class="mist-none">No mist effects are active.</p></ng-template>

        <div class="mist-gm" *ngIf="isAdmin">
          <div class="mist-gm-row">
            <label for="mist-density">Density</label>
            <select id="mist-density" [ngModel]="state.density" (ngModelChange)="setDensity($event)" [disabled]="saving">
              <option value="">None</option>
              <option *ngFor="let t of tiers" [value]="t">{{ t }}</option>
            </select>
            <button type="button" (click)="reroll()" [disabled]="saving || !state.density" title="Pick new random effects for this density">Reroll</button>
            <button type="button" (click)="clear()" [disabled]="saving || (!state.density && !state.activeEffects.length)">Clear</button>
            <button type="button" class="mist-link" (click)="showCounts = !showCounts">{{ showCounts ? 'Hide' : 'Effects per density' }}</button>
          </div>
          <p class="mist-hint">Choosing a density picks its effects at random. Click a row to turn an effect on or off.</p>
          <table class="mist-counts" *ngIf="showCounts">
            <thead>
              <tr><th>Density</th><th *ngFor="let t of tiers">{{ t }} effects</th></tr>
            </thead>
            <tbody>
              <tr *ngFor="let level of tiers; let li = index">
                <th>{{ level }}</th>
                <td *ngFor="let tier of tiers; let ti = index">
                  <input *ngIf="ti <= li" type="number" min="0" max="20"
                    [ngModel]="state.counts[level][tier] ?? 0"
                    (change)="setCount(level, tier, $any($event.target).value)"
                    [attr.aria-label]="level + ' density: ' + tier + ' effects'"
                    [title]="'Of ' + tierSize(tier) + ' ' + tier + ' effects'" />
                  <span *ngIf="ti > li" class="mist-dash">–</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <app-generic-table
        [storageKey]="'mist-effects-table'"
        [title]="'Mist Effects'"
        [data]="mistEffects"
        [headers]="['Effect Name', 'Density Level', 'Description']"
        [headerKeys]="['effectName', 'densityLevel', 'description']"
        [nameColumnWidth]="'72px'"
        [inventoryManagement]="false"
        [renderHtml]="['description']"
        [isRowActive]="isActive"
        [rowsClickable]="isAdmin && !saving"
        [rowClickTitle]="'Click to turn this effect on or off'"
        (rowClick)="toggle($event)">
      </app-generic-table>
    </div>
  `,
  styles: [`
    .mist-effects-container { max-width: 1200px; margin: 0 auto; }
    .mist-status { border: 1px solid #d5dbe6; border-radius: 8px; padding: 12px 14px; margin-bottom: 16px; background: #f7f9fc; }
    .mist-status-on { border-color: #5b7fc4; }
    .mist-status-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .mist-status-label { font-weight: 600; }
    .mist-density-badge { padding: 2px 10px; border-radius: 999px; font-size: 0.85em; font-weight: 600; background: #e6e9ef; color: #555; }
    .mist-density-badge[data-density="Light"] { background: #e3f0fb; color: #2d5d8a; }
    .mist-density-badge[data-density="Medium"] { background: #d6e2f5; color: #274a80; }
    .mist-density-badge[data-density="Dense"] { background: #4b5f86; color: #fff; }
    .mist-status-count { color: #666; font-size: 0.9em; }
    .mist-active-list { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
    .mist-active-list li { padding: 3px 10px; border-radius: 6px; background: #e3ecfb; display: flex; gap: 6px; align-items: center; }
    .mist-tier { font-size: 0.75em; color: #4b5f86; text-transform: uppercase; letter-spacing: 0.03em; }
    .mist-none { margin: 8px 0 0; color: #777; }
    .mist-gm { margin-top: 12px; padding-top: 10px; border-top: 1px dashed #ccd3df; }
    .mist-gm-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .mist-gm-row select, .mist-gm-row button { padding: 4px 10px; }
    .mist-link { background: none; border: none; color: #3d63b0; text-decoration: underline; cursor: pointer; }
    .mist-hint { margin: 6px 0 0; font-size: 0.85em; color: #777; }
    .mist-counts { margin-top: 10px; border-collapse: collapse; }
    .mist-counts th, .mist-counts td { padding: 4px 8px; text-align: center; }
    .mist-counts input { width: 56px; padding: 2px 4px; }
    .mist-dash { color: #aaa; }
    body.dark-theme .mist-status { background: #1b1f27; border-color: #333a48; }
    body.dark-theme .mist-status-on { border-color: #7d9fe0; }
    body.dark-theme .mist-density-badge { background: #2a2f3a; color: #bbb; }
    body.dark-theme .mist-density-badge[data-density="Light"] { background: #1d3147; color: #a9cdf0; }
    body.dark-theme .mist-density-badge[data-density="Medium"] { background: #233a5e; color: #c2d6f5; }
    body.dark-theme .mist-density-badge[data-density="Dense"] { background: #5b74a8; color: #fff; }
    body.dark-theme .mist-active-list li { background: #17243d; color: #ddd; }
    body.dark-theme .mist-tier { color: #9fb6e0; }
    body.dark-theme .mist-status-count, body.dark-theme .mist-none, body.dark-theme .mist-hint { color: #999; }
    body.dark-theme .mist-gm { border-top-color: #333a48; }
    body.dark-theme .mist-link { color: #8fb0ee; }
  `]
})
export class MistEffectsComponent implements OnInit, OnDestroy {
  readonly tiers = MIST_TIERS;
  mistEffects: MistEffect[] = [];
  state: MistState = emptyMistState();
  activeEffects: MistEffect[] = [];
  isAdmin = false;
  saving = false;
  showCounts = false;
  private subs = new Subscription();

  /** For the table: the row is an active effect. */
  isActive = (effect: MistEffect): boolean => this.state.activeEffects.includes(mistEffectKey(effect));

  constructor(
    private dataService: DataService,
    private mistState: MistStateService,
    private adminService: AdminService,
    private toast: ToastService
  ) {}

  ngOnInit() {
    this.subs.add(this.dataService.getMistEffects().subscribe(effects => {
      this.mistEffects = effects;
      this.updateActive();
    }));
    this.subs.add(this.dataService.mistEffects$.subscribe(effects => {
      if (effects.length) { this.mistEffects = effects; this.updateActive(); }
    }));
    this.subs.add(this.mistState.state$.subscribe(state => {
      this.state = state;
      this.updateActive();
    }));
    this.subs.add(this.adminService.isAdmin$.subscribe(() => this.isAdmin = this.adminService.isAdmin));
    this.mistState.refresh().subscribe();
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  tierSize(tier: MistTier): number {
    return this.mistEffects.filter(e => (e.densityLevel || '').trim().toLowerCase() === tier.toLowerCase()).length;
  }

  setDensity(density: MistDensity) {
    this.save({ ...this.state, density, activeEffects: this.mistState.roll(density, this.mistEffects, this.state.counts) });
  }

  reroll() {
    this.setDensity(this.state.density);
  }

  clear() {
    this.save({ ...this.state, density: '', activeEffects: [] });
  }

  toggle(effect: MistEffect) {
    if (!this.isAdmin || this.saving) return;
    const key = mistEffectKey(effect);
    const active = this.state.activeEffects.includes(key)
      ? this.state.activeEffects.filter(k => k !== key)
      : [...this.state.activeEffects, key];
    this.save({ ...this.state, activeEffects: active });
  }

  setCount(level: MistTier, tier: MistTier, value: string) {
    const n = Math.max(0, Math.min(20, Math.floor(Number(value) || 0)));
    const counts = JSON.parse(JSON.stringify(this.state.counts));
    counts[level][tier] = n;
    this.save({ ...this.state, counts });
  }

  private save(next: MistState) {
    this.saving = true;
    this.mistState.save(next).subscribe({
      next: () => this.saving = false,
      error: (err) => {
        this.saving = false;
        this.toast.show(err?.status === 403 ? 'Only the GM can change the mist.' : 'Could not save the mist.', 'error');
      }
    });
  }

  private updateActive() {
    const byKey = new Map(this.mistEffects.map(e => [mistEffectKey(e), e]));
    this.activeEffects = this.state.activeEffects.map(k => byKey.get(k)).filter((e): e is MistEffect => !!e);
  }
}
