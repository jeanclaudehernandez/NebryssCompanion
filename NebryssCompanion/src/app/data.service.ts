import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, shareReplay, map, tap } from 'rxjs';
import { Player, Weapon, BestiaryEntry, WeaponRule, Items, Shop, ItemCategory, NPC, TalentCategory, AlteredState, Lore, MistEffect, Locations, Terrain, Location } from './model';

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private readonly apiUrl = 'https://nebryss-companion-api-771693340084.us-east4.run.app/api';

  private players: Player[] = [];
  private weapons: Weapon[] = [];
  private bestiary: BestiaryEntry[] = [];
  private weaponsRules: WeaponRule[] = [];
  private items: Items = { items: [] };
  private shops: Shop[] = [];
  private itemCategories: ItemCategory[] = [];
  private npcs: NPC[] = [];
  private talents: TalentCategory[] = [];
  private alteredStates: AlteredState[] = [];
  private lore: Lore | null = null;
  private locations: Locations = { locations: [] };
  private mistEffects: MistEffect[] = [];
  private terrains: Terrain[] = [];

  private playersCache$: Observable<Player[]> | null = null;
  private npcsCache$: Observable<NPC[]> | null = null;
  private bestiaryCache$: Observable<BestiaryEntry[]> | null = null;
  private weaponsCache$: Observable<Weapon[]> | null = null;
  private itemsCache$: Observable<Items> | null = null;
  private weaponRulesCache$: Observable<WeaponRule[]> | null = null;
  private shopsCache$: Observable<Shop[]> | null = null;
  private loreCache$: Observable<Lore> | null = null;
  private locationsCache$: Observable<Locations> | null = null;
  private talentsCache$: Observable<TalentCategory[]> | null = null;
  private alteredStatesCache$: Observable<AlteredState[]> | null = null;
  private mistEffectsCache$: Observable<MistEffect[]> | null = null;
  private terrainsCache$: Observable<Terrain[]> | null = null;
  private allDataCache$: Observable<any> | null = null;

  constructor(private http: HttpClient) { }

  getPlayers(): Observable<Player[]> {
    if (!this.playersCache$) {
      this.playersCache$ = this.http.get<Player[]>(`${this.apiUrl}/player`).pipe(
        tap(players => {
          this.players = players;
        }),
        shareReplay(1)
      );
    }
    return this.playersCache$;
  }

  getNpcs(): Observable<NPC[]> {
    if (!this.npcsCache$) {
      this.npcsCache$ = this.http.get<NPC[]>(`${this.apiUrl}/npc`).pipe(
        tap(npcs => {
          this.npcs = npcs;
        }),
        shareReplay(1)
      );
    }
    return this.npcsCache$;
  }

  getitemCategories(): Observable<ItemCategory[]> {
    if (!this.itemCategories.length) {
      return this.http.get<ItemCategory[]>(`${this.apiUrl}/itemCategory`).pipe(
        tap(categories => {
          this.itemCategories = categories;
        }),
        shareReplay(1)
      );
    }
    return this.http.get<ItemCategory[]>(`${this.apiUrl}/itemCategory`).pipe(
      shareReplay(1)
    );
  }

  getBestiary(): Observable<BestiaryEntry[]> {
    if (!this.bestiaryCache$) {
      this.bestiaryCache$ = this.http.get<BestiaryEntry[]>(`${this.apiUrl}/bestiary`).pipe(
        tap(bestiary => {
          this.bestiary = bestiary;
        }),
        shareReplay(1)
      );
    }
    return this.bestiaryCache$;
  }

  getWeapons(): Observable<Weapon[]> {
    if (!this.weaponsCache$) {
      this.weaponsCache$ = this.http.get<Weapon[]>(`${this.apiUrl}/weapon`).pipe(
        tap(weapons => {
          this.weapons = weapons;
        }),
        shareReplay(1)
      );
    }
    return this.weaponsCache$;
  }

  getItems(): Observable<Items> {
    if (!this.itemsCache$) {
      this.itemsCache$ = this.http.get<any[]>(`${this.apiUrl}/item`).pipe(
        map(itemsArray => {
          const wrapped: Items = { items: itemsArray };
          this.items = wrapped;
          return wrapped;
        }),
        shareReplay(1)
      );
    }
    return this.itemsCache$;
  }

  getWeaponRules(): Observable<WeaponRule[]> {
    if (!this.weaponRulesCache$) {
      this.weaponRulesCache$ = this.http.get<WeaponRule[]>(`${this.apiUrl}/weaponRule`).pipe(
        tap(rules => {
          this.weaponsRules = rules;
        }),
        shareReplay(1)
      );
    }
    return this.weaponRulesCache$;
  }

  getShops(): Observable<Shop[]> {
    if (!this.shopsCache$) {
      this.shopsCache$ = this.http.get<Shop[]>(`${this.apiUrl}/shop`).pipe(
        tap(shops => {
          this.shops = shops;
        }),
        shareReplay(1)
      );
    }
    return this.shopsCache$;
  }

  getLore(): Observable<Lore> {
    if (!this.loreCache$) {
      this.loreCache$ = this.http.get<any>(`${this.apiUrl}/lore`).pipe(
        map(response => {
          const lore = Array.isArray(response) ? response[0] : response;
          this.lore = lore as Lore;
          return this.lore;
        }),
        shareReplay(1)
      );
    }
    return this.loreCache$ as Observable<Lore>;
  }

  getLocations(): Observable<Locations> {
    if (!this.locationsCache$) {
      this.locationsCache$ = this.http.get<Location[]>(`${this.apiUrl}/locations`).pipe(
        map(locationsArray => {
          const wrapped: Locations = { locations: locationsArray };
          this.locations = wrapped;
          return wrapped;
        }),
        shareReplay(1)
      );
    }
    return this.locationsCache$;
  }

  getTalents(): Observable<TalentCategory[]> {
    if (!this.talentsCache$) {
      this.talentsCache$ = this.http.get<TalentCategory[]>(`${this.apiUrl}/talent`).pipe(
        tap(talents => {
          this.talents = talents;
        }),
        shareReplay(1)
      );
    }
    return this.talentsCache$;
  }

  getAlteredStates(): Observable<AlteredState[]> {
    if (!this.alteredStatesCache$) {
      this.alteredStatesCache$ = this.http.get<AlteredState[]>(`${this.apiUrl}/status`).pipe(
        tap(states => {
          this.alteredStates = states;
        }),
        shareReplay(1)
      );
    }
    return this.alteredStatesCache$;
  }

  getMistEffects(): Observable<MistEffect[]> {
    if (!this.mistEffectsCache$) {
      this.mistEffectsCache$ = this.http.get<MistEffect[]>(`${this.apiUrl}/mistEffect`).pipe(
        tap(effects => {
          this.mistEffects = effects;
        }),
        shareReplay(1)
      );
    }
    return this.mistEffectsCache$;
  }

  getTerrains(): Observable<Terrain[]> {
    if (!this.terrainsCache$) {
      this.terrainsCache$ = this.http.get<Terrain[]>(`${this.apiUrl}/terrainRule`).pipe(
        tap(terrains => {
          this.terrains = terrains;
        }),
        shareReplay(1)
      );
    }
    return this.terrainsCache$;
  }

  getAllData(): Observable<{
    players: Player[],
    npcs: NPC[],
    weapons: Weapon[],
    items: Items,
    weaponRules: WeaponRule[],
    bestiary: BestiaryEntry[],
    shops: Shop[],
    itemCategories: ItemCategory[],
    alteredStates: AlteredState[],
    mistEffects: any[],
    terrains: Terrain[]
  }> {
    if (!this.allDataCache$) {
      this.allDataCache$ = forkJoin({
        players: this.getPlayers(),
        npcs: this.getNpcs(),
        weapons: this.getWeapons(),
        items: this.getItems(),
        weaponRules: this.getWeaponRules(),
        bestiary: this.getBestiary(),
        shops: this.getShops(),
        itemCategories: this.getitemCategories(),
        alteredStates: this.getAlteredStates(),
        mistEffects: this.getMistEffects(),
        terrains: this.getTerrains()
      }).pipe(shareReplay(1));
    }
    return this.allDataCache$;
  }

  getWeaponById(id: number): any {
    return this.weapons.find(w => w.id === id) || null;
  }

  getItemById(id: number): any {
    if (!this.items) return null;
    
    // With new items structure, items are in a single array
    const foundItem = this.items.items.find((item: any) => item.id === id);
    if (foundItem) return {...foundItem};
    
    return null;
  }

  getBestiaryById(id: number): any {
    if(this.bestiary.length === 0) return null;
    return this.bestiary.find((beast) => beast.id === id) || null;
  }

  getShopWeapons(shopId: number): any[] {
    const shop = this.shops.find((shop) => shop.id === shopId);
    if(!shop) { return [] }
    return shop.items.filter((item: any) => item.type === 'weapon');
  }

  getShopItems(shopId: number): any[] {
    const shop = this.shops.find((shop) => shop.id === shopId);
    if(!shop) { return [] }
    return shop.items.filter((item: any) => item.type === 'item');
  }

  getNpcByd(id: number): any {
    return this.npcs.find((npc) => npc.id == id);
  }

  getTalentById(id: string): any {
    if(!this.talents.length) return null;
    const allTalents = this.talents.flatMap(category => category.talents);
    return allTalents.find(talent => talent.id === id) || null;
  }

  validateBestiaryPR(): { id: number, name: string, currentPR: number, calculatedPR: number, valid: boolean }[] {
    return this.bestiary.map(beast => {
      const attributes = beast.attributes;
      const wounds = attributes.Wounds;
      const save = attributes.Save;
      const movement = attributes.Movement;
      const apl = attributes.APL;

      // Calculate base components of PR
      const basePR = (wounds * 2.2) + ((6 - save) * 7) + (movement * 4) + (apl * 6);

      // Calculate Weapon Threat (highest among all weapon profiles)
      let weaponThreat = 0;
      if (beast.weapons && beast.weapons.length > 0) {
        beast.weapons.forEach((weaponId: number) => {
          const weapon = this.weapons.find((w: any) => w.id === weaponId);
          if (weapon && weapon.profiles) {
            weapon.profiles.forEach((profile: any) => {
              const attacks = profile.attacks || 0;
              const minDamage = profile.damage?.min || 0;
              const ws = profile.ws || 0;
              const threatFromStats = attacks * minDamage * (7 - ws);
              let rulesSum = 0;
              if (profile.specialRules) {
                profile.specialRules.forEach((rule: any) => {
                  const ruleDef = this.weaponsRules.find((r: any) => r.id === rule.ruleId);
                  if (ruleDef && typeof ruleDef.prModifier === 'number') {
                    rulesSum += ruleDef.prModifier;
                  }
                });
              }
              const totalThreat = threatFromStats + rulesSum;
              if (totalThreat > weaponThreat) {
                weaponThreat = totalThreat;
              }
            });
          }
        });
      }

      // Calculate Ability Score (sum of prModifiers)
      let abilityScore = 0;
      if (beast.abilities) {
        beast.abilities.forEach((ability: any) => {
          if (typeof ability.prModifier === 'number') {
            abilityScore += ability.prModifier;
          }
        });
      }

      // Calculate total PR and round to nearest integer
      const calculatedPR = Math.round(basePR + weaponThreat + abilityScore);
      const currentPR = beast.pr;

      return {
        id: beast.id,
        name: beast.name,
        currentPR: currentPR,
        calculatedPR: calculatedPR,
        valid: currentPR === calculatedPR
      };
    });
  }

  savePlayer(player: Player): Observable<Player> {
    return this.http.post<Player>(`${this.apiUrl}/player`, player);
  }
}
