import { Player, Talent } from './model';

type ItemTalentSource = {
  talentId?: string | null;
} | null;

type ItemResolver = (itemId: number) => ItemTalentSource;
type TalentResolver = (talentId: string) => Talent | null;

function countTalentIds(talentIds: string[]): Map<string, number> {
  const counts = new Map<string, number>();

  talentIds.forEach(talentId => {
    counts.set(talentId, (counts.get(talentId) || 0) + 1);
  });

  return counts;
}

function getPurchasedTalentCounts(player: Player | null | undefined): Map<string, number> {
  return countTalentIds(player?.progression?.talents || []);
}

function getEquipmentTalentCounts(
  player: Player | null | undefined,
  getItemById: ItemResolver
): Map<string, number> {
  const equipmentTalentIds = (player?.progression?.equipment || [])
    .map(itemId => getItemById(itemId)?.talentId)
    .filter((talentId): talentId is string => !!talentId);

  return countTalentIds(equipmentTalentIds);
}

export function getEffectiveTalentStackCount(
  player: Player | null | undefined,
  talentId: string,
  getItemById: ItemResolver,
  getTalentById: TalentResolver
): number {
  const purchasedCount = getPurchasedTalentCounts(player).get(talentId) || 0;
  const equipmentCount = getEquipmentTalentCounts(player, getItemById).get(talentId) || 0;
  const totalCount = purchasedCount + equipmentCount;

  if (totalCount === 0) {
    return 0;
  }

  const talent = getTalentById(talentId);
  const maxStacks = talent?.maxStacks ?? 1;

  return Math.min(totalCount, maxStacks);
}

export function getEffectiveTalentApplications(
  player: Player | null | undefined,
  getItemById: ItemResolver,
  getTalentById: TalentResolver
): Talent[] {
  const purchasedCounts = getPurchasedTalentCounts(player);
  const equipmentCounts = getEquipmentTalentCounts(player, getItemById);
  const allTalentIds = new Set([
    ...Array.from(purchasedCounts.keys()),
    ...Array.from(equipmentCounts.keys())
  ]);

  const effectiveTalents: Talent[] = [];

  allTalentIds.forEach(talentId => {
    const talent = getTalentById(talentId);
    if (!talent) {
      return;
    }

    const appliedStacks = getEffectiveTalentStackCount(player, talentId, getItemById, getTalentById);
    for (let index = 0; index < appliedStacks; index += 1) {
      effectiveTalents.push(talent);
    }
  });

  return effectiveTalents;
}
