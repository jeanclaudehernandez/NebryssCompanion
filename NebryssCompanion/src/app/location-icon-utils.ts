export function getLocationIconFamily(category?: string): string {
  const normalizedCategory = (category ?? '').trim().toLowerCase();

  if (!normalizedCategory) {
    return 'city';
  }

  const iconMappings: Array<{ terms: string[]; family: string }> = [
    { terms: ['capital', 'city', 'metropolis', 'urban'], family: 'city' },
    { terms: ['village', 'town', 'settlement', 'hamlet', 'outpost'], family: 'village' },
    { terms: ['fortress', 'citadel', 'stronghold', 'bastion', 'keep', 'castle', 'garrison', 'military'], family: 'fortress' },
    { terms: ['port', 'harbor', 'harbour', 'dock', 'shipyard', 'anchorage'], family: 'harbor' },
    { terms: ['industrial', 'factory', 'forge', 'workshop', 'mine'], family: 'industrial-zone' },
    { terms: ['mystical', 'arcane', 'mist', 'ritual', 'temple'], family: 'mystical-site' },
    { terms: ['shrine', 'cathedral', 'church', 'sanctum'], family: 'shrine' },
    { terms: ['forest', 'grove', 'woods', 'jungle'], family: 'forest' },
    { terms: ['mountain', 'peak', 'cliff', 'highland'], family: 'mountain' },
    { terms: ['ruin', 'ancient'], family: 'ruins' },
    { terms: ['swamp', 'marsh', 'bog'], family: 'swamp' },
    { terms: ['volcanic', 'ember', 'ash', 'lava', 'fire'], family: 'volcanic-area' },
    { terms: ['wasteland', 'desert', 'barren'], family: 'wasteland' }
  ];

  const match = iconMappings.find(mapping =>
    mapping.terms.some(term => normalizedCategory.includes(term))
  );

  return match?.family ?? 'city';
}

export function getLocationIconVariantFolder(family: string): string | null {
  if (family === 'mystical-site' || family === 'wasteland') {
    return 'variant-1';
  }

  return null;
}

export function getLocationIconSize(categorySize?: string | number | null): string {
  if (typeof categorySize === 'number') {
    if (categorySize <= 1) return 'small';
    if (categorySize >= 4) return 'immense';
    if (categorySize >= 3) return 'big';
    return 'medium';
  }

  const normalizedSize = String(categorySize ?? '').trim().toLowerCase();
  const parsedNumericSize = Number(normalizedSize);

  if (normalizedSize && !Number.isNaN(parsedNumericSize)) {
    if (parsedNumericSize <= 1) return 'small';
    if (parsedNumericSize >= 4) return 'immense';
    if (parsedNumericSize >= 3) return 'big';
    return 'medium';
  }

  if (normalizedSize.includes('small') || normalizedSize.includes('tiny')) return 'small';
  if (normalizedSize.includes('big') || normalizedSize.includes('large')) return 'big';
  if (normalizedSize.includes('immense') || normalizedSize.includes('huge') || normalizedSize.includes('giant')) return 'immense';

  return 'medium';
}

export function getLocationIconSrc(category?: string, categorySize?: string | number | null): string {
  const family = getLocationIconFamily(category);
  const size = getLocationIconSize(categorySize);
  const variantFolder = getLocationIconVariantFolder(family);

  return variantFolder
    ? `assets/icons/extracted/${family}/${variantFolder}/${family}-${size}.png`
    : `assets/icons/extracted/${family}/${family}-${size}.png`;
}
