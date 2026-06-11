import { Item, Weapon } from './model';

export type AdminEditorSession =
  | { mode: 'item'; item: Item }
  | { mode: 'weapon'; weapon: Weapon };
