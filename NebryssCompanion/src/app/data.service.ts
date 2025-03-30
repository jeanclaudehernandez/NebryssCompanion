import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin } from 'rxjs';

@Injectable({
  providedIn: 'root' // This makes it available application-wide
})
export class DataService {
  private playersUrl = 'assets/players.json';
  private weaponsUrl = 'assets/weapons.json';
  private itemsUrl = 'assets/items.json';
  private weaponRulesUrl = 'assets/weaponRules.json';

  constructor(private http: HttpClient) { }

  getPlayers(): Observable<any[]> {
    return this.http.get<any[]>(this.playersUrl);
  }

  getWeapons(): Observable<any> {
    return this.http.get<any>(this.weaponsUrl);
  }

  getItems(): Observable<any> {
    return this.http.get<any>(this.itemsUrl);
  }

  getWeaponRules(): Observable<any[]> {
    return this.http.get<any[]>(this.weaponRulesUrl);
  }

  getAllData(): Observable<{
    players: any[],
    weapons: any,
    items: any,
    weaponRules: any[]
  }> {
    return forkJoin({
      players: this.getPlayers(),
      weapons: this.getWeapons(),
      items: this.getItems(),
      weaponRules: this.getWeaponRules()
    });
  }

  getWeaponById(id: number, weapons: any): any {
    const allWeapons = [...(weapons.melee || []), ...(weapons.ranged || [])];
    return allWeapons.find(w => w.id === id) || null;
  }

  getItemById(id: number, items: any): any {
    if (!items) return null;
    
    // Search through all item categories
    for (const category of Object.values(items)) {
      const foundItem = (category as any[]).find((item: any) => item.id === id);
      if (foundItem) return foundItem;
    }
    return null;
  }
}