import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, of, tap } from 'rxjs';

@Injectable({
  providedIn: 'root' // This makes it available application-wide
})
export class DataService {
  private playersUrl = 'assets/players.json';
  private weaponsUrl = 'assets/weapons.json';
  private itemsUrl = 'assets/items.json';
  private weaponRulesUrl = 'assets/weaponRules.json';
  private bestiaryUrl = 'assets/bestiary.json';
  private players: any[] = [];
  private weapons: any = {};
  private bestiary: any[] = [];
  private weaponsRules: any[] = [];
  private items: any = {};

  constructor(private http: HttpClient) { }

  getPlayers(): Observable<any[]> {
    if(this.players.length) {
      return of(this.players)
    }
    return this.http.get<any[]>(this.playersUrl).pipe(tap((result) => this.players = result));
  }

  getBestiary(): Observable<any[]> {
    if(this.bestiary.length) {
      return of(this.bestiary)
    }
    return this.http.get<any[]>(this.bestiaryUrl).pipe(tap((result) => this.bestiary = result));
  }

  getWeapons(): Observable<any> {
    if(Object.keys(this.weapons).length) {
      return of(this.weapons)
    }
    return this.http.get<any>(this.weaponsUrl).pipe(tap((result) => this.weapons = result));
  }

  getItems(): Observable<any> {
    if(Object.keys(this.items).length) {
      return of(this.items)
    }
    return this.http.get<any>(this.itemsUrl).pipe(tap((result) => this.items = result));
  }

  getWeaponRules(): Observable<any[]> {
    if(this.weaponsRules.length) {
      return of(this.weaponsRules)
    }
    return this.http.get<any[]>(this.weaponRulesUrl).pipe(tap((result) => this.weaponsRules = result));
  }

  getAllData(): Observable<{
    players: any[],
    weapons: any,
    items: any,
    weaponRules: any[],
    bestiary: any[]
  }> {
    return forkJoin({
      players: this.getPlayers(),
      weapons: this.getWeapons(),
      items: this.getItems(),
      weaponRules: this.getWeaponRules(),
      bestiary: this.getBestiary()
    });
  }

  getWeaponById(id: number): any {
    const allWeapons = [...(this.weapons.melee || []), ...(this.weapons.ranged || [])];
    return allWeapons.find(w => w.id === id) || null;
  }

  getItemById(id: number): any {
    if (!this.items) return null;
    
    // Search through all item categories
    for (const category of Object.values(this.items)) {
      const foundItem = (category as any[]).find((item: any) => item.id === id);
      if (foundItem) return foundItem;
    }
    return null;
  }

  getBestiaryById(id: number): any {
    if(this.bestiary.length === 0) return null;
    return this.bestiary.filter((beast) => beast.id === id)[0] || null;
  }
}