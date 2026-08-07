import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, interval, pairwise } from 'rxjs';
import { Campaign, Player } from './model';
import { DataService } from './data.service';
import { CampaignService } from './campaign.service';

@Injectable({
  providedIn: 'root'
})
export class ActivePlayerService {
  private readonly STORAGE_KEY = 'activePlayer';
  private activePlayerSubject = new BehaviorSubject<Player | null>(null);
  
  constructor(
    private dataService: DataService,
    private campaignService: CampaignService
  ) {
    this.loadFromLocalStorage();
    this.syncActivePlayerFromDatabase();
    this.listenToRealtimePlayerUpdates();
    this.listenToCampaignChanges();
    this.startPeriodicSync();
  }

  private listenToCampaignChanges(): void {
    this.campaignService.selectedCampaign$
      .pipe(pairwise())
      .subscribe(([prev, curr]) => {
        if (prev?.id !== curr?.id || prev?.prefix !== curr?.prefix) {
          this.clearActivePlayer();
        }
      });
  }

  private listenToRealtimePlayerUpdates(): void {
    if (!this.dataService || !this.dataService.players$) {
      return;
    }
    this.dataService.players$.subscribe(players => {
      const current = this.activePlayer;
      if (!current || !players || players.length === 0) {
        return;
      }
      const freshPlayer = players.find(p => p.id === current.id);
      if (freshPlayer) {
        if (JSON.stringify(freshPlayer) !== JSON.stringify(current)) {
          this.setActivePlayer(freshPlayer);
        }
      }
    });
  }

  get activePlayer$(): Observable<Player | null> {
    return this.activePlayerSubject.asObservable();
  }

  get activePlayer(): Player | null {
    return this.activePlayerSubject.value;
  }

  setActivePlayer(player: Player | null): void {
    this.activePlayerSubject.next(player);
    this.saveToLocalStorage(player);
  }

  updateActivePlayer(player: Player): void {
    this.setActivePlayer(player);
    this.dataService.savePlayer(player).subscribe({
      error: error => {
        console.error('Error saving active player:', error);
      }
    });
  }

  clearActivePlayer(): void {
    this.activePlayerSubject.next(null);
    localStorage.removeItem(this.STORAGE_KEY);
  }

  private saveToLocalStorage(player: Player | null): void {
    if (player) {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(player));
    } else {
      localStorage.removeItem(this.STORAGE_KEY);
    }
  }

  private loadFromLocalStorage(): void {
    const storedPlayer = localStorage.getItem(this.STORAGE_KEY);
    if (storedPlayer) {
      try {
        const player = JSON.parse(storedPlayer);
        if (this.isValidPlayer(player)) {
          this.activePlayerSubject.next(player);
        } else {
          console.warn('Stored player data is invalid or outdated. Clearing storage.');
          localStorage.removeItem(this.STORAGE_KEY);
        }
      } catch (error) {
        console.error('Error parsing stored player:', error);
        localStorage.removeItem(this.STORAGE_KEY);
      }
    }
  }

  private isValidPlayer(player: any): player is Player {
    return (
      player &&
      typeof player === 'object' &&
      typeof player.id === 'number' &&
      typeof player.name === 'string' &&
      player.attributes &&
      typeof player.attributes === 'object' &&
      typeof player.attributes.Movement === 'number' &&
      typeof player.attributes.Wounds === 'number' &&
      typeof player.attributes.Save === 'number' &&
      typeof player.attributes.APL === 'number' &&
      Array.isArray(player.attributes.body)
    );
  }

  private syncActivePlayerFromDatabase(): void {
    const storedPlayer = this.activePlayer;
    if (!storedPlayer || !this.dataService || typeof this.dataService.getPlayers !== 'function') {
      return;
    }

    // Wait for the campaign to be set before syncing — otherwise we'd read from
    // the generic 'player' collection (without the campaign prefix) and overwrite
    // the player's localStorage data with stale/default values.
    this.campaignService.selectedCampaign$.pipe(
      // Only proceed once we have a campaign (non-null), then complete
      (source) => new Observable<Campaign | null>(subscriber => {
        const sub = source.subscribe({
          next: campaign => {
            if (campaign) {
              subscriber.next(campaign);
              subscriber.complete();
            }
          },
          error: err => subscriber.error(err),
          complete: () => subscriber.complete()
        });
        return () => sub.unsubscribe();
      })
    ).subscribe(() => {
      this.dataService.getPlayers().subscribe({
        next: players => {
          const current = this.activePlayer;
          if (!current) return;
          const freshPlayer = players.find(p => p.id === current.id);
          if (freshPlayer) {
            this.setActivePlayer(freshPlayer);
          }
        },
        error: error => {
          console.error('Error syncing active player from database:', error);
        }
      });
    });
  }

  private startPeriodicSync(): void {
    const TWENTY_MINUTES_MS = 20 * 60 * 1000;
    interval(TWENTY_MINUTES_MS).subscribe(() => {
      this.dataService.refreshPlayers().subscribe({
        next: players => {
          const current = this.activePlayer;
          if (!current) {
            return;
          }
          const freshPlayer = players.find(p => p.id === current.id);
          if (freshPlayer) {
            this.setActivePlayer(freshPlayer);
          }
        },
        error: error => {
          console.error('Error refreshing players:', error);
        }
      });
    });
  }
}
