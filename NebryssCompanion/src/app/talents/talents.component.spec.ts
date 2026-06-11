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
});
