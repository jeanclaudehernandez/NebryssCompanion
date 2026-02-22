import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, interval } from 'rxjs';
import { Player } from './model';
import { DataService } from './data.service';

@Injectable({
  providedIn: 'root'
})
export class ActivePlayerService {
  private readonly STORAGE_KEY = 'activePlayer';
  private activePlayerSubject = new BehaviorSubject<Player | null>(null);
  
  constructor(private dataService: DataService) {
    this.loadFromLocalStorage();
    this.syncActivePlayerFromDatabase();
    this.startPeriodicSync();
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
        const player = JSON.parse(storedPlayer) as Player;
        this.activePlayerSubject.next(player);
      } catch (error) {
        console.error('Error parsing stored player:', error);
        localStorage.removeItem(this.STORAGE_KEY);
      }
    }
  }

  private syncActivePlayerFromDatabase(): void {
    const storedPlayer = this.activePlayer;
    if (!storedPlayer) {
      return;
    }

    this.dataService.getPlayers().subscribe({
      next: players => {
        const freshPlayer = players.find(p => p.id === storedPlayer.id);
        if (freshPlayer) {
          this.setActivePlayer(freshPlayer);
        }
      },
      error: error => {
        console.error('Error syncing active player from database:', error);
      }
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
