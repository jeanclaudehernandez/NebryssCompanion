import { Injectable } from '@angular/core';
import playersData from '../assets/players.json';
import weaponsData from '../assets/weapons.json';
import itemsData from '../assets/items.json';
import weaponRulesData from '../assets/weaponRules.json';
import bestiaryData from '../assets/bestiary.json';
import shopsData from '../assets/shops.json';
import itemCategoriesData from '../assets/itemCategories.json';
import npcsData from '../assets/npcs.json';
import loreData from '../assets/lore.json';
import talentsData from '../assets/talents.json';
import alteredStatesData from '../assets/alteredStates.json';
import { Observable, of } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private players: any[] = playersData;
  private weapons: any[] = weaponsData;
  private bestiary: any[] = bestiaryData;
  private weaponsRules: any[] = weaponRulesData;
  private items: any = itemsData;
  private shops: any[] = shopsData;
  private itemCategories: any[] = itemCategoriesData;
  private npcs: any[] = npcsData;
  private lore: any = loreData;
  private talents: any[] = talentsData;
  private alteredStates: any[] = alteredStatesData;

  constructor() { }

  getPlayers(): Observable<any[]> {
    return of(this.players);
  }

  getNpcs(): Observable<any[]> {
    return of(this.npcs);
  }

  getitemCategories(): Observable<any[]> {
    return of(this.itemCategories);
  }

  getBestiary(): Observable<any[]> {
    return of(this.bestiary);
  }

  getWeapons(): Observable<any[]> {
    return of(this.weapons);
  }

  getItems(): Observable<any> {
    return of(this.items);
  }

  getWeaponRules(): Observable<any[]> {
    return of(this.weaponsRules);
  }

  getShops(): Observable<any[]> {
    return of(this.shops);
  }

  getLore(): Observable<any> {
    return of(this.lore);
  }

  getTalents(): Observable<any[]> {
    return of(this.talents);
  }

  getAlteredStates(): Observable<any[]> {
    return of(this.alteredStates);
  }

  getAllData(): Observable<{
    players: any[],
    npcs: any[],
    weapons: any,
    items: any,
    weaponRules: any[],
    bestiary: any[],
    shops: any[],
    itemCategories: any[],
    alteredStates: any[]
  }> {
    return of({
      players: this.players,
      npcs: this.npcs,
      weapons: this.weapons,
      items: this.items,
      weaponRules: this.weaponsRules,
      bestiary: this.bestiary,
      shops: this.shops,
      itemCategories: this.itemCategories,
      alteredStates: this.alteredStates
    });
  }

  getWeaponById(id: number): any {
    return this.weapons.find(w => w.id === id) || null;
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