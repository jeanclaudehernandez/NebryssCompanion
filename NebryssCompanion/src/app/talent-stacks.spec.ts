import { Player, Talent } from './model';
import { getEffectiveTalentApplications, getEffectiveTalentStackCount } from './talent-stacks';

describe('talent-stacks', () => {
  const createPlayer = (): Player => ({
    id: 1,
    name: 'Test Player',
    race: 'Human',
    origin: 'Nebryss',
    weapons: [],
    items: [],
    attributes: {
      Movement: 6,
      Wounds: 12,
      Save: 4,
      APL: 2,
      body: []
    },
    abilities: [],
    progression: {
      talentPoints: 0,
      mistrals: { digital: 0, physical: 0 },
      talents: [],
      afflictions: [],
      equipment: []
    }
  });

  it('caps equipment-granted and purchased stacks at maxStacks', () => {
    const player = createPlayer();
    player.progression.talents = ['t1'];
    player.progression.equipment = [100];

    const itemMap = new Map<number, { talentId?: string }>([
      [100, { talentId: 't1' }]
    ]);
    const talentMap = new Map<string, Talent>([
      ['t1', {
        id: 't1',
        name: 'Shielded Advance',
        cost: 1,
        effect: 'Movement +1',
        maxStacks: 1
      }]
    ]);

    expect(
      getEffectiveTalentStackCount(
        player,
        't1',
        itemId => itemMap.get(itemId) || null,
        talentId => talentMap.get(talentId) || null
      )
    ).toBe(1);

    expect(
      getEffectiveTalentApplications(
        player,
        itemId => itemMap.get(itemId) || null,
        talentId => talentMap.get(talentId) || null
      ).length
    ).toBe(1);
  });

  it('adds equipment-granted stacks when the talent allows multiple stacks', () => {
    const player = createPlayer();
    player.progression.talents = ['t2'];
    player.progression.equipment = [200];

    const itemMap = new Map<number, { talentId?: string }>([
      [200, { talentId: 't2' }]
    ]);
    const talentMap = new Map<string, Talent>([
      ['t2', {
        id: 't2',
        name: 'Relentless Fire',
        cost: 1,
        effect: 'Damage +1',
        maxStacks: 2
      }]
    ]);

    expect(
      getEffectiveTalentStackCount(
        player,
        't2',
        itemId => itemMap.get(itemId) || null,
        talentId => talentMap.get(talentId) || null
      )
    ).toBe(2);

    expect(
      getEffectiveTalentApplications(
        player,
        itemId => itemMap.get(itemId) || null,
        talentId => talentMap.get(talentId) || null
      ).length
    ).toBe(2);
  });
});
