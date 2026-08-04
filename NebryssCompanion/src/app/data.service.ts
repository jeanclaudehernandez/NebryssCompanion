import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, forkJoin, shareReplay, map, tap, catchError, of } from 'rxjs';
import { Player, Weapon, BestiaryEntry, WeaponRule, Items, Shop, ItemCategory, NPC, TalentCategory, AlteredState, Lore, MistEffect, Locations, Terrain, Location, Talent, Affliction, Letter, Campaign } from './model';
import { SKIP_LOADING_HEADER } from './loading.interceptor';
import { WebSocketService, EntityUpdateEvent } from './websocket.service';
import { CampaignService } from './campaign.service';

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private get apiUrl(): string {
    const win = window as any;
    if (win.API_URL) {
      return win.API_URL;
    }
    return `${window.location.origin}/api`;
  }

  private campaigns: Campaign[] = [];
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
  private afflictions: Affliction[] = [];
  private letters: Letter[] = [];

  private campaignsSubject = new BehaviorSubject<Campaign[]>([]);
  readonly campaigns$ = this.campaignsSubject.asObservable();

  private playersSubject = new BehaviorSubject<Player[]>([]);
  readonly players$ = this.playersSubject.asObservable();

  private npcsSubject = new BehaviorSubject<NPC[]>([]);
  readonly npcs$ = this.npcsSubject.asObservable();

  private weaponsSubject = new BehaviorSubject<Weapon[]>([]);
  readonly weapons$ = this.weaponsSubject.asObservable();

  private itemsSubject = new BehaviorSubject<Items>({ items: [] });
  readonly items$ = this.itemsSubject.asObservable();

  private weaponRulesSubject = new BehaviorSubject<WeaponRule[]>([]);
  readonly weaponRules$ = this.weaponRulesSubject.asObservable();

  private bestiarySubject = new BehaviorSubject<BestiaryEntry[]>([]);
  readonly bestiary$ = this.bestiarySubject.asObservable();

  private shopsSubject = new BehaviorSubject<Shop[]>([]);
  readonly shops$ = this.shopsSubject.asObservable();

  private itemCategoriesSubject = new BehaviorSubject<ItemCategory[]>([]);
  readonly itemCategories$ = this.itemCategoriesSubject.asObservable();

  private alteredStatesSubject = new BehaviorSubject<AlteredState[]>([]);
  readonly alteredStates$ = this.alteredStatesSubject.asObservable();

  private mistEffectsSubject = new BehaviorSubject<MistEffect[]>([]);
  readonly mistEffects$ = this.mistEffectsSubject.asObservable();

  private terrainsSubject = new BehaviorSubject<Terrain[]>([]);
  readonly terrains$ = this.terrainsSubject.asObservable();

  private talentsSubject = new BehaviorSubject<TalentCategory[]>([]);
  readonly talents$ = this.talentsSubject.asObservable();

  private afflictionsSubject = new BehaviorSubject<Affliction[]>([]);
  readonly afflictions$ = this.afflictionsSubject.asObservable();

  private lettersSubject = new BehaviorSubject<Letter[]>([]);
  readonly letters$ = this.lettersSubject.asObservable();

  private loreSubject = new BehaviorSubject<Lore | null>(null);
  readonly lore$ = this.loreSubject.asObservable();

  private locationsSubject = new BehaviorSubject<Locations>({ locations: [] });
  readonly locations$ = this.locationsSubject.asObservable();

  private campaignsCache$: Observable<Campaign[]> | null = null;
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
  private afflictionsCache$: Observable<Affliction[]> | null = null;
  private lettersCache$: Observable<Letter[]> | null = null;
  private allDataCache$: Observable<any> | null = null;

  constructor(
    private http: HttpClient,
    private wsService: WebSocketService,
    private campaignService: CampaignService
  ) {
    this.initRealtimeSync();
    this.listenToCampaignChanges();
  }

  private listenToCampaignChanges(): void {
    this.campaignService.selectedCampaign$.subscribe(() => {
      this.players = [];
      this.playersSubject.next([]);
      this.playersCache$ = null;

      this.shops = [];
      this.shopsSubject.next([]);
      this.shopsCache$ = null;

      this.locations = { locations: [] };
      this.locationsSubject.next({ ...this.locations });
      this.locationsCache$ = null;

      this.npcs = [];
      this.npcsSubject.next([]);
      this.npcsCache$ = null;

      this.allDataCache$ = null;

      this.refreshPlayers().subscribe();
      this.refreshShops().subscribe();
      this.refreshLocations().subscribe();
      this.refreshNpcs().subscribe();
    });
  }

  private isEventForCurrentCampaign(eventCampaign?: Campaign): boolean {
    if (!eventCampaign) return true;
    const current = this.campaignService.getSelectedCampaign();
    if (!current) return true;
    const eventPrefix = eventCampaign.prefix || (eventCampaign as any).playersCollectionName;
    const currentPrefix = current.prefix || (current as any).playersCollectionName;
    return (eventCampaign.id === current.id) || (!!eventPrefix && eventPrefix === currentPrefix);
  }

  private initRealtimeSync(): void {
    this.wsService.messages$.subscribe((event: EntityUpdateEvent & { campaign?: Campaign }) => {
      this.handleRealtimeEvent(event);
    });
  }

  private handleRealtimeEvent(event: EntityUpdateEvent & { campaign?: Campaign }): void {
    const { entity, action, data } = event;
    if (!entity || !data) return;

    const normalizedEntity = entity.toLowerCase();

    if (normalizedEntity === 'player' || normalizedEntity === 'players') {
      if (!this.isEventForCurrentCampaign(event.campaign)) return;
      this.updateArrayCollection(this.players, data, action, p => p.id);
      this.playersSubject.next([...this.players]);
      this.playersCache$ = of(this.players);
    } else if (normalizedEntity === 'campaign' || normalizedEntity === 'campaigns') {
      this.updateArrayCollection(this.campaigns, data, action, c => c.id);
      this.campaignsSubject.next([...this.campaigns]);
      this.campaignsCache$ = of(this.campaigns);
    } else if (normalizedEntity === 'weapon' || normalizedEntity === 'weapons') {
      this.updateArrayCollection(this.weapons, data, action, w => w.id);
      this.weaponsSubject.next([...this.weapons]);
      this.weaponsCache$ = of(this.weapons);
    } else if (normalizedEntity === 'item' || normalizedEntity === 'items') {
      if (!this.items) this.items = { items: [] };
      this.updateArrayCollection(this.items.items, data, action, i => i.id);
      this.itemsSubject.next({ ...this.items });
      this.itemsCache$ = of(this.items);
    } else if (normalizedEntity === 'affliction' || normalizedEntity === 'afflictions') {
      this.updateArrayCollection(this.afflictions, data, action, a => a.id);
      this.afflictionsSubject.next([...this.afflictions]);
      this.afflictionsCache$ = of(this.afflictions);
    } else if (normalizedEntity === 'letter' || normalizedEntity === 'letters') {
      const normalizedLetter = this.normalizeLetter(data);
      this.updateArrayCollection(this.letters, normalizedLetter, action, l => l.id);
      this.lettersSubject.next([...this.letters]);
      this.lettersCache$ = of(this.letters);
    } else if (normalizedEntity === 'bestiary') {
      this.updateArrayCollection(this.bestiary, data, action, b => b.id);
      this.bestiarySubject.next([...this.bestiary]);
      this.bestiaryCache$ = of(this.bestiary);
    } else if (normalizedEntity === 'npc' || normalizedEntity === 'npcs') {
      if (!this.isEventForCurrentCampaign(event.campaign)) return;
      this.updateArrayCollection(this.npcs, data, action, n => n.id);
      this.npcsSubject.next([...this.npcs]);
      this.npcsCache$ = of(this.npcs);
    } else if (normalizedEntity === 'shop' || normalizedEntity === 'shops') {
      if (!this.isEventForCurrentCampaign(event.campaign)) return;
      this.updateArrayCollection(this.shops, data, action, s => s.id);
      this.shopsSubject.next([...this.shops]);
      this.shopsCache$ = of(this.shops);
    } else if (normalizedEntity === 'location' || normalizedEntity === 'locations') {
      if (!this.isEventForCurrentCampaign(event.campaign)) return;
      if (!this.locations || !this.locations.locations) {
        this.locations = { locations: [] };
      }
      this.updateArrayCollection(this.locations.locations, data, action, l => l.id);
      this.locationsSubject.next({ ...this.locations });
      this.locationsCache$ = of(this.locations);
    } else if (normalizedEntity === 'itemcategory' || normalizedEntity === 'itemcategories') {
      this.updateArrayCollection(this.itemCategories, data, action, c => c.id);
      this.itemCategoriesSubject.next([...this.itemCategories]);
    } else if (normalizedEntity === 'weaponrule' || normalizedEntity === 'weaponrules') {
      this.updateArrayCollection(this.weaponsRules, data, action, r => r.id);
      this.weaponRulesSubject.next([...this.weaponsRules]);
      this.weaponRulesCache$ = of(this.weaponsRules);
    } else if (normalizedEntity === 'status' || normalizedEntity === 'alteredstate' || normalizedEntity === 'alteredstates') {
      this.updateArrayCollection(this.alteredStates, data, action, s => s.id);
      this.alteredStatesSubject.next([...this.alteredStates]);
      this.alteredStatesCache$ = of(this.alteredStates);
    } else if (normalizedEntity === 'misteffect' || normalizedEntity === 'misteffects') {
      this.updateArrayCollection(this.mistEffects, data, action, m => m.id || m.effectName);
      this.mistEffectsSubject.next([...this.mistEffects]);
      this.mistEffectsCache$ = of(this.mistEffects);
    } else if (normalizedEntity === 'terrainrule' || normalizedEntity === 'terrain' || normalizedEntity === 'terrains') {
      this.updateArrayCollection(this.terrains, data, action, t => t.id);
      this.terrainsSubject.next([...this.terrains]);
      this.terrainsCache$ = of(this.terrains);
    } else if (normalizedEntity === 'talent' || normalizedEntity === 'talents') {
      this.updateArrayCollection(this.talents, data, action, t => t.id);
      this.talentsSubject.next([...this.talents]);
      this.talentsCache$ = of(this.talents);
    } else if (normalizedEntity === 'location' || normalizedEntity === 'locations') {
      if (!this.locations || !this.locations.locations) {
        this.locations = { locations: [] };
      }
      this.updateArrayCollection(this.locations.locations, data, action, l => l.id);
      this.locationsSubject.next({ ...this.locations });
      this.locationsCache$ = of(this.locations);
    }

    this.allDataCache$ = null;
  }

  private updateArrayCollection<T>(collection: T[], item: any, action: string, getId: (el: T) => any): void {
    if (!item) return;
    const itemId = item.id;
    const index = collection.findIndex(el => {
      const id = getId(el);
      return id === itemId || (typeof id !== 'undefined' && String(id) === String(itemId));
    });

    if (action === 'delete') {
      if (index !== -1) {
        collection.splice(index, 1);
      }
    } else {
      if (index !== -1) {
        collection[index] = { ...collection[index], ...item };
      } else {
        collection.push(item);
      }
    }
  }

  getAfflictions(): Observable<Affliction[]> {
    if (!this.afflictionsCache$) {
      this.afflictionsCache$ = this.http.get<Affliction[]>(`${this.apiUrl}/afflictions`).pipe(
        catchError(() => this.http.get<Affliction[]>('assets/afflictions.json')),
        tap(afflictions => {
          this.afflictions = afflictions;
          this.afflictionsSubject.next([...this.afflictions]);
        }),
        shareReplay(1)
      );
    }
    return this.afflictionsCache$;
  }

  refreshAfflictions(): Observable<Affliction[]> {
    this.afflictionsCache$ = this.http.get<Affliction[]>(`${this.apiUrl}/afflictions`).pipe(
      catchError(() => this.http.get<Affliction[]>('assets/afflictions.json')),
      tap(afflictions => {
        this.afflictions = afflictions;
        this.afflictionsSubject.next([...this.afflictions]);
      }),
      shareReplay(1)
    );
    this.allDataCache$ = null;
    return this.afflictionsCache$;
  }

  createAffliction(affliction: Affliction): Observable<Affliction> {
    return this.http.post<Affliction>(`${this.apiUrl}/afflictions`, affliction).pipe(
      tap((newAffliction) => {
        this.updateArrayCollection(this.afflictions, newAffliction, 'create', a => a.id);
        this.afflictionsSubject.next([...this.afflictions]);
        this.refreshAfflictions().subscribe();
      })
    );
  }

  updateAffliction(affliction: Affliction): Observable<Affliction> {
    return this.http.put<Affliction>(`${this.apiUrl}/afflictions`, affliction).pipe(
      tap((updated) => {
        this.updateArrayCollection(this.afflictions, updated, 'update', a => a.id);
        this.afflictionsSubject.next([...this.afflictions]);
        this.refreshAfflictions().subscribe();
      })
    );
  }

  deleteAffliction(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/afflictions/${id}`).pipe(
      tap(() => {
        this.updateArrayCollection(this.afflictions, { id }, 'delete', a => a.id);
        this.afflictionsSubject.next([...this.afflictions]);
        this.refreshAfflictions().subscribe();
      })
    );
  }

  getCampaigns(): Observable<Campaign[]> {
    if (!this.campaignsCache$) {
      this.campaignsCache$ = this.http.get<Campaign[]>(`${this.apiUrl}/campaign`).pipe(
        catchError(() => this.http.get<Campaign[]>('assets/campaigns.json')),
        tap(campaigns => {
          this.campaigns = campaigns;
          this.campaignsSubject.next([...this.campaigns]);
        }),
        shareReplay(1)
      );
    }
    return this.campaignsCache$;
  }

  refreshCampaigns(): Observable<Campaign[]> {
    this.campaignsCache$ = this.http.get<Campaign[]>(`${this.apiUrl}/campaign`).pipe(
      catchError(() => this.http.get<Campaign[]>('assets/campaigns.json')),
      tap(campaigns => {
        this.campaigns = campaigns;
        this.campaignsSubject.next([...this.campaigns]);
      }),
      shareReplay(1)
    );
    return this.campaignsCache$;
  }

  createCampaign(campaign: Campaign): Observable<Campaign> {
    return this.http.post<Campaign>(`${this.apiUrl}/campaign`, campaign).pipe(
      tap((newCampaign) => {
        this.updateArrayCollection(this.campaigns, newCampaign, 'create', c => c.id);
        this.campaignsSubject.next([...this.campaigns]);
        this.refreshCampaigns().subscribe();
      })
    );
  }

  updateCampaign(campaign: Campaign): Observable<Campaign> {
    return this.http.put<Campaign>(`${this.apiUrl}/campaign`, campaign).pipe(
      tap((updated) => {
        this.updateArrayCollection(this.campaigns, updated, 'update', c => c.id);
        this.campaignsSubject.next([...this.campaigns]);
        this.refreshCampaigns().subscribe();
      })
    );
  }

  deleteCampaign(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/campaign/${id}`).pipe(
      tap(() => {
        this.updateArrayCollection(this.campaigns, { id }, 'delete', c => c.id);
        this.campaignsSubject.next([...this.campaigns]);
        this.refreshCampaigns().subscribe();
      })
    );
  }

  getPlayers(): Observable<Player[]> {
    if (!this.playersCache$) {
      this.playersCache$ = this.http.get<Player[]>(`${this.apiUrl}/player`).pipe(
        catchError(() => this.http.get<Player[]>('assets/players.json')),
        tap(players => {
          this.players = players;
          this.playersSubject.next([...this.players]);
        }),
        shareReplay(1)
      );
    }
    return this.playersCache$;
  }

  refreshPlayers(): Observable<Player[]> {
    this.playersCache$ = this.http.get<Player[]>(`${this.apiUrl}/player`).pipe(
      catchError(() => this.http.get<Player[]>('assets/players.json')),
      tap(players => {
        this.players = players;
        this.playersSubject.next([...this.players]);
      }),
      shareReplay(1)
    );
    this.allDataCache$ = null;
    return this.playersCache$;
  }

  getNpcs(): Observable<NPC[]> {
    if (!this.npcsCache$) {
      this.npcsCache$ = this.http.get<NPC[]>(`${this.apiUrl}/npc`).pipe(
        catchError(() => this.http.get<NPC[]>('assets/npcs.json')),
        tap(npcs => {
          this.npcs = npcs;
          this.npcsSubject.next([...this.npcs]);
        }),
        shareReplay(1)
      );
    }
    return this.npcsCache$;
  }

  refreshNpcs(): Observable<NPC[]> {
    this.npcsCache$ = this.http.get<NPC[]>(`${this.apiUrl}/npc`).pipe(
      catchError(() => this.http.get<NPC[]>('assets/npcs.json')),
      tap(npcs => {
        this.npcs = npcs || [];
        this.npcsSubject.next([...this.npcs]);
      }),
      shareReplay(1)
    );
    this.allDataCache$ = null;
    return this.npcsCache$;
  }

  createNpc(npc: NPC): Observable<NPC> {
    if (!npc.id || npc.id === 0) {
      const maxId = this.npcs.reduce((max, n) => (n.id > max ? n.id : max), 0);
      npc.id = maxId + 1;
    }
    return this.http.post<NPC>(`${this.apiUrl}/npc`, npc).pipe(
      catchError(() => {
        const index = this.npcs.findIndex(n => n.id === npc.id);
        if (index === -1) {
          this.npcs.push(npc);
        }
        return of(npc);
      }),
      tap(created => {
        const index = this.npcs.findIndex(n => n.id === created.id);
        if (index !== -1) {
          this.npcs[index] = created;
        } else {
          this.npcs.push(created);
        }
        this.npcsSubject.next([...this.npcs]);
        this.npcsCache$ = null;
        this.allDataCache$ = null;
      })
    );
  }

  updateNpc(npc: NPC): Observable<NPC> {
    return this.http.put<NPC>(`${this.apiUrl}/npc`, npc).pipe(
      catchError(() => {
        const index = this.npcs.findIndex(n => n.id === npc.id);
        if (index !== -1) {
          this.npcs[index] = npc;
        }
        return of(npc);
      }),
      tap(updated => {
        const index = this.npcs.findIndex(n => n.id === updated.id);
        if (index !== -1) {
          this.npcs[index] = updated;
        }
        this.npcsSubject.next([...this.npcs]);
        this.npcsCache$ = null;
        this.allDataCache$ = null;
      })
    );
  }

  deleteNpc(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/npc/${id}`).pipe(
      catchError(() => {
        this.npcs = this.npcs.filter(n => n.id !== id);
        return of({ success: true, id });
      }),
      tap(() => {
        this.npcs = this.npcs.filter(n => n.id !== id);
        this.npcsSubject.next([...this.npcs]);
        this.npcsCache$ = null;
        this.allDataCache$ = null;
      })
    );
  }

  getitemCategories(): Observable<ItemCategory[]> {
    if (!this.itemCategories.length) {
      return this.http.get<ItemCategory[]>(`${this.apiUrl}/itemCategory`).pipe(
        catchError(() => this.http.get<ItemCategory[]>('assets/itemCategories.json')),
        tap(categories => {
          this.itemCategories = categories;
          this.itemCategoriesSubject.next([...this.itemCategories]);
        }),
        shareReplay(1)
      );
    }
    return this.http.get<ItemCategory[]>(`${this.apiUrl}/itemCategory`).pipe(
      catchError(() => this.http.get<ItemCategory[]>('assets/itemCategories.json')),
      shareReplay(1)
    );
  }

  getBestiary(): Observable<BestiaryEntry[]> {
    if (!this.bestiaryCache$) {
      this.bestiaryCache$ = this.http.get<BestiaryEntry[]>(`${this.apiUrl}/bestiary`).pipe(
        catchError(() => this.http.get<BestiaryEntry[]>('assets/bestiary.json')),
        tap(bestiary => {
          this.bestiary = bestiary;
          this.bestiarySubject.next([...this.bestiary]);
        }),
        shareReplay(1)
      );
    }
    return this.bestiaryCache$;
  }

  refreshBestiary(): Observable<BestiaryEntry[]> {
    this.bestiaryCache$ = this.http.get<BestiaryEntry[]>(`${this.apiUrl}/bestiary`).pipe(
      catchError(() => this.http.get<BestiaryEntry[]>('assets/bestiary.json')),
      tap(bestiary => {
        this.bestiary = bestiary;
        this.bestiarySubject.next([...this.bestiary]);
      }),
      shareReplay(1)
    );
    this.allDataCache$ = null;
    return this.bestiaryCache$;
  }

  saveBestiary(entry: BestiaryEntry): Observable<BestiaryEntry> {
    if (entry.id && entry.id > 0 && this.bestiary.some(b => b.id === entry.id)) {
      return this.updateBestiary(entry);
    } else {
      return this.createBestiary(entry);
    }
  }

  createBestiary(entry: BestiaryEntry): Observable<BestiaryEntry> {
    if (!entry.id || entry.id === 0) {
      const maxId = this.bestiary.reduce((max, b) => (b.id > max ? b.id : max), 0);
      entry.id = maxId + 1;
    }
    return this.http.post<BestiaryEntry>(`${this.apiUrl}/bestiary`, entry).pipe(
      catchError(() => {
        const index = this.bestiary.findIndex(b => b.id === entry.id);
        if (index === -1) {
          this.bestiary.push(entry);
        } else {
          this.bestiary[index] = entry;
        }
        return of(entry);
      }),
      tap(created => {
        const index = this.bestiary.findIndex(b => b.id === created.id);
        if (index !== -1) {
          this.bestiary[index] = created;
        } else {
          this.bestiary.push(created);
        }
        this.bestiarySubject.next([...this.bestiary]);
        this.bestiaryCache$ = null;
        this.allDataCache$ = null;
      })
    );
  }

  updateBestiary(entry: BestiaryEntry): Observable<BestiaryEntry> {
    return this.http.put<BestiaryEntry>(`${this.apiUrl}/bestiary`, entry).pipe(
      catchError(() => {
        const index = this.bestiary.findIndex(b => b.id === entry.id);
        if (index !== -1) {
          this.bestiary[index] = entry;
        }
        return of(entry);
      }),
      tap(updated => {
        const index = this.bestiary.findIndex(b => b.id === updated.id);
        if (index !== -1) {
          this.bestiary[index] = updated;
        }
        this.bestiarySubject.next([...this.bestiary]);
        this.bestiaryCache$ = null;
        this.allDataCache$ = null;
      })
    );
  }

  deleteBestiary(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/bestiary/${id}`).pipe(
      catchError(() => {
        this.bestiary = this.bestiary.filter(b => b.id !== id);
        return of({ success: true, id });
      }),
      tap(() => {
        this.bestiary = this.bestiary.filter(b => b.id !== id);
        this.bestiarySubject.next([...this.bestiary]);
        this.bestiaryCache$ = null;
        this.allDataCache$ = null;
      })
    );
  }

  refreshWeapons(): Observable<Weapon[]> {
    this.weaponsCache$ = null;
    return this.getWeapons();
  }

  getWeapons(): Observable<Weapon[]> {
    if (!this.weaponsCache$) {
      this.weaponsCache$ = this.http.get<Weapon[]>(`${this.apiUrl}/weapon`).pipe(
        catchError(() => this.http.get<Weapon[]>('assets/weapons.json')),
        tap(weapons => {
          this.weapons = weapons;
          this.weaponsSubject.next([...this.weapons]);
        }),
        shareReplay(1)
      );
    }
    return this.weaponsCache$;
  }

  refreshItems(): Observable<Items> {
    this.itemsCache$ = null;
    return this.getItems();
  }

  getItems(): Observable<Items> {
    if (!this.itemsCache$) {
      this.itemsCache$ = this.http.get<any>(`${this.apiUrl}/item`).pipe(
        catchError(() => this.http.get<any>('assets/items.json')),
        map(itemsResponse => {
          const itemsArray = Array.isArray(itemsResponse) ? itemsResponse : (itemsResponse?.items || []);
          const wrapped: Items = { items: itemsArray };
          this.items = wrapped;
          this.itemsSubject.next({ ...this.items });
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
        catchError(() => this.http.get<WeaponRule[]>('assets/weaponRules.json')),
        tap(rules => {
          this.weaponsRules = rules;
          this.weaponRulesSubject.next([...this.weaponsRules]);
        }),
        shareReplay(1)
      );
    }
    return this.weaponRulesCache$;
  }

  getShops(): Observable<Shop[]> {
    if (!this.shopsCache$) {
      this.shopsCache$ = this.http.get<Shop[]>(`${this.apiUrl}/shop`).pipe(
        catchError(() => this.http.get<Shop[]>('assets/shops.json')),
        tap(shops => {
          this.shops = shops;
          this.shopsSubject.next([...this.shops]);
        }),
        shareReplay(1)
      );
    }
    return this.shopsCache$;
  }

  refreshShops(): Observable<Shop[]> {
    this.shopsCache$ = this.http.get<Shop[]>(`${this.apiUrl}/shop`).pipe(
      catchError(() => this.http.get<Shop[]>('assets/shops.json')),
      tap(shops => {
        this.shops = shops || [];
        this.shopsSubject.next([...this.shops]);
      }),
      shareReplay(1)
    );
    this.allDataCache$ = null;
    return this.shopsCache$;
  }

  updateShop(shop: Shop): Observable<Shop> {
    return this.http.put<Shop>(`${this.apiUrl}/shop`, shop).pipe(
      catchError(() => {
        const index = this.shops.findIndex(s => s.id === shop.id);
        if (index !== -1) {
          this.shops[index] = shop;
        }
        return of(shop);
      }),
      tap(updatedShop => {
        const index = this.shops.findIndex(s => s.id === updatedShop.id);
        if (index !== -1) {
          this.shops[index] = updatedShop;
        }
        this.shopsSubject.next([...this.shops]);
        this.shopsCache$ = null;
        this.allDataCache$ = null;
      })
    );
  }

  createShop(shop: Shop): Observable<Shop> {
    return this.http.post<Shop>(`${this.apiUrl}/shop`, shop).pipe(
      catchError(() => {
        if (!shop.id) {
          const maxId = this.shops.reduce((max, s) => (s.id > max ? s.id : max), 0);
          shop.id = maxId + 1;
        }
        this.shops.push(shop);
        return of(shop);
      }),
      tap(created => {
        const index = this.shops.findIndex(s => s.id === created.id);
        if (index !== -1) {
          this.shops[index] = created;
        } else {
          this.shops.push(created);
        }
        this.shopsSubject.next([...this.shops]);
        this.shopsCache$ = null;
        this.allDataCache$ = null;
      })
    );
  }

  deleteShop(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/shop/${id}`).pipe(
      catchError(() => {
        this.shops = this.shops.filter(s => s.id !== id);
        return of({ success: true, id });
      }),
      tap(() => {
        this.shops = this.shops.filter(s => s.id !== id);
        this.shopsSubject.next([...this.shops]);
        this.shopsCache$ = null;
        this.allDataCache$ = null;
      })
    );
  }

  getLore(): Observable<Lore> {
    if (!this.loreCache$) {
      this.loreCache$ = this.http.get<any>(`${this.apiUrl}/lore`).pipe(
        map(response => {
          const lore = Array.isArray(response) ? response[0] : response;
          this.lore = (lore || {}) as Lore;
          this.loreSubject.next(this.lore);
          return this.lore;
        }),
        catchError(err => {
          console.error('Error fetching lore from API:', err);
          this.lore = {} as Lore;
          this.loreSubject.next(this.lore);
          return of(this.lore);
        }),
        shareReplay(1)
      );
    }
    return this.loreCache$ as Observable<Lore>;
  }

  refreshLore(): Observable<Lore> {
    this.loreCache$ = this.http.get<any>(`${this.apiUrl}/lore`).pipe(
      map(response => {
        const lore = Array.isArray(response) ? response[0] : response;
        this.lore = (lore || {}) as Lore;
        this.loreSubject.next(this.lore);
        return this.lore;
      }),
      catchError(err => {
        console.error('Error refreshing lore from API:', err);
        this.lore = {} as Lore;
        this.loreSubject.next(this.lore);
        return of(this.lore);
      }),
      shareReplay(1)
    );
    this.allDataCache$ = null;
    return this.loreCache$;
  }

  updateLore(lore: Lore): Observable<Lore> {
    return this.http.put<Lore>(`${this.apiUrl}/lore`, lore).pipe(
      catchError(() => {
        this.lore = lore;
        return of(lore);
      }),
      tap(saved => {
        this.lore = saved;
      })
    );
  }

  getLocations(): Observable<Locations> {
    if (!this.locationsCache$) {
      this.locationsCache$ = this.http.get<any>(`${this.apiUrl}/locations`).pipe(
        map(remote => {
          const rawLocations = Array.isArray(remote) ? remote : (remote?.locations || []);
          const locationsList = rawLocations.map((loc: any) => ({
            ...loc,
            secrets: (loc.secrets && loc.secrets.length > 0)
              ? loc.secrets
              : (loc.privateNotes ? [{ id: 'sec-1', title: 'GM Secret Notes', content: loc.privateNotes, isRevealed: loc.isSecretRevealed }] : [])
          }));
          const wrapped: Locations = { locations: locationsList };
          this.locations = wrapped;
          this.locationsSubject.next({ ...this.locations });
          return wrapped;
        }),
        catchError(err => {
          console.error('Error loading locations from API:', err);
          const empty: Locations = { locations: [] };
          this.locations = empty;
          this.locationsSubject.next({ ...this.locations });
          return of(empty);
        }),
        shareReplay(1)
      );
    }
    return this.locationsCache$;
  }

  refreshLocations(): Observable<Locations> {
    this.locationsCache$ = this.http.get<any>(`${this.apiUrl}/locations`).pipe(
      map(remote => {
        const rawLocations = Array.isArray(remote) ? remote : (remote?.locations || []);
        const locationsList = rawLocations.map((loc: any) => ({
          ...loc,
          secrets: (loc.secrets && loc.secrets.length > 0)
            ? loc.secrets
            : (loc.privateNotes ? [{ id: 'sec-1', title: 'GM Secret Notes', content: loc.privateNotes, isRevealed: loc.isSecretRevealed }] : [])
        }));
        const wrapped: Locations = { locations: locationsList };
        this.locations = wrapped;
        this.locationsSubject.next({ ...this.locations });
        return wrapped;
      }),
      catchError(err => {
        console.error('Error refreshing locations from API:', err);
        const empty: Locations = { locations: [] };
        this.locations = empty;
        this.locationsSubject.next({ ...this.locations });
        return of(empty);
      }),
      shareReplay(1)
    );
    this.allDataCache$ = null;
    return this.locationsCache$;
  }

  private readonly talentNameOverrides: Record<string, string> = {
    'att1': 'Agility',
    'att2': 'Vitality',
    'att3': 'Defense',
    'att4': 'Combat Experience',
    'su2': 'Unbound Reflex',
    'su4': 'Phantom Step',
    'su5': "Scavenger's Greed",
  };

  getTalents(): Observable<TalentCategory[]> {
    if (!this.talentsCache$) {
      this.talentsCache$ = this.http.get<TalentCategory[]>(`${this.apiUrl}/talent`).pipe(
        catchError(() => this.http.get<TalentCategory[]>('assets/talents.json')),
        map(categories => categories.map(category => ({
          ...category,
          talents: category.talents.map(t => ({
            ...t,
            name: this.talentNameOverrides[t.id] ?? t.name
          }))
        }))),
        tap(talents => {
          this.talents = talents;
          this.talentsSubject.next([...this.talents]);
        }),
        shareReplay(1)
      );
    }
    return this.talentsCache$;
  }

  getAlteredStates(): Observable<AlteredState[]> {
    if (!this.alteredStatesCache$) {
      this.alteredStatesCache$ = this.http.get<AlteredState[]>(`${this.apiUrl}/status`).pipe(
        catchError(() => this.http.get<AlteredState[]>('assets/alteredStates.json')),
        tap(states => {
          this.alteredStates = states;
          this.alteredStatesSubject.next([...this.alteredStates]);
        }),
        shareReplay(1)
      );
    }
    return this.alteredStatesCache$;
  }

  getMistEffects(): Observable<MistEffect[]> {
    if (!this.mistEffectsCache$) {
      this.mistEffectsCache$ = this.http.get<MistEffect[]>(`${this.apiUrl}/mistEffect`).pipe(
        catchError(() => this.http.get<MistEffect[]>('assets/mistEffects.json')),
        tap(effects => {
          this.mistEffects = effects;
          this.mistEffectsSubject.next([...this.mistEffects]);
        }),
        shareReplay(1)
      );
    }
    return this.mistEffectsCache$;
  }

  getTerrains(): Observable<Terrain[]> {
    if (!this.terrainsCache$) {
      this.terrainsCache$ = this.http.get<Terrain[]>(`${this.apiUrl}/terrainRule`).pipe(
        catchError(() => this.http.get<Terrain[]>('assets/terrainRules.json')),
        tap(terrains => {
          this.terrains = terrains;
          this.terrainsSubject.next([...this.terrains]);
        }),
        shareReplay(1)
      );
    }
    return this.terrainsCache$;
  }

  getLetters(): Observable<Letter[]> {
    if (!this.lettersCache$) {
      this.lettersCache$ = this.http.get<Letter[]>(`${this.apiUrl}/letter`).pipe(
        catchError(() => this.http.get<Letter[]>('assets/letters.json')),
        tap(letters => {
          this.letters = letters.map(letter => this.normalizeLetter(letter));
          this.lettersSubject.next([...this.letters]);
        }),
        shareReplay(1)
      );
    }
    return this.lettersCache$;
  }

  refreshLetters(): Observable<Letter[]> {
    this.lettersCache$ = this.http.get<Letter[]>(`${this.apiUrl}/letter`).pipe(
      catchError(() => this.http.get<Letter[]>('assets/letters.json')),
      tap(letters => {
        this.letters = letters.map(letter => this.normalizeLetter(letter));
        this.lettersSubject.next([...this.letters]);
      }),
      shareReplay(1)
    );
    this.allDataCache$ = null;
    return this.lettersCache$;
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
    locations: Locations,
    alteredStates: AlteredState[],
    mistEffects: any[],
    terrains: Terrain[],
    talents: Talent[],
    afflictions: Affliction[],
    letters?: Letter[]
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
        locations: this.getLocations(),
        alteredStates: this.getAlteredStates(),
        mistEffects: this.getMistEffects(),
        terrains: this.getTerrains(),
        talents: this.getTalents(),
        afflictions: this.getAfflictions(),
        letters: this.getLetters()
      }).pipe(shareReplay(1));
    }
    return this.allDataCache$;
  }

  getWeaponById(id: number): any {
    return this.weapons.find(w => w.id === id) || null;
  }

  getItemById(id: number): any {
    if (!this.items) return null;
    const foundItem = this.items.items.find((item: any) => item.id === id);
    if (foundItem) return { ...foundItem };
    return null;
  }

  getBestiaryById(id: number): any {
    if (this.bestiary.length === 0) return null;
    return this.bestiary.find((beast) => beast.id === id) || null;
  }

  getShopWeapons(shopId: number): any[] {
    const shop = this.shops.find((shop) => shop.id === shopId);
    if (!shop) { return [] }
    return shop.items.filter((item: any) => item.type === 'weapon');
  }

  getShopItems(shopId: number): any[] {
    const shop = this.shops.find((shop) => shop.id === shopId);
    if (!shop) { return [] }
    return shop.items.filter((item: any) => item.type === 'item');
  }

  getNpcByd(id: number): any {
    return this.npcs.find((npc) => npc.id == id);
  }

  getTalentById(id: string): any {
    if (!this.talents.length) return null;
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

      const basePR = (wounds * 2.2) + ((6 - save) * 7) + (movement * 4) + (apl * 6);

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

      let abilityScore = 0;
      if (beast.abilities) {
        beast.abilities.forEach((ability: any) => {
          if (typeof ability.prModifier === 'number') {
            abilityScore += ability.prModifier;
          }
        });
      }

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
    this.updateArrayCollection(this.players, player, 'update', p => p.id);
    this.playersSubject.next([...this.players]);

    return this.http.put<Player>(`${this.apiUrl}/player`, player, {
      headers: new HttpHeaders({
        [SKIP_LOADING_HEADER]: 'true'
      })
    }).pipe(
      tap(savedPlayer => {
        const index = this.players.findIndex(existingPlayer => existingPlayer.id === savedPlayer.id);
        if (index !== -1) {
          this.players[index] = savedPlayer;
        } else {
          this.players.push(savedPlayer);
        }
        this.playersCache$ = null;
        this.allDataCache$ = null;
      })
    );
  }

  createPlayer(player: Player): Observable<Player> {
    this.updateArrayCollection(this.players, player, 'create', p => p.id);
    this.playersSubject.next([...this.players]);

    return this.http.post<Player>(`${this.apiUrl}/player`, player, {
      headers: new HttpHeaders({
        [SKIP_LOADING_HEADER]: 'true'
      })
    }).pipe(
      tap(createdPlayer => {
        const index = this.players.findIndex(existingPlayer => existingPlayer.id === createdPlayer.id);
        if (index !== -1) {
          this.players[index] = createdPlayer;
        } else {
          this.players.push(createdPlayer);
        }
        this.playersSubject.next([...this.players]);
        this.playersCache$ = null;
        this.allDataCache$ = null;
      })
    );
  }

  deletePlayer(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/player/${id}`).pipe(
      tap(() => {
        this.updateArrayCollection(this.players, { id }, 'delete', p => p.id);
        this.playersSubject.next([...this.players]);
        this.playersCache$ = null;
        this.allDataCache$ = null;
      })
    );
  }

  createItem(item: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/item`, item).pipe(
      tap(newItem => {
        if (this.items && this.items.items) {
          this.updateArrayCollection(this.items.items, newItem, 'create', i => i.id);
          this.itemsSubject.next({ ...this.items });
          this.itemsCache$ = null;
        }
      })
    );
  }

  updateItem(item: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/item`, item).pipe(
      tap(updatedItem => {
        if (this.items && this.items.items) {
          this.updateArrayCollection(this.items.items, updatedItem, 'update', i => i.id);
          this.itemsSubject.next({ ...this.items });
          this.itemsCache$ = null;
        }
      })
    );
  }

  deleteItem(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/item/${id}`).pipe(
      tap(() => {
        if (this.items && this.items.items) {
          this.updateArrayCollection(this.items.items, { id }, 'delete', i => i.id);
          this.itemsSubject.next({ ...this.items });
          this.itemsCache$ = null;
        }
      })
    );
  }

  createWeapon(weapon: Weapon): Observable<Weapon> {
    return this.http.post<Weapon>(`${this.apiUrl}/weapon`, weapon).pipe(
      tap(newWeapon => {
        this.updateArrayCollection(this.weapons, newWeapon, 'create', w => w.id);
        this.weaponsSubject.next([...this.weapons]);
        this.weaponsCache$ = null;
      })
    );
  }

  updateWeapon(weapon: Weapon): Observable<Weapon> {
    return this.http.put<Weapon>(`${this.apiUrl}/weapon`, weapon).pipe(
      tap(updatedWeapon => {
        this.updateArrayCollection(this.weapons, updatedWeapon, 'update', w => w.id);
        this.weaponsSubject.next([...this.weapons]);
        this.weaponsCache$ = null;
      })
    );
  }

  deleteWeapon(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/weapon/${id}`).pipe(
      tap(() => {
        this.updateArrayCollection(this.weapons, { id }, 'delete', w => w.id);
        this.weaponsSubject.next([...this.weapons]);
        this.weaponsCache$ = null;
      })
    );
  }

  createLocation(location: Partial<Location>): Observable<Location> {
    return this.http.post<Location>(`${this.apiUrl}/locations`, location).pipe(
      tap(newLocation => {
        this.locations.locations.push(newLocation);
        this.locationsSubject.next({ ...this.locations });
        this.locationsCache$ = null;
        this.allDataCache$ = null;
      })
    );
  }

  updateLocation(location: Location): Observable<Location> {
    return this.http.put<Location>(`${this.apiUrl}/locations`, location).pipe(
      tap(updatedLocation => {
        const index = this.locations.locations.findIndex(existingLocation => existingLocation.id === updatedLocation.id);
        if (index !== -1) {
          this.locations.locations[index] = updatedLocation;
        } else {
          this.locations.locations.push(updatedLocation);
        }
        this.locationsSubject.next({ ...this.locations });
        this.locationsCache$ = null;
        this.allDataCache$ = null;
      })
    );
  }

  deleteLocation(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/locations/${id}`).pipe(
      tap(() => {
        this.locations.locations = this.locations.locations.filter(location => location.id !== id);
        this.locationsSubject.next({ ...this.locations });
        this.locationsCache$ = null;
        this.allDataCache$ = null;
      })
    );
  }

  createLetter(letter: Letter): Observable<Letter> {
    return this.http.post<Letter>(`${this.apiUrl}/letter`, letter).pipe(
      tap(newLetter => {
        const normalized = this.normalizeLetter(newLetter);
        this.updateArrayCollection(this.letters, normalized, 'create', l => l.id);
        this.lettersSubject.next([...this.letters]);
        this.lettersCache$ = null;
        this.allDataCache$ = null;
      })
    );
  }

  updateLetter(letter: Letter): Observable<Letter> {
    return this.http.put<Letter>(`${this.apiUrl}/letter`, letter).pipe(
      tap(updatedLetter => {
        const normalized = this.normalizeLetter(updatedLetter);
        this.updateArrayCollection(this.letters, normalized, 'update', l => l.id);
        this.lettersSubject.next([...this.letters]);
        this.lettersCache$ = null;
        this.allDataCache$ = null;
      })
    );
  }

  deleteLetter(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/letter/${id}`).pipe(
      tap(() => {
        this.updateArrayCollection(this.letters, { id }, 'delete', l => l.id);
        this.lettersSubject.next([...this.letters]);
        this.lettersCache$ = null;
        this.allDataCache$ = null;
      })
    );
  }

  markLetterAsRead(letterId: number, playerId: number): Observable<Letter> {
    return this.http.post<Letter>(`${this.apiUrl}/letter/${letterId}/read`, { playerId }).pipe(
      tap(updatedLetter => {
        const normalized = this.normalizeLetter(updatedLetter);
        this.updateArrayCollection(this.letters, normalized, 'update', l => l.id);
        this.lettersSubject.next([...this.letters]);
        this.lettersCache$ = null;
        this.allDataCache$ = null;
      })
    );
  }

  private normalizeLetter(letter: Letter): Letter {
    return {
      ...letter,
      subject: letter.subject ?? '',
      readBy: Array.isArray(letter.readBy) ? letter.readBy : [],
      recipientIds: Array.isArray(letter.recipientIds) ? letter.recipientIds : [],
      targetNames: Array.isArray(letter.targetNames) ? letter.targetNames : [],
      senderId: letter.senderId ?? null,
      senderName: letter.senderName ?? null
    };
  }
}
