import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, of, tap } from 'rxjs';
import { Campaign, MistDensity, MistEffect, MistState, MIST_TIERS } from './model';
import { WebSocketService } from './websocket.service';
import { CampaignService } from './campaign.service';

export const DEFAULT_MIST_COUNTS: MistState['counts'] = {
  Light: { Light: 2 },
  Medium: { Medium: 1, Light: 2 },
  Dense: { Dense: 1, Medium: 2, Light: 2 }
};

export function emptyMistState(): MistState {
  return { id: 1, density: '', activeEffects: [], counts: JSON.parse(JSON.stringify(DEFAULT_MIST_COUNTS)) };
}

/** The key a mist effect is stored under in the active list (its id, else its name). */
export function mistEffectKey(effect: MistEffect): string {
  return String(effect.id ?? effect.effectName);
}

/**
 * The active mist of the selected campaign: the density the GM set and the effects active now.
 * Read by everyone, changed by the GM/Admin, and kept live through the websocket.
 */
@Injectable({ providedIn: 'root' })
export class MistStateService {
  private get apiUrl(): string {
    return (window as any).API_URL || `${window.location.origin}/api`;
  }
  private stateSubject = new BehaviorSubject<MistState>(emptyMistState());
  readonly state$: Observable<MistState> = this.stateSubject.asObservable();

  constructor(private http: HttpClient, private ws: WebSocketService, private campaignService: CampaignService) {
    this.ws.messages$.subscribe((event: any) => {
      if (event?.entity?.toLowerCase() !== 'miststate' || !event.data) return;
      if (!this.isForCurrentCampaign(event.campaign)) return;
      this.stateSubject.next(this.normalize(event.data));
    });
    this.campaignService.selectedCampaign$.subscribe(() => {
      this.stateSubject.next(emptyMistState());
      this.refresh().subscribe();
    });
  }

  get state(): MistState {
    return this.stateSubject.value;
  }

  refresh(): Observable<MistState> {
    if (!this.campaignService.getSelectedCampaign()) return of(this.state);
    return this.http.get<MistState>(`${this.apiUrl}/mistState`).pipe(
      tap(state => this.stateSubject.next(this.normalize(state))),
      catchError(() => of(this.state))
    );
  }

  /** Saves the state (GM/Admin only); the server pushes it to everyone. */
  save(state: MistState): Observable<MistState> {
    const previous = this.state;
    this.stateSubject.next(state);
    return this.http.put<MistState>(`${this.apiUrl}/mistState`, state).pipe(
      tap({
        next: saved => this.stateSubject.next(this.normalize(saved)),
        error: () => this.stateSubject.next(previous)
      })
    );
  }

  /**
   * Picks the effects for a density at random: for each tier up to the density, as many effects of
   * that tier as the counts say (or all of them when there are fewer).
   */
  roll(density: MistDensity, effects: MistEffect[], counts: MistState['counts']): string[] {
    if (!density) return [];
    const picked: string[] = [];
    MIST_TIERS.slice(0, MIST_TIERS.indexOf(density) + 1).forEach(tier => {
      const pool = effects.filter(e => (e.densityLevel || '').trim().toLowerCase() === tier.toLowerCase());
      const wanted = Math.min(counts?.[density]?.[tier] ?? 0, pool.length);
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      pool.slice(0, wanted).forEach(e => picked.push(mistEffectKey(e)));
    });
    return picked;
  }

  private normalize(state: Partial<MistState> | null | undefined): MistState {
    const base = emptyMistState();
    if (!state) return base;
    const counts = base.counts;
    MIST_TIERS.forEach((level, i) => {
      MIST_TIERS.slice(0, i + 1).forEach(tier => {
        const n = Number(state.counts?.[level]?.[tier]);
        if (Number.isInteger(n) && n >= 0) counts[level][tier] = n;
      });
    });
    return {
      id: 1,
      density: MIST_TIERS.includes(state.density as any) ? state.density as MistDensity : '',
      activeEffects: Array.isArray(state.activeEffects) ? state.activeEffects.map(String) : [],
      counts
    };
  }

  private isForCurrentCampaign(eventCampaign?: Campaign): boolean {
    if (!eventCampaign) return true;
    const current = this.campaignService.getSelectedCampaign();
    if (!current) return true;
    return eventCampaign.id === current.id || (!!eventCampaign.prefix && eventCampaign.prefix === current.prefix);
  }
}
