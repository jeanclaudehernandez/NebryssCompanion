// alteredStates.ts
export interface Campaign {
  id: number;
  name: string;
  prefix: string;
}

export interface CampaignSession {
  id?: number;
  _id?: string;
  campaignId: number;
  sessionId: number;
  content: string;
  conclussion: string;
  playerVisibleBranches?: string[];
}

export interface AlteredState {
  id: number;
  name: string;
  effect: string;
}

export interface Inventory {
  id: number;
  quant: number;
}

export interface CartItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
  type: 'item' | 'weapon';
}

export interface Ship {
  id: string;
  name: string;
  type: string;
}

export interface SecretBlock {
  id?: string;
  title?: string;
  content: string;
  isRevealed?: boolean;
}

// locations.ts
export interface Location {
  id: number;
  name: string;
  description: string;
  rpgMapLayout?: string;
  privateNotes?: string;
  secrets?: SecretBlock[];
  isSecret?: boolean;
  isSecretRevealed?: boolean;
  discovered?: boolean;
  imgUrl?: string;
  thumbnail?: string;
  faction: string;
  category?: string;
  categorySize?: string | number;
  isCapital: boolean;
  // Marks the location whose image is used as the background of the interactive World Map.
  isWorldMap?: boolean;
  // Position (percentage, 0-100) of this location's pin on the World Map image.
  mapX?: number;
  mapY?: number;
  notableFeatures?: Array<{
    name: string;
    description: string;
    owner?: string;
  }>;
  shops?: Array<{
    name: string;
    description: string;
    owner?: string;
    imgUrl?: string;
    thumbnail?: string;
  }>;
}

export interface Locations {
  locations: Location[];
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
  isDiscovered?: boolean;
  discoveredCampaignIds?: number[];
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
interface BaseItem {
  id?: number;
  name?: string;
  price?: number;
  description?: string;
  type?: string;
  raceReq?: string;
  quantity?: number;
  subtype?: string;
  optimalConditions?: string;
  maxSpeed?: string;
  maxWeight?: number;
  weight?: number;
  shipWounds?: number;
  defense?: number;
  maxCargo?: number;
  ammoType?: string;
  damage?: string;
  weapons?: number[];
  bestiaryId?: number;
  part?: string;
  attachedTo?: number;
  blueprintFor?: number;
  isEquippable?: boolean;
  buildMaterials?: {
    id: number;
    amount: number;
  }[];
  talentId?: string;
  statModifications?: StatModification[];
}

export interface Items {
  items: BaseItem[];
}

// lore.ts
export interface Lore {
  world: {
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
    privateNotes?: string;
    isSecretRevealed?: boolean;
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
    peopleIdentity?: string;
    naming?: string;
    image?: string;
    thumbnail?: string;
    privateNotes?: string;
    isSecretRevealed?: boolean;
    notableIslands?: Array<{
      name: string;
      description?: string;
      imgUrl?: string;
      thumbnail?: string;
    }>;
    notableOrganizations?: Array<{
      name: string;
      description: string;
    }>;
  }>;
  chroniclesOfNebryss?: Array<{
    era: string;
    summary: string;
    privateNotes?: string;
    isSecretRevealed?: boolean;
  }>;
  struggleForNebryss: string[];
  storyHooks: Array<{
    name: string;
    premise: string;
    keyElements: string;
    potentialImpact: string;
    privateNotes?: string;
    isSecretRevealed?: boolean;
  }>;
  mistBasedGameplayMechanics: Array<{
    name: string;
    description: string;
  }>;
  potentialEndgameScenarios: Array<{
    name: string;
    description: string;
    privateNotes?: string;
    isSecretRevealed?: boolean;
  }>;
}

// mistEffects.ts
export interface MistEffect {
  id?: number | string;
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
  reputation?: string;
  backstory?: string;
  description?: string;
  imgUrl?: string;
  thumbnail?: string;
  fleetSize?: string;
  flagship?: string;
  tactics?: string;
  motivations?: string;
  discovered?: boolean;
  wargear?: Array<{
    name: string;
    description: string;
  }>;
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
  talentPoints: number;
  mistrals: {
    digital: number;
    physical: number;
  };
  talents: string[];
  afflictions: Affliction[];
  equipment: number[];
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
  locationId?: number;
  location: string;
  locationName: string;
  description?: string;
  discovered?: boolean;
  categories?: number[];
  items: ShopItem[];
  imgUrl?: string;
  thumbnail?: string;
  paymentMethod: {
    digital: boolean;
    physical: boolean;
  }
}

export interface CartItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
  type: 'item' | 'weapon';
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
  statModifications?: StatModification[];
}

export interface Affliction {
  id: string;
  name: string;
  treatment: string;
  progress: number;
  toHeal: number;
  effect: string;
  statModifications?: StatModification[];
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
  type?: string;
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
  contextName?: string;
}

export interface Item extends BaseItem { }

export interface Terrain {
  id: number;
  name: string;
  description: string;
  imageUrl: string;
  thumbnailUrl: string;
}

export interface StatModification {
  stat: keyof PlayerAttributes | "hit" | "damage" | "attacks" | "crit";
  mod: number;
  applyTo?: string;
  applyToValue?: string;
  applyToType?: "body" | "type" | "range";
}

export interface Letter {
  id: number;
  subject?: string | null;
  senderId: number | null;
  senderName: string | null;
  message: string;
  date: string;
  readBy: number[];
  recipientIds: number[];
  targetNames: string[];
}
