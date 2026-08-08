import { Component, EventEmitter, Output, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ThemeService, SkinMode, CharacterSkin } from '../theme.service';
import { SoundService } from '../sound.service';

@Component({
  selector: 'app-settings-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="settings-backdrop" (click)="onClose()">
      <div class="settings-dialog" (click)="$event.stopPropagation()">
        <header class="settings-header">
          <div class="settings-title-wrap">
            <span class="material-icons settings-header-icon">tune</span>
            <h2>Settings & Preferences</h2>
          </div>
          <button type="button" class="settings-close-btn" (click)="onClose()" aria-label="Close settings">
            <span class="material-icons">close</span>
          </button>
        </header>

        <div class="settings-body">
          <!-- SECTION 1: SKIN & THEME SELECTION -->
          <section class="settings-section">
            <h3 class="section-title">
              <span class="material-icons">palette</span>
              Character Skin & Theme Mode
            </h3>

            <div class="mode-options-grid">
              <button
                type="button"
                class="mode-card"
                [class.active]="(themeService.skinMode$ | async) === 'auto'"
                (click)="onSelectSkinMode('auto')"
              >
                <span class="material-icons">auto_awesome</span>
                <div class="mode-card-info">
                  <strong>Auto (By Character)</strong>
                  <small>Changes skin dynamically with active player</small>
                </div>
              </button>

              <button
                type="button"
                class="mode-card"
                [class.active]="(themeService.skinMode$ | async) === 'manual'"
                (click)="onSelectSkinMode('manual')"
              >
                <span class="material-icons">touch_app</span>
                <div class="mode-card-info">
                  <strong>Manual Skin</strong>
                  <small>Force a specific character theme</small>
                </div>
              </button>

              <button
                type="button"
                class="mode-card"
                [class.active]="(themeService.skinMode$ | async) === 'off'"
                (click)="onSelectSkinMode('off')"
              >
                <span class="material-icons">dark_mode</span>
                <div class="mode-card-info">
                  <strong>Off</strong>
                  <small>Standard Dark Grimdark theme</small>
                </div>
              </button>
            </div>

            <!-- MANUAL SKIN PICKER -->
            <div class="manual-skin-picker" *ngIf="(themeService.skinMode$ | async) === 'manual'">
              <label class="picker-label">Choose Character Theme:</label>
              <div class="skin-chips-grid">
                <button
                  type="button"
                  *ngFor="let s of skins"
                  class="skin-chip"
                  [class.active]="(themeService.selectedManualSkin$ | async) === s.id"
                  (click)="onSelectManualSkin(s.id)"
                  [style.border-left-color]="s.accent"
                >
                  <span class="chip-emoji">{{ s.emoji }}</span>
                  <span class="chip-title">{{ s.name }}</span>
                </button>
              </div>
            </div>
          </section>

          <!-- SECTION 2: AUDIO & SOUND EFFECTS -->
          <section class="settings-section">
            <h3 class="section-title">
              <span class="material-icons">volume_up</span>
              Synthesized Audio Feedback
            </h3>

            <div class="toggle-row">
              <div class="toggle-info">
                <strong>Tactical UI Sound Effects</strong>
                <small>Audio clicks & feedback synthesized via Web Audio</small>
              </div>
              <label class="switch">
                <input
                  type="checkbox"
                  [checked]="themeService.soundEffectsEnabled$ | async"
                  (change)="onToggleSound($any($event.target).checked)"
                />
                <span class="slider"></span>
              </label>
            </div>

            <div class="volume-slider-row" *ngIf="themeService.soundEffectsEnabled$ | async">
              <div class="volume-label-row">
                <label>Sound Volume:</label>
                <span>{{ ((themeService.soundVolume$ | async) || 0.8) * 100 | number:'1.0-0' }}%</span>
              </div>
              <div class="slider-controls">
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  [value]="themeService.soundVolume$ | async"
                  (input)="onVolumeChange($any($event.target).value)"
                  class="volume-range-input"
                />
                <button type="button" class="btn-test-sound" (click)="testSound()">
                  <span class="material-icons">graphic_eq</span>
                  Test Sound
                </button>
              </div>
            </div>
          </section>

          <!-- SECTION 3: VISUAL ATMOSPHERE -->
          <section class="settings-section">
            <h3 class="section-title">
              <span class="material-icons">auto_fix_high</span>
              Visual Atmosphere & Display
            </h3>

            <div class="toggle-row">
              <div class="toggle-info">
                <strong>Grimdark Edge Vignette</strong>
                <small>Ambient radial dark shadow overlay on screen edges</small>
              </div>
              <label class="switch">
                <input
                  type="checkbox"
                  [checked]="themeService.vignetteEnabled$ | async"
                  (change)="onToggleVignette($any($event.target).checked)"
                />
                <span class="slider"></span>
              </label>
            </div>

            <div class="toggle-row">
              <div class="toggle-info">
                <strong>High Gothic Typography</strong>
                <small>Use Cinzel Decorative headers</small>
              </div>
              <label class="switch">
                <input
                  type="checkbox"
                  [checked]="themeService.gothicFontEnabled$ | async"
                  (change)="onToggleGothicFont($any($event.target).checked)"
                />
                <span class="slider"></span>
              </label>
            </div>

            <div class="toggle-row">
              <div class="toggle-info">
                <strong>Compact Density Mode</strong>
                <small>Tighter table padding & smaller fonts for dense viewports</small>
              </div>
              <label class="switch">
                <input
                  type="checkbox"
                  [checked]="themeService.compactDensityEnabled$ | async"
                  (change)="onToggleCompactDensity($any($event.target).checked)"
                />
                <span class="slider"></span>
              </label>
            </div>

            <div class="toggle-row">
              <div class="toggle-info">
                <strong>Smooth UI Animations</strong>
                <small>Enable transitions and micro-animations</small>
              </div>
              <label class="switch">
                <input
                  type="checkbox"
                  [checked]="themeService.animationsEnabled$ | async"
                  (change)="onToggleAnimations($any($event.target).checked)"
                />
                <span class="slider"></span>
              </label>
            </div>
          </section>

          <!-- SECTION 4: BACKUP & DATA MANAGEMENT -->
          <section class="settings-section">
            <h3 class="section-title">
              <span class="material-icons">save_alt</span>
              Data Backup & Restore
            </h3>

            <div class="backup-actions">
              <button type="button" class="btn-backup-action" (click)="themeService.exportDataBackup()">
                <span class="material-icons">download</span>
                Export Backup (.json)
              </button>

              <button type="button" class="btn-backup-action" (click)="fileInput.click()">
                <span class="material-icons">upload</span>
                Import Backup (.json)
              </button>
              <input #fileInput type="file" accept=".json" style="display: none;" (change)="onFileSelected($event)" />
            </div>
            <span *ngIf="importError" class="import-error">{{ importError }}</span>
          </section>
        </div>

        <footer class="settings-footer">
          <button type="button" class="btn-reset" (click)="onReset()">
            <span class="material-icons">restart_alt</span>
            Reset Defaults
          </button>

          <button type="button" class="btn-done" (click)="onClose()">
            Done
          </button>
        </footer>
      </div>
    </div>
  `,
  styles: [`
    .settings-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.78);
      backdrop-filter: blur(5px);
      z-index: 9900;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      box-sizing: border-box;
      animation: fadeIn 0.2s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .settings-dialog {
      width: 100%;
      max-width: 530px;
      max-height: 88vh;
      display: flex;
      flex-direction: column;
      background: var(--header-bg, linear-gradient(145deg, #181926 0%, #0d0e17 100%));
      border: 1.5px solid var(--accent-color, #d4af37);
      border-radius: 12px;
      box-shadow: 0 16px 45px rgba(0, 0, 0, 0.95), inset 0 0 15px rgba(0,0,0,0.6);
      color: #f8fafc;
      overflow: hidden;
    }

    .settings-header {
      padding: 14px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(0, 0, 0, 0.3);
    }

    .settings-title-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .settings-header-icon {
      color: var(--accent-color, #d4af37);
      font-size: 24px;
    }

    .settings-header h2 {
      margin: 0;
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--header-fg, #f8fafc);
    }

    .settings-close-btn {
      background: transparent;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      padding: 4px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }

    .settings-close-btn:hover {
      color: #ffffff;
      background: rgba(255, 255, 255, 0.12);
    }

    .settings-body {
      padding: 16px 18px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .settings-section {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .section-title {
      margin: 0;
      font-size: 0.88rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--accent-color, #d4af37);
      display: flex;
      align-items: center;
      gap: 6px;
      border-bottom: 1px dashed rgba(255, 255, 255, 0.15);
      padding-bottom: 6px;
    }

    .section-title .material-icons {
      font-size: 18px;
    }

    .mode-options-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 8px;
    }

    .mode-card {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.04);
      color: #cbd5e1;
      cursor: pointer;
      text-align: left;
      transition: all 0.2s ease;
    }

    .mode-card:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.25);
    }

    .mode-card.active {
      background: rgba(212, 175, 55, 0.18);
      border-color: var(--accent-color, #d4af37);
      color: #ffffff;
      box-shadow: 0 0 10px rgba(212, 175, 55, 0.25);
    }

    .mode-card .material-icons {
      font-size: 20px;
      color: var(--accent-color, #d4af37);
    }

    .mode-card-info {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .mode-card-info strong {
      font-size: 0.82rem;
      line-height: 1.2;
    }

    .mode-card-info small {
      font-size: 0.68rem;
      color: #94a3b8;
      line-height: 1.1;
      margin-top: 2px;
    }

    .manual-skin-picker {
      margin-top: 6px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .picker-label {
      font-size: 0.78rem;
      font-weight: 600;
      color: #94a3b8;
    }

    .skin-chips-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6px;
    }

    .skin-chip {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-left-width: 4px;
      background: rgba(0, 0, 0, 0.3);
      color: #e2e8f0;
      cursor: pointer;
      font-size: 0.8rem;
      transition: all 0.18s;
      text-align: left;
    }

    .skin-chip:hover {
      background: rgba(255, 255, 255, 0.08);
    }

    .skin-chip.active {
      background: rgba(255, 255, 255, 0.15);
      border-color: #ffffff;
      font-weight: bold;
      box-shadow: 0 2px 8px rgba(0,0,0,0.5);
    }

    .toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.03);
    }

    .toggle-info {
      display: flex;
      flex-direction: column;
    }

    .toggle-info strong {
      font-size: 0.85rem;
    }

    .toggle-info small {
      font-size: 0.7rem;
      color: #94a3b8;
    }

    .volume-slider-row {
      padding: 10px;
      border-radius: 6px;
      background: rgba(0, 0, 0, 0.25);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .volume-label-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.8rem;
      color: #cbd5e1;
    }

    .slider-controls {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .volume-range-input {
      flex: 1;
      accent-color: var(--accent-color, #d4af37);
      cursor: pointer;
    }

    .btn-test-sound {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      font-size: 0.75rem;
      border-radius: 4px;
      border: 1px solid var(--accent-color, #d4af37);
      background: rgba(212, 175, 55, 0.15);
      color: #ffffff;
      cursor: pointer;
    }

    .btn-test-sound:hover {
      background: rgba(212, 175, 55, 0.3);
    }

    .backup-actions {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }

    .btn-backup-action {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 9px 12px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      background: rgba(255, 255, 255, 0.05);
      color: #e2e8f0;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-backup-action:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: var(--accent-color, #d4af37);
      color: #ffffff;
    }

    .import-error {
      color: #f87171;
      font-size: 0.75rem;
      margin-top: 4px;
    }

    /* CSS Switch Toggle */
    .switch {
      position: relative;
      display: inline-block;
      width: 44px;
      height: 24px;
      flex-shrink: 0;
    }

    .switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .slider {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background-color: #334155;
      transition: .2s;
      border-radius: 24px;
    }

    .slider:before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: .2s;
      border-radius: 50%;
    }

    input:checked + .slider {
      background-color: var(--accent-color, #d4af37);
    }

    input:checked + .slider:before {
      transform: translateX(20px);
    }

    .settings-footer {
      padding: 12px 18px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(0, 0, 0, 0.3);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .btn-reset {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: transparent;
      border: 1px solid #475569;
      color: #94a3b8;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.78rem;
      transition: all 0.2s;
    }

    .btn-reset:hover {
      color: #f8fafc;
      border-color: #94a3b8;
    }

    .btn-done {
      background: var(--accent-color, #d4af37);
      color: #0f172a;
      border: none;
      padding: 7px 22px;
      border-radius: 6px;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-done:hover {
      filter: brightness(1.15);
      box-shadow: 0 0 10px var(--accent-color, #d4af37);
    }
  `]
})
export class SettingsModalComponent {
  @Output() close = new EventEmitter<void>();

  importError: string | null = null;

  skins: { id: CharacterSkin; name: string; emoji: string; accent: string }[] = [
    { id: 'skin-wendy', name: 'Wendy (Field Medic)', emoji: '🪖', accent: '#4e7c41' },
    { id: 'skin-thennur', name: 'Thennur (Fellgor Shaman)', emoji: '📯', accent: '#00e676' },
    { id: 'skin-akrina', name: 'Akrina V. (Rogue Trader)', emoji: '👑', accent: '#d4af37' },
    { id: 'skin-xarion', name: 'Xarion Vex (Abyssal Oracle)', emoji: '👁️', accent: '#00f5d4' },
    { id: 'skin-tellurius', name: 'Tellurius (Mist Golem)', emoji: '🗿', accent: '#9f7aea' },
    { id: 'skin-varek', name: 'Varek Bastion (Techmarine)', emoji: '⚙️', accent: '#ff9800' },
    { id: 'skin-cassios', name: 'Cassios (Templar Captain)', emoji: '🛡️', accent: '#eab308' },
    { id: 'skin-karumnekia', name: 'Karumnekiá (Shadow Mandrake)', emoji: '🗡️', accent: '#22c55e' }
  ];

  constructor(
    public themeService: ThemeService,
    private soundService: SoundService
  ) {}

  onClose(): void {
    this.soundService.playClick();
    this.close.emit();
  }

  onSelectSkinMode(mode: SkinMode): void {
    this.soundService.playTab();
    this.themeService.setSkinMode(mode);
  }

  onSelectManualSkin(skin: CharacterSkin): void {
    this.soundService.playClick();
    this.themeService.setManualSkin(skin);
  }

  onToggleSound(enabled: boolean): void {
    this.themeService.setSoundEffectsEnabled(enabled);
    if (enabled) {
      this.soundService.playToggle();
    }
  }

  onVolumeChange(val: string): void {
    const num = parseFloat(val);
    if (!isNaN(num)) {
      this.themeService.setSoundVolume(num);
    }
  }

  testSound(): void {
    this.soundService.playTab();
  }

  onToggleVignette(enabled: boolean): void {
    this.soundService.playToggle();
    this.themeService.setVignetteEnabled(enabled);
  }

  onToggleGothicFont(enabled: boolean): void {
    this.soundService.playToggle();
    this.themeService.setGothicFontEnabled(enabled);
  }

  onToggleCompactDensity(enabled: boolean): void {
    this.soundService.playToggle();
    this.themeService.setCompactDensityEnabled(enabled);
  }

  onToggleAnimations(enabled: boolean): void {
    this.soundService.playToggle();
    this.themeService.setAnimationsEnabled(enabled);
  }

  onReset(): void {
    this.soundService.playThump();
    this.themeService.resetToDefaults();
  }

  onFileSelected(event: Event): void {
    this.importError = null;
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const success = this.themeService.importDataBackup(text);
        if (!success) {
          this.importError = 'Invalid backup file structure.';
        }
      };
      reader.readAsText(file);
    }
  }
}
