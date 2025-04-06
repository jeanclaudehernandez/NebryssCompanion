import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Player } from './model';

@Injectable({
  providedIn: 'root'
})
export class ActivePlayerService {
  private readonly STORAGE_KEY = 'activePlayer';
  private activePlayerSubject = new BehaviorSubject<Player | null>(null);
  
  constructor() {
    this.loadFromLocalStorage();
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
} 