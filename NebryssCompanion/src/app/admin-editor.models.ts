import { Item, NPC, Shop, Weapon } from './model';

export type AdminEditorSession =
  | { mode: 'item'; item: Item }
  | { mode: 'weapon'; weapon: Weapon }
  | { mode: 'npc'; npc: NPC }
  | { mode: 'shop'; shop: Shop };

