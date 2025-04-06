// alteredStates.ts
export interface AlteredState {
    id: number;
    name: string;
    effect: string;
  }

  export interface Inventory {
    id: number;
    quant: number;
  }

  export interface Character {
    id: number;
    name: string;
    items?: Inventory[];
    attributes: {
      Movement: number;
      Wounds: number;
      Save: number;
      APL: number;
      body: string[];
    };
    weapons: number[];
    abilities: {
      name: string;
      effect: string;
      prModifier?: number | null;
    }[];
    deployables?: {
      id: number;
      quant: number;
    }[];
  }
  
  // bestiary.ts
  export interface BestiaryEntry extends Character {
    faction: string;
    subgroup: string;
    pr: number;
    
  }
  
  // itemCategories.ts
  export interface ItemCategory {
    id: number;
    name: string;
    key: string;
    headers: string[];
    keys: string[];
  }
  
  // items.ts
  interface ArmorItem {
    id?: number;
    name?: string;
    price?: number;
    description?: string;
    raceReq?: string;
  }
  
  interface ConsumableItem {
    id?: number;
    name?: string;
    price?: number;
    description?: string;
  }
  
  interface AmmunitionItem {
    id?: number;
    name?: string;
    price?: number;
    quantity?: number;
    type?: string;
    description?: string;
  }
  
  interface MistEngineItem {
    id?: number;
    name?: string;
    price?: number;
    optimalConditions?: string;
    maxSpeed?: string;
    maxWeight?: number;
  }
  
  interface ShipHullItem {
    id?: number;
    name?: string;
    price?: number;
    weight?: number;
    shipWounds?: number;
    defense?: number;
    maxCargo?: number;
  }
  
  interface CannonItem {
    id?: number;
    name?: string;
    price?: number;
    ammoType?: string;
    weight?: number;
  }
  
  interface CannonballItem {
    id?: number;
    name?: string;
    price?: number;
    damage?: string;
  }
  
  interface DeployableItem {
    id?: number;
    name?: string;
    type?: string;
    description?: string;
    weapons?: number[];
    bestiaryId?: number;
  }
  
  export interface Items {
    armor: ArmorItem[];
    consumables: ConsumableItem[];
    ammunition: AmmunitionItem[];
    mistEngines: MistEngineItem[];
    shipHulls: ShipHullItem[];
    cannons: CannonItem[];
    cannonballs: CannonballItem[];
    deployables: DeployableItem[];
  }
  
  // lore.ts
  export interface Lore {
    planetOverview: {
      planet: {
        name: string;
        imgUrl: string;
        thumbnail: string;
        location: string;
        geography: string;
        theMist: string;
        mistTradeRoutes: {
          description: string;
          importance: string;
        };
      };
      currency: {
        name: string;
        appearance: string;
        value: string;
        usage: {
          physicalCoins: string;
          digitalTransactions: string;
        };
        culturalSignificance: string;
      };
      mistEffects: {
        densityLevels: {
          denserMist: string;
          lighterMist: string;
        };
        navigation: string;
        mistWeavingTechnology: {
          overview: string;
          howItWorks: {
            ritualsAndSacrifice: string;
            temporaryMistZones: {
              escape: string;
              ambush: string;
            };
            limitations: string;
          };
          limitationsAndRisks: {
            psychicStrain: string;
            culturalSecrecy: string;
          };
          culturalSignificance: string;
        };
      };
      technologyAndInfrastructure: {
        flyingShipsAndMistEngines: {
          description: string;
          mistEngines: {
            gildedAccordsRole: string;
            otherFactions: string;
          };
          optimizationCategories: {
            speed: string;
            endurance: string;
            cargoCapacity: string;
          };
        };
        weapons: {
          description: string;
          types: string[];
        };
      };
      dailyLife: {
        settlements: string;
        transportation: string;
      };
      factions: Array<{
        name: string;
        control: string;
        role: string;
        goals?: string[];
        challenges?: string | string[];
        mistKnowledge?: string;
        naming?: string;
        notableIslands?: Array<{
          name: string;
          description?: string;
          imgUrl?: string;
          thumbnail?: string;
        }>;
        // ... other faction-specific properties
      }>;
      struggleForNebryss: string[];
      storyHooks: Array<{
        name: string;
        premise: string;
        keyElements: string;
        potentialImpact: string;
      }>;
      mistBasedGameplayMechanics: Array<{
        name: string;
        description: string;
      }>;
      potentialEndgameScenarios: Array<{
        name: string;
        description: string;
      }>;
    };
  }
  
  // mistEffects.ts
  export interface MistEffect {
    effectName: string;
    densityLevel: string;
    description: string;
  }
  
  // npcs.ts
  export interface NPC {
    id: number;
    name: string;
    faction: string;
    subgroup: string;
    mission?: string;
    methods?: string;
    personality?: string;
    location?: string;
    bestiaryId?: number;
    role?: string;
    wargear?: Array<{
      name: string;
      description: string;
    }>;
    // ... other NPC-specific properties
  }
  
  // players.ts
  interface PlayerAttributes {
    Movement: number;
    Wounds: number;
    Save: number;
    APL: number;
    body: string[];
  }
  
  interface PlayerAbility {
    name: string;
    effect: string;
  }
  
  interface Progression {
    mistrals: {
      digital: number;
      physical: {
        "1s": number;
        "5s": number;
        "10s": number;
        "20s": number;
        "50s": number;
        "100s": number;
      };
    };
    talents?: string[];
  }

  export interface Inventory extends Item {
    quant: number;
  }
  
  export interface Player extends Character {
    race: string;
    origin: string;
    items: Inventory[]
    progression: Progression;
  }
  
  // shops.ts
  export interface ShopItem {
    id: number;
    price: number;
    type: string;
  }
  
  export interface Shop {
    id: number;
    name: string;
    owner: number;
    location: string;
    description?: string;
    categories?: number[];
    items: ShopItem[];
  }
  
  // talents.ts
  export interface Talent {
    id: string;
    name: string;
    cost: number;
    effect: string;
    prModifier?: number | null;
    requirements?: string[];
    maxStacks?: number;
    selectedCount?: number;
  }
  
  export interface TalentCategory {
    id: string;
    name: string;
    description: string;
    talents: Talent[];
  }
  
  // weaponRules.ts
  export interface WeaponRule {
    id: number;
    name: string;
    effect: string;
    prModifier: number | string | null;
  }
  
  // weapons.ts
  export interface Damage {
    min: number;
    max: number;
  }
  
  export interface SpecialRule {
    ruleId: number;
    modValue: number | string | null;
  }
  
  export interface WeaponProfile {
    profileName: string;
    rng: number | null;
    attacks: number;
    ws: number;
    damage: Damage;
    specialRules: SpecialRule[];
    body: string;
  }
  
  export interface Weapon {
    id: number;
    name: string;
    price: number;
    profiles: WeaponProfile[];
  }
  
  export interface ScrollSection {
    title: string;
    id: string;
  }

  export interface Item extends ArmorItem, AmmunitionItem, MistEngineItem, ShipHullItem, CannonItem, CannonballItem, DeployableItem {}