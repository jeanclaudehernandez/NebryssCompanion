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
  private shopsUrl = 'assets/shops.json';
  private itemCategoriesUrl = 'assets/itemCategories.json';
  private npcsUrl = 'assets/npcs.json';
  private loreUrl = 'assets/lore.json';
  private talentsUrl = 'assets/talents.json';
  private players: any[] = [];
  private weapons: any = {};
  private bestiary: any[] = [];
  private weaponsRules: any[] = [];
  private items: any = {};
  private shops: any[] = [];
  private itemCategories: any[] = [];
  private npcs: any[] = [];
  private lore: any = {};
  private talents: any[] = [];

  constructor(private http: HttpClient) { }

  getPlayers(): Observable<any[]> {
    if(this.players.length) {
      return of(this.players)
    }
    return this.http.get<any[]>(this.playersUrl).pipe(tap((result) => this.players = result));
  }

  getNpcs(): Observable<any[]> {
    if(this.npcs.length) {
      return of(this.npcs)
    }
    return this.http.get<any[]>(this.npcsUrl).pipe(tap((result) => this.npcs = result));
  }


  getitemCategories(): Observable<any[]> {
    if(this.itemCategories.length) {
      return of(this.itemCategories)
    }
    return this.http.get<any[]>(this.itemCategoriesUrl).pipe(tap((result) => this.itemCategories = result));
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

  getShops(): Observable<any[]> {
    if (this.shops.length) return of(this.shops);
    return this.http.get<any[]>(this.shopsUrl).pipe(tap(result => this.shops = result));
  }

  getLore(): Observable<any> {
    if (Object.keys(this.lore).length) { return of(this.lore)}
    return this.http.get<any[]>(this.loreUrl).pipe(tap(result => this.lore = result));
  }

  getTalents(): Observable<any[]> {
    if(this.talents.length) {
      return of(this.talents);
    }
    return this.http.get<any[]>(this.talentsUrl).pipe(tap((result) => this.talents = result));
  }

  getAllData(): Observable<{
    players: any[],
    npcs: any[],
    weapons: any,
    items: any,
    weaponRules: any[],
    bestiary: any[],
    shops: any[],
    itemCategories: any[]
  }> {
    return forkJoin({
      players: this.getPlayers(),
      npcs: this.getNpcs(),
      weapons: this.getWeapons(),
      items: this.getItems(),
      weaponRules: this.getWeaponRules(),
      bestiary: this.getBestiary(),
      shops: this.getShops(),
      itemCategories: this.getitemCategories()
    });
  }

  getWeaponById(id: number): any {
    const allWeapons = [...(this.weapons.melee || []), ...(this.weapons.ranged || [])];
    return allWeapons.find(w => w.id === id) || null;
  }

  getItemById(id: number): any {
    if (!this.items) return null;
    
    // Search through all item categories
    for (const categoryKey in this.items) {
      const category = this.items[categoryKey];
      const foundItem = (category as any[]).find((item: any) => item.id === id);
      if (foundItem) return {...foundItem, itemCategory: categoryKey};
    }
    return null;
  }

  getBestiaryById(id: number): any {
    if(this.bestiary.length === 0) return null;
    return this.bestiary.filter((beast) => beast.id === id)[0] || null;
  }

  getShopWeapons(shopId: number): any[] {
    const shop = this.shops.filter((shop) => shop.id=== shopId)[0];
    if(!shop) { return [] }
    return shop.items.filter((item: any) => item.type === 'weapon')
  }

  getShopItems(shopId: number): any[] {
    const shop = this.shops.filter((shop) => shop.id=== shopId)[0];
    if(!shop) { return [] }
    return shop.items.filter((item: any) => item.type === 'item')
  }

  getNpcByd(id: number): any {
    return this.npcs.filter((npc) => npc.id == id)[0];
  }

  getTalentById(id: string): any {
    if(!this.talents.length) return null;
    const allTalents = this.talents.flatMap(category => category.talents);
    return allTalents.find(talent => talent.id === id) || null;
  }
}