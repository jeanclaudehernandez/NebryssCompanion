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
    return 'off';
  }

  private getInitialManualSkin(): CharacterSkin {
    const saved = localStorage.getItem('selectedManualSkin') as CharacterSkin;
    return saved || 'skin-akrina';
  }

  private getInitialBool(key: string, defaultVal: boolean): boolean {
    const saved = localStorage.getItem(key);
    return saved !== null ? saved === 'true' : defaultVal;
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
  }

  resetToDefaults(): void {
    this.setSkinMode('auto');
    this.setManualSkin('skin-akrina');
    this.setVignetteEnabled(true);
  }
}
