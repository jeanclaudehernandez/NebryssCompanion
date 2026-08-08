import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Player } from './model';

export type CharacterSkin =
  | 'skin-wendy'
  | 'skin-thennur'
  | 'skin-akrina'
  | 'skin-xarion'
  | 'skin-tellurius'
  | 'skin-varek'
  | 'skin-cassios'
  | 'skin-karumnekia'
  | null;

export type SkinMode = 'auto' | 'manual' | 'off';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private darkMode = new BehaviorSubject<boolean>(true);
  darkMode$ = this.darkMode.asObservable();

  private skinMode = new BehaviorSubject<SkinMode>(this.getInitialSkinMode());
  skinMode$ = this.skinMode.asObservable();

  private selectedManualSkin = new BehaviorSubject<CharacterSkin>(this.getInitialManualSkin());
  selectedManualSkin$ = this.selectedManualSkin.asObservable();

  private vignetteEnabled = new BehaviorSubject<boolean>(this.getInitialBool('vignetteEnabled', true));
  vignetteEnabled$ = this.vignetteEnabled.asObservable();

  private gothicFontEnabled = new BehaviorSubject<boolean>(this.getInitialBool('gothicFontEnabled', true));
  gothicFontEnabled$ = this.gothicFontEnabled.asObservable();

  private compactDensityEnabled = new BehaviorSubject<boolean>(this.getInitialBool('compactDensityEnabled', false));
  compactDensityEnabled$ = this.compactDensityEnabled.asObservable();

  private soundEffectsEnabled = new BehaviorSubject<boolean>(this.getInitialBool('soundEffectsEnabled', true));
  soundEffectsEnabled$ = this.soundEffectsEnabled.asObservable();

  private soundVolume = new BehaviorSubject<number>(this.getInitialNumber('soundVolume', 0.8));
  soundVolume$ = this.soundVolume.asObservable();

  private ambientParticlesEnabled = new BehaviorSubject<boolean>(this.getInitialBool('ambientParticlesEnabled', true));
  ambientParticlesEnabled$ = this.ambientParticlesEnabled.asObservable();

  private animationsEnabled = new BehaviorSubject<boolean>(this.getInitialBool('animationsEnabled', true));
  animationsEnabled$ = this.animationsEnabled.asObservable();

  private currentSkin = new BehaviorSubject<CharacterSkin>(null);
  currentSkin$ = this.currentSkin.asObservable();

  private lastActivePlayer: Player | null = null;

  private readonly ALL_SKIN_CLASSES = [
    'akrina-theme',
    'skin-wendy',
    'skin-thennur',
    'skin-akrina',
    'skin-xarion',
    'skin-tellurius',
    'skin-varek',
    'skin-cassios',
    'skin-karumnekia'
  ];

  constructor() {
    // Permanently enforce dark theme
    document.body.classList.add('dark-theme');
    this.applyVisualPreferences();
  }

  private getInitialSkinMode(): SkinMode {
    const saved = localStorage.getItem('skinMode');
    if (saved === 'manual' || saved === 'off' || saved === 'auto') return saved;
    return 'auto';
  }

  private getInitialManualSkin(): CharacterSkin {
    const saved = localStorage.getItem('selectedManualSkin') as CharacterSkin;
    return saved || 'skin-akrina';
  }

  private getInitialBool(key: string, defaultVal: boolean): boolean {
    const saved = localStorage.getItem(key);
    return saved !== null ? saved === 'true' : defaultVal;
  }

  private getInitialNumber(key: string, defaultVal: number): number {
    const saved = localStorage.getItem(key);
    if (saved !== null) {
      const parsed = parseFloat(saved);
      if (!isNaN(parsed)) return parsed;
    }
    return defaultVal;
  }

  getSoundEnabled(): boolean {
    return this.soundEffectsEnabled.value;
  }

  getSoundVolume(): number {
    return this.soundVolume.value;
  }

  setSkinMode(mode: SkinMode): void {
    this.skinMode.next(mode);
    localStorage.setItem('skinMode', mode);
    this.updateSkinState();
  }

  setManualSkin(skin: CharacterSkin): void {
    this.selectedManualSkin.next(skin);
    if (skin) {
      localStorage.setItem('selectedManualSkin', skin);
    }
    this.updateSkinState();
  }

  setVignetteEnabled(enabled: boolean): void {
    this.vignetteEnabled.next(enabled);
    localStorage.setItem('vignetteEnabled', String(enabled));
    document.body.classList.toggle('grimdark-vignette-off', !enabled);
  }

  setGothicFontEnabled(enabled: boolean): void {
    this.gothicFontEnabled.next(enabled);
    localStorage.setItem('gothicFontEnabled', String(enabled));
    document.body.classList.toggle('standard-font-mode', !enabled);
  }

  setCompactDensityEnabled(enabled: boolean): void {
    this.compactDensityEnabled.next(enabled);
    localStorage.setItem('compactDensityEnabled', String(enabled));
    document.body.classList.toggle('compact-density-mode', enabled);
  }

  setSoundEffectsEnabled(enabled: boolean): void {
    this.soundEffectsEnabled.next(enabled);
    localStorage.setItem('soundEffectsEnabled', String(enabled));
  }

  setSoundVolume(val: number): void {
    this.soundVolume.next(val);
    localStorage.setItem('soundVolume', String(val));
  }

  setAmbientParticlesEnabled(enabled: boolean): void {
    this.ambientParticlesEnabled.next(enabled);
    localStorage.setItem('ambientParticlesEnabled', String(enabled));
    document.body.classList.toggle('ambient-particles-off', !enabled);
  }

  setAnimationsEnabled(enabled: boolean): void {
    this.animationsEnabled.next(enabled);
    localStorage.setItem('animationsEnabled', String(enabled));
    document.body.classList.toggle('reduce-motion-mode', !enabled);
  }

  setActivePlayerSkin(player: Player | null): void {
    this.lastActivePlayer = player;
    this.updateSkinState();
  }

  private updateSkinState(): void {
    this.clearAllSkins();

    const mode = this.skinMode.value;
    let targetSkin: CharacterSkin = null;

    if (mode === 'auto') {
      if (this.lastActivePlayer) {
        targetSkin = this.getSkinForPlayer(this.lastActivePlayer);
      }
    } else if (mode === 'manual') {
      targetSkin = this.selectedManualSkin.value;
    }

    if (targetSkin) {
      this.currentSkin.next(targetSkin);
      document.body.classList.add(targetSkin);
      if (targetSkin === 'skin-akrina') {
        document.body.classList.add('akrina-theme');
      }
    } else {
      this.currentSkin.next(null);
    }
  }

  setAkrinaTheme(enable: boolean): void {
    if (enable) {
      this.setManualSkin('skin-akrina');
      this.setSkinMode('manual');
    }
  }

  private getSkinForPlayer(player: Player): CharacterSkin {
    const name = (player.name || '').toLowerCase();

    if (player.id === 1 || name.includes('wendy')) return 'skin-wendy';
    if (player.id === 2 || name.includes('thennur')) return 'skin-thennur';
    if (player.id === 3 || name.includes('akrina')) return 'skin-akrina';
    if (player.id === 4 || name.includes('xarion')) return 'skin-xarion';
    if (player.id === 5 || name.includes('tellurius')) return 'skin-tellurius';
    if (player.id === 6 || name.includes('varek') || name.includes('techmarine')) return 'skin-varek';
    if (player.id === 7 || name.includes('cassios')) return 'skin-cassios';
    if (player.id === 8 || name.includes('karumne')) return 'skin-karumnekia';

    return null;
  }

  private clearAllSkins(): void {
    this.ALL_SKIN_CLASSES.forEach(cls => document.body.classList.remove(cls));
  }

  private applyVisualPreferences(): void {
    document.body.classList.toggle('grimdark-vignette-off', !this.vignetteEnabled.value);
    document.body.classList.toggle('standard-font-mode', !this.gothicFontEnabled.value);
    document.body.classList.toggle('compact-density-mode', this.compactDensityEnabled.value);
    document.body.classList.toggle('ambient-particles-off', !this.ambientParticlesEnabled.value);
    document.body.classList.toggle('reduce-motion-mode', !this.animationsEnabled.value);
  }

  resetToDefaults(): void {
    this.setSkinMode('auto');
    this.setManualSkin('skin-akrina');
    this.setVignetteEnabled(true);
    this.setGothicFontEnabled(true);
    this.setCompactDensityEnabled(false);
    this.setSoundEffectsEnabled(true);
    this.setSoundVolume(0.8);
    this.setAmbientParticlesEnabled(true);
    this.setAnimationsEnabled(true);
  }

  exportDataBackup(): void {
    const backup: Record<string, string | null> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        backup[key] = localStorage.getItem(key);
      }
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NebryssCompanion_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importDataBackup(jsonText: string): boolean {
    try {
      const data = JSON.parse(jsonText);
      if (typeof data === 'object' && data !== null) {
        Object.keys(data).forEach(k => {
          if (typeof data[k] === 'string') {
            localStorage.setItem(k, data[k]);
          }
        });
        window.location.reload();
        return true;
      }
    } catch (e) {}
    return false;
  }
}
 