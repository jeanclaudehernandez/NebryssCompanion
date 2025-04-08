import { Injectable } from '@angular/core';
import playersData from '../assets/players.json';
import weaponsData from '../assets/weapons.json';
import itemsData from '../assets/items.json';
import weaponRulesData from '../assets/weaponRules.json';
import imperiumBestiary from '../assets/bestiaryFiles/ImperiumBestiary.json';
import abyssalCabalBestiary from '../assets/bestiaryFiles/AbyssalCabalBestiary.json';
import forcesOfNatureBestiary from '../assets/bestiaryFiles/ForcesofnatureBestiary.json';
import nebryssianBestiary from '../assets/bestiaryFiles/NebryssianLiberationRepublicBestiary.json';
import shopsData from '../assets/shops.json';
import itemCategoriesData from '../assets/itemCategories.json';
import npcsData from '../assets/npcs.json';
import loreData from '../assets/lore.json';
import locationsData from '../assets/locations.json';
import talentsData from '../assets/talents.json';
import alteredStatesData from '../assets/alteredStates.json';
import mistEffectsData from '../assets/mistEffects.json';
import { Observable, of, ReplaySubject, shareReplay } from 'rxjs';
import { Player, Weapon, BestiaryEntry, WeaponRule, Items, Shop, ItemCategory, NPC, TalentCategory, AlteredState, Lore, MistEffect, Locations } from './model';

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private players: Player[] = playersData;
  private weapons: Weapon[] = weaponsData;
  private bestiary: BestiaryEntry[] = [
    ...imperiumBestiary,
    ...abyssalCabalBestiary,
    ...forcesOfNatureBestiary,
    ...nebryssianBestiary
  ];
  private weaponsRules: WeaponRule[] = weaponRulesData;
  private items: Items = itemsData;
  private shops: Shop[] = shopsData;
  private itemCategories: ItemCategory[] = itemCategoriesData;
  private npcs: NPC[] = npcsData;
  private talents: TalentCategory[] = talentsData;
  private alteredStates: AlteredState[] = alteredStatesData;
  private lore: Lore = loreData;
  private locations: Locations = locationsData;
  private mistEffects = mistEffectsData.mistEffects;

  // Cache observables
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
  private mistEffectsCache$: Observable<any[]> | null = null;
  private allDataCache$: Observable<any> | null = null;

  constructor() { }

  getPlayers(): Observable<Player[]> {
    if (!this.playersCache$) {
      this.playersCache$ = of(this.players).pipe(shareReplay(1));
    }
    return this.playersCache$;
  }

  getNpcs(): Observable<NPC[]> {
    if (!this.npcsCache$) {
      this.npcsCache$ = of(this.npcs).pipe(shareReplay(1));
    }
    return this.npcsCache$;
  }

  getitemCategories(): Observable<ItemCategory[]> {
    return of(this.itemCategories);
  }

  getBestiary(): Observable<BestiaryEntry[]> {
    if (!this.bestiaryCache$) {
      this.bestiaryCache$ = of(this.bestiary).pipe(shareReplay(1));
    }
    return this.bestiaryCache$;
  }

  getWeapons(): Observable<Weapon[]> {
    if (!this.weaponsCache$) {
      this.weaponsCache$ = of(this.weapons).pipe(shareReplay(1));
    }
    return this.weaponsCache$;
  }

  getItems(): Observable<Items> {
    if (!this.itemsCache$) {
      this.itemsCache$ = of(this.items).pipe(shareReplay(1));
    }
    return this.itemsCache$;
  }

  getWeaponRules(): Observable<WeaponRule[]> {
    if (!this.weaponRulesCache$) {
      this.weaponRulesCache$ = of(this.weaponsRules).pipe(shareReplay(1));
    }
    return this.weaponRulesCache$;
  }

  getShops(): Observable<Shop[]> {
    if (!this.shopsCache$) {
      this.shopsCache$ = of(this.shops).pipe(shareReplay(1));
    }
    return this.shopsCache$;
  }

  getLore(): Observable<Lore> {
    if (!this.loreCache$) {
      this.loreCache$ = of(this.lore).pipe(shareReplay(1));
    }
    return this.loreCache$;
  }

  getLocations(): Observable<Locations> {
    if (!this.locationsCache$) {
      this.locationsCache$ = of(this.locations).pipe(shareReplay(1));
    }
    return this.locationsCache$;
  }

  getTalents(): Observable<TalentCategory[]> {
    if (!this.talentsCache$) {
      this.talentsCache$ = of(this.talents).pipe(shareReplay(1));
    }
    return this.talentsCache$;
  }

  getAlteredStates(): Observable<AlteredState[]> {
    if (!this.alteredStatesCache$) {
      this.alteredStatesCache$ = of(this.alteredStates).pipe(shareReplay(1));
    }
    return this.alteredStatesCache$;
  }

  getMistEffects(): Observable<any[]> {
    if (!this.mistEffectsCache$) {
      this.mistEffectsCache$ = of(this.mistEffects).pipe(shareReplay(1));
    }
    return this.mistEffectsCache$;
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
    mistEffects: any[]
  }> {
    if (!this.allDataCache$) {
      this.allDataCache$ = of({
        players: this.players,
        npcs: this.npcs,
        weapons: this.weapons,
        items: this.items,
        weaponRules: this.weaponsRules,
        bestiary: this.bestiary,
        shops: this.shops,
        itemCategories: this.itemCategories,
        alteredStates: this.alteredStates,
        mistEffects: this.mistEffects
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
}