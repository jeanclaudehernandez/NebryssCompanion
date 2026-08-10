import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ThemeService, SkinMode, CharacterSkin } from '../theme.service';
import { DataService } from '../data.service';
import { CampaignService } from '../campaign.service';
import { ActivePlayerService } from '../active-player.service';
import { AdminService } from '../admin.service';
import { UpdateService } from '../update.service';
import { ToastService } from '../toast.service';
import { Campaign } from '../model';

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
            <h2>Settings</h2>
          </div>
          <button type="button" class="settings-close-btn" (click)="onClose()" aria-label="Close settings">
            <span class="material-icons">close</span>
          </button>
        </header>

        <div class="settings-body">
          <!-- SECTION 1: CAMPAIGN SELECTION -->
          <section class="settings-section">
            <h3 class="section-title">
              <span class="material-icons">flag</span>
              Active Campaign
            </h3>

            <div class="campaign-select-box">
              <div class="custom-select-wrapper">
                <select
                  id="settings-campaign-select"
                  class="settings-select"
                  [ngModel]="selectedCampaign?.id"
                  (change)="onCampaignSelect($event)"
                >
                  <option [ngValue]="null" disabled>Select Campaign...</option>
                  <option *ngFor="let camp of campaigns" [value]="camp.id">
                    {{ camp.name }}
                  </option>
                </select>
                <span class="material-icons select-arrow">expand_more</span>
              </div>
              <small class="campaign-help-text" *ngIf="selectedCampaign">
                Switch available players, story logs, npcs, shops and locations.
              </small>
            </div>
          </section>

          <!-- SECTION 2: SKIN & THEME SELECTION -->
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

          <!-- SECTION 3: GM & ADMIN ACCESS -->
          <section class="settings-section">
            <h3 class="section-title">
              <span class="material-icons">security</span>
              GM & Admin Access
            </h3>

            <!-- When not authenticated -->
            <div class="action-card" *ngIf="!adminService.hasAdminAccess">
              <div class="action-card-header">
              </div>
              <div class="admin-input-group">
                <div class="password-field-wrapper">
                  <span class="material-icons input-icon">key</span>
                  <input
                    [type]="showAdminPassword ? 'text' : 'password'"
                    class="settings-input"
                    placeholder="Enter password..."
                    [(ngModel)]="adminPassword"
                    (keyup.enter)="onUnlockAdmin()"
                  />
                  <button
                    type="button"
                    class="btn-toggle-eye"
                    (click)="showAdminPassword = !showAdminPassword"
                    aria-label="Toggle password visibility"
                  >
                    <span class="material-icons">{{ showAdminPassword ? 'visibility_off' : 'visibility' }}</span>
                  </button>
                </div>
                <button type="button" class="btn-accent-action" (click)="onUnlockAdmin()">
                  <span class="material-icons">vpn_key</span>
                </button>
              </div>
              <div class="input-error" *ngIf="adminPasswordError">
                <span class="material-icons">error_outline</span>
                <span>{{ adminPasswordError }}</span>
              </div>
            </div>

            <!-- When authenticated -->
            <div class="action-card gm-active" *ngIf="adminService.hasAdminAccess">
              <div class="action-card-header">
                <div class="status-indicator">
                  <span class="status-dot"></span>
                  <div class="action-card-info">
                    <strong>{{ adminService.isAdmin ? 'GM Mode ACTIVE' : 'Player View (GM OFF)' }}</strong>
                    <small>{{ adminService.isAdmin ? 'Secret vaults, NPC secrets, and entity editors are visible.' : 'Admin tools and secrets are hidden.' }}</small>
                  </div>
                </div>
                <span class="status-badge" [class.badge-active]="adminService.isAdmin">
                  {{ adminService.isAdmin ? 'GM ON' : 'GM OFF' }}
                </span>
              </div>
              <div class="admin-actions-row">
                <button
                  type="button"
                  class="mode-card"
                  [class.active]="adminService.isAdmin"
                  (click)="onToggleGmMode()"
                >
                  <span class="material-icons">{{ adminService.isAdmin ? 'visibility_off' : 'visibility' }}</span>
                  <div class="mode-card-info">
                    <strong>{{ adminService.isAdmin ? 'Switch to Player View' : 'Activate GM Mode' }}</strong>
                    <small>{{ adminService.isAdmin ? 'Hide GM tools' : 'Show GM secrets' }}</small>
                  </div>
                </button>
                <button type="button" class="btn-subtle-danger" (click)="onLogoutAdmin()">
                  <span class="material-icons">lock</span>
                  <span>Lock GM Access</span>
                </button>
              </div>
            </div>
          </section>

          <!-- SECTION 4: DATA & STORAGE MANAGEMENT -->
          <section class="settings-section">
            <h3 class="section-title">
              <span class="material-icons">sync</span>
              Data storage
            </h3>

            <!-- Normal State -->
            <div class="action-card" *ngIf="!isConfirmingRefresh">
              <button type="button" class="btn-accent-action btn-full-width" (click)="onPromptRefresh()">
                <span class="material-icons">refresh</span>
                <span>Clear data and re-sync</span>
              </button>
            </div>

            <!-- Confirming State -->
            <div class="action-card confirm-card" *ngIf="isConfirmingRefresh">
              <div class="confirm-warning">
                <span class="material-icons warning-icon">warning</span>
                <div class="confirm-text-wrap">
                  <strong>Clear Local Cache & Refresh?</strong>
                </div>
              </div>
              <div class="confirm-actions">
                <button type="button" class="btn-cancel-action" (click)="onCancelRefresh()">
                  Cancel
                </button>
                <button type="button" class="btn-accent-action" (click)="onConfirmRefresh()" [disabled]="isRefreshingData">
                  <span class="material-icons">refresh</span>
                  <span>{{ isRefreshingData ? 'Refreshing...' : 'Yes, Refresh' }}</span>
                </button>
              </div>
            </div>
          </section>
        </div>
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
      border: 1px solid #535353;
      border-radius: 8px;
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

    .campaign-select-box {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .campaign-label {
      font-size: 0.78rem;
      font-weight: 600;
      color: #94a3b8;
    }

    .custom-select-wrapper {
      position: relative;
      width: 100%;
    }

    .settings-select {
      width: 100%;
      padding: 10px 36px 10px 12px;
      min-height: 44px;
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.35);
      color: #f8fafc;
      border: 1px solid rgba(255, 255, 255, 0.15);
      font-size: 0.9rem;
      font-weight: 500;
      outline: none;
      cursor: pointer;
      appearance: none;
      -webkit-appearance: none;
      transition: all 0.2s ease;
      box-sizing: border-box;
    }

    .settings-select:focus {
      border-color: var(--accent-color, #d4af37);
      box-shadow: 0 0 0 2px rgba(212, 175, 55, 0.25);
    }

    .settings-select option {
      background: #181926;
      color: #f8fafc;
    }

    .select-arrow {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      pointer-events: none;
      color: #94a3b8;
      font-size: 20px;
    }

    .campaign-help-text {
      font-size: 0.72rem;
      color: #94a3b8;
      line-height: 1.3;
      margin-top: 2px;
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
      padding: 8px 12px;
      min-height: 44px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.04);
      color: #cbd5e1;
      cursor: pointer;
      text-align: left;
      transition: all 0.2s ease;
      box-sizing: border-box;
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
      flex-shrink: 0;
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
      min-height: 44px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-left-width: 4px;
      background: rgba(0, 0, 0, 0.3);
      color: #e2e8f0;
      cursor: pointer;
      font-size: 0.8rem;
      transition: all 0.18s;
      text-align: left;
      box-sizing: border-box;
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

    /* Action Cards & Unified Modal Actions */
    .action-card {
      display: flex;
      flex-direction: column;
      gap: 12px;
      color: #cbd5e1;
      box-sizing: border-box;
      transition: all 0.2s ease;
    }

    .action-card.gm-active {
      border-color: rgba(212, 175, 55, 0.35);
      background: rgba(212, 175, 55, 0.05);
    }

    .action-card.confirm-card {
      border-color: rgba(212, 175, 55, 0.4);
      background: rgba(212, 175, 55, 0.08);
      animation: fadeIn 0.2s ease;
    }

    .action-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .action-icon {
      font-size: 22px;
      color: var(--accent-color, #d4af37);
      flex-shrink: 0;
    }

    .action-card-info {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }

    .action-card-info strong {
      font-size: 0.84rem;
      color: #f8fafc;
      line-height: 1.2;
    }

    .action-card-info small {
      font-size: 0.7rem;
      color: #94a3b8;
      line-height: 1.25;
      margin-top: 2px;
    }

    .admin-input-group {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .password-field-wrapper {
      position: relative;
      flex: 1;
      min-width: 180px;
      display: flex;
      align-items: center;
    }

    .password-field-wrapper .input-icon {
      position: absolute;
      left: 10px;
      color: var(--accent-color, #d4af37);
      font-size: 18px;
      pointer-events: none;
    }

    .settings-input {
      width: 100%;
      padding: 10px 38px 10px 36px;
      min-height: 44px;
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.35);
      color: #f8fafc;
      border: 1px solid rgba(255, 255, 255, 0.15);
      font-size: 0.88rem;
      outline: none;
      box-sizing: border-box;
      transition: all 0.2s;
    }

    .settings-input:focus {
      border-color: var(--accent-color, #d4af37);
      box-shadow: 0 0 0 2px rgba(212, 175, 55, 0.25);
    }

    .btn-toggle-eye {
      position: absolute;
      right: 6px;
      background: transparent;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      padding: 6px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 32px;
      min-height: 32px;
    }

    .btn-toggle-eye:hover {
      color: #ffffff;
    }

    .btn-accent-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 20px;
      min-height: 44px;
      background: var(--accent-color, #d4af37);
      color: #0f172a;
      border: none;
      border-radius: 6px;
      font-weight: bold;
      font-size: 0.86rem;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
      box-sizing: border-box;
    }

    .btn-accent-action:hover {
      filter: brightness(1.15);
      box-shadow: 0 0 10px var(--accent-color, #d4af37);
    }

    .btn-accent-action:active {
      transform: scale(0.98);
    }

    .btn-accent-action:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-full-width {
      width: 100%;
    }

    .btn-subtle-danger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 14px;
      min-height: 44px;
      background: rgba(255, 255, 255, 0.04);
      color: #94a3b8;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      font-weight: 500;
      font-size: 0.8rem;
      cursor: pointer;
      transition: all 0.2s;
      box-sizing: border-box;
    }

    .btn-subtle-danger:hover {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.4);
      color: #fca5a5;
    }

    .input-error {
      display: flex;
      align-items: center;
      gap: 4px;
      color: #ef4444;
      font-size: 0.75rem;
      font-weight: 500;
      margin-top: 2px;
    }

    .input-error .material-icons {
      font-size: 16px;
    }

    .status-indicator {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #94a3b8;
      flex-shrink: 0;
    }

    .action-card.gm-active .status-dot {
      background: var(--accent-color, #d4af37);
      box-shadow: 0 0 8px var(--accent-color, #d4af37);
    }

    .status-badge {
      font-size: 0.72rem;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.1);
      color: #94a3b8;
      letter-spacing: 0.5px;
    }

    .status-badge.badge-active {
      background: rgba(212, 175, 55, 0.2);
      color: var(--accent-color, #d4af37);
      border: 1px solid rgba(212, 175, 55, 0.4);
    }

    .admin-actions-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 8px;
    }

    .confirm-warning {
      display: flex;
      gap: 10px;
      align-items: flex-start;
    }

    .warning-icon {
      color: var(--accent-color, #d4af37);
      font-size: 22px;
      margin-top: 1px;
      flex-shrink: 0;
    }

    .confirm-text-wrap strong {
      font-size: 0.85rem;
      color: #f8fafc;
      display: block;
      margin-bottom: 2px;
    }

    .confirm-text-wrap p {
      margin: 0;
      font-size: 0.75rem;
      color: #94a3b8;
      line-height: 1.35;
    }

    .confirm-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    .btn-cancel-action {
      padding: 8px 16px;
      min-height: 44px;
      background: rgba(255, 255, 255, 0.06);
      color: #cbd5e1;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.82rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-cancel-action:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #ffffff;
    }

    .settings-footer {
      padding: 12px 18px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(0, 0, 0, 0.3);
      display: flex;
      align-items: center;
      justify-content: flex-end;
    }

    .btn-done {
      background: var(--accent-color, #d4af37);
      color: #0f172a;
      border: none;
      padding: 10px 24px;
      min-height: 44px;
      border-radius: 6px;
      font-weight: bold;
      font-size: 0.9rem;
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

  campaigns: Campaign[] = [];
  selectedCampaign: Campaign | null = null;

  adminPassword = '';
  showAdminPassword = false;
  adminPasswordError = '';
  isConfirmingRefresh = false;
  isRefreshingData = false;

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
    private dataService: DataService,
    public campaignService: CampaignService,
    private activePlayerService: ActivePlayerService,
    public adminService: AdminService,
    private updateService: UpdateService,
    private toastService: ToastService
  ) {
    this.dataService.getCampaigns().subscribe(campaigns => {
      this.campaigns = campaigns;
    });

    this.campaignService.selectedCampaign$.subscribe(campaign => {
      this.selectedCampaign = campaign;
    });
  }

  onCampaignSelect(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const campaignId = Number(select.value);
    const chosen = this.campaigns.find(c => c.id === campaignId) || null;
    this.activePlayerService.clearActivePlayer();
    this.campaignService.setSelectedCampaign(chosen);
    this.dataService.refreshPlayers().subscribe();
  }

  onClose(): void {
    this.close.emit();
  }

  onSelectSkinMode(mode: SkinMode): void {
    this.themeService.setSkinMode(mode);
  }

  onSelectManualSkin(skin: CharacterSkin): void {
    this.themeService.setManualSkin(skin);
  }

  onUnlockAdmin(): void {
    if (this.adminPassword.trim() === '2602') {
      this.adminService.setAdminAuthenticated(true);
      this.adminPassword = '';
      this.adminPasswordError = '';
      this.toastService.show('GM Access Granted! GM Mode is ON.', 'success');
    } else {
      this.adminPasswordError = 'Incorrect admin password';
      this.toastService.show('Incorrect admin password', 'error');
    }
  }

  onToggleGmMode(): void {
    const nextState = !this.adminService.isAdmin;
    this.adminService.setAdminStatus(nextState);
    this.toastService.show(
      nextState ? 'GM Mode ON (Secret Vaults & GM Tools visible)' : 'Player View Active (GM OFF)',
      'info'
    );
  }

  onLogoutAdmin(): void {
    this.adminService.setAdminAuthenticated(false);
    this.toastService.show('Logged out of GM mode', 'info');
  }

  onPromptRefresh(): void {
    this.isConfirmingRefresh = true;
  }

  onCancelRefresh(): void {
    this.isConfirmingRefresh = false;
  }

  onConfirmRefresh(): void {
    this.isRefreshingData = true;
    this.toastService.show('Clearing storage and refreshing data...', 'info');
    this.updateService.clearStorageAndReload();
  }
}
