import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { TalentsComponent } from './talents.component';
import { DataService } from '../data.service';
import { ActivePlayerService } from '../active-player.service';
import { Player, Talent } from '../model';

describe('TalentsComponent', () => {
  let component: TalentsComponent;
  let fixture: ComponentFixture<TalentsComponent>;
  let mockDataService: jasmine.SpyObj<DataService>;
  let mockActivePlayerService: jasmine.SpyObj<ActivePlayerService>;

  beforeEach(async () => {
    const player: Player = {
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
        talentPoints: 3,
        mistrals: { digital: 0, physical: 0 },
        talents: [],
        afflictions: [],
        equipment: [101]
      }
    };

    mockDataService = jasmine.createSpyObj('DataService', [
      'getTalents',
      'getItems',
      'getItemById',
      'getTalentById'
    ]);
    mockActivePlayerService = jasmine.createSpyObj('ActivePlayerService', ['updateActivePlayer'], {
      activePlayer$: of(player)
    });

    mockDataService.getTalents.and.returnValue(of([]));
    mockDataService.getItems.and.returnValue(of({ items: [] } as any));
    mockDataService.getItemById.and.callFake((itemId: number) =>
      itemId === 101 ? ({ id: 101, name: 'Verdant Hex-Torque', talentId: 't1' } as any) : null
    );

    await TestBed.configureTestingModule({
      imports: [TalentsComponent],
      providers: [
        { provide: DataService, useValue: mockDataService },
        { provide: ActivePlayerService, useValue: mockActivePlayerService },
        { provide: MatDialog, useValue: jasmine.createSpyObj('MatDialog', ['open']) }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TalentsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('allows acquiring a talent even when equipment already grants it', () => {
    const talent: Talent = {
      id: 't1',
      name: 'Adept Magician',
      cost: 1,
      effect: 'Improve psychic hit by 1',
      requirements: [],
      maxStacks: 1
    };

    mockDataService.getTalentById.and.returnValue(talent);

    component.toggleTalent(talent);

    expect(component.activePlayer?.progression.talents).toEqual(['t1']);
    expect(component.activePlayer?.progression.talentPoints).toBe(2);
    expect(mockActivePlayerService.updateActivePlayer).toHaveBeenCalled();
  });

  it('calculates invested talent points per category from selected talents', () => {
    component.activePlayer = {
      ...component.activePlayer!,
      progression: {
        ...component.activePlayer!.progression,
        talents: ['t1', 't1', 't2']
      }
    };

    const category = {
      id: 'arcane',
      name: 'Arcane',
      description: '',
      talents: [
        {
          id: 't1',
          name: 'Adept Magician',
          cost: 2,
          effect: 'Improve psychic hit by 1'
        },
        {
          id: 't2',
          name: 'Warp Sight',
          cost: 1,
          effect: 'Ignore cover penalties'
        }
      ]
    };

    expect(component.getInvestedPointsForCategory(category)).toBe(5);
  });

  it('prevents removing a talent that is required by another selected talent', () => {
    const baseTalent: Talent = {
      id: 't1',
      name: 'Adept Magician',
      cost: 1,
      effect: 'Improve psychic hit by 1'
    };
    const dependentTalent: Talent = {
      id: 't2',
      name: 'Warp Savant',
      cost: 2,
      effect: 'Advanced casting',
      requirements: ['t1']
    };

    component.talentCategories = [
      {
        id: 'arcane',
        name: 'Arcane',
        description: '',
        talents: [baseTalent, dependentTalent]
      }
    ];
    component.activePlayer = {
      ...component.activePlayer!,
      progression: {
        ...component.activePlayer!.progression,
        talentPoints: 0,
        talents: ['t1', 't2']
      }
    };
    mockActivePlayerService.updateActivePlayer.calls.reset();

    expect(component.canRemoveTalent(baseTalent)).toBeFalse();

    component.toggleTalent(baseTalent);

    expect(component.activePlayer.progression.talents).toEqual(['t1', 't2']);
    expect(mockActivePlayerService.updateActivePlayer).not.toHaveBeenCalled();
  });

  it('allows removing extra stacks while keeping one required prerequisite stack', () => {
    const stackTalent: Talent = {
      id: 't1',
      name: 'Adept Magician',
      cost: 1,
      effect: 'Improve psychic hit by 1',
      maxStacks: 3
    };
    const dependentTalent: Talent = {
      id: 't2',
      name: 'Warp Savant',
      cost: 2,
      effect: 'Advanced casting',
      requirements: ['t1']
    };

    component.talentCategories = [
      {
        id: 'arcane',
        name: 'Arcane',
        description: '',
        talents: [stackTalent, dependentTalent]
      }
    ];
    component.activePlayer = {
      ...component.activePlayer!,
      progression: {
        ...component.activePlayer!.progression,
        talentPoints: 0,
        talents: ['t1', 't1', 't2']
      }
    };

    expect(component.canRemoveTalent(stackTalent)).toBeTrue();

    component.decrementTalent(stackTalent, new Event('click'));

    expect(component.activePlayer.progression.talents).toEqual(['t1', 't2']);
    expect(component.canRemoveTalent(stackTalent)).toBeFalse();
  });
});
