// Accent color per faction, used for the pin badge border/glow on the world map.
export const FACTION_COLORS: Record<string, string> = {
  'The Imperium of Man': '#1e40af',
  'Imperium of Man': '#1e40af',
  'The Gilded Accord': '#d4af37',
  'Gilded Accord': '#d4af37',
  'The Abyssal Cabal': '#c62828',
  'Abyssal Cabal': '#c62828',
  'The Nebryssian Liberation Republic': '#43a047',
  'Nebryssian Liberation Republic': '#43a047',
  'The Crimson Corsairs': '#e64a19',
  'Crimson Corsairs': '#e64a19',
  'Planet': '#9e9e9e',
  'The Planet': '#9e9e9e',
};

export const DEFAULT_FACTION_COLOR = '#64b5f6';

export function getFactionColor(faction?: string): string {
  if (!faction || !faction.trim()) {
    return '#9e9e9e';
  }
  const trimmed = faction.trim();
  if (FACTION_COLORS[trimmed]) {
    return FACTION_COLORS[trimmed];
  }
  const lower = trimmed.toLowerCase();
  for (const [key, color] of Object.entries(FACTION_COLORS)) {
    if (key.toLowerCase() === lower) {
      return color;
    }
  }
  return DEFAULT_FACTION_COLOR;
}

