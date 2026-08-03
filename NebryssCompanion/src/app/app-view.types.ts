export const APP_VIEWS = [
  'players',
  'bestiary',
  'letters',
  'items',
  'shops',
  'lore',
  'locations',
  'worldMap',
  'talents',
  'mistEffects',
  'terrains',
  'mistEngineBattles',
  'weaponRules',
  'alteredStates',
  'afflictions',
  'shipNavigation',
  'adminItemCreator',
  'adminLocationCreator',
  'adminPlayerEditor',
  'adminNpcEditor',
  'adminShopEditor'
] as const;

export type AppView = typeof APP_VIEWS[number];
