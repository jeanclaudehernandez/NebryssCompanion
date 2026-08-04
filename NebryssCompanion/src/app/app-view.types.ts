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
  'npcs',
  'adminItemCreator',
  'adminLocationCreator',
  'adminPlayerEditor',
  'adminNpcEditor',
  'adminShopEditor',
  'adminCreatureEditor',
  'adminCampaignEditor'
] as const;

export type AppView = typeof APP_VIEWS[number];
