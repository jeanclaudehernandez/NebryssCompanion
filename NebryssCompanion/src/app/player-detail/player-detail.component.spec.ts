import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PlayerDetailComponent } from './player-detail.component';
import { DataService } from '../data.service';
import { Player } from '../model';

describe('PlayerDetailComponent', () => {
  let component: PlayerDetailComponent;
  let fixture: ComponentFixture<PlayerDetailComponent>;
  let mockDataService: jasmine.SpyObj<DataService>;

  beforeEach(async () => {
    mockDataService = jasmine.createSpyObj('DataService', [
      'getBestiaryById',
      'getTalentById',
      'getPlayers'
    ]);

    mockDataService.getBestiaryById.and.returnValue(null);
    mockDataService.getTalentById.and.returnValue(null);
    mockDataService.getPlayers.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [PlayerDetailComponent],
      providers: [
        { provide: DataService, useValue: mockDataService }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PlayerDetailComponent);
    component = fixture.componentInstance;

    const mockPlayer: Player = {
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
        mistrals: {
          digital: 0,
          physical: 0
        },
        talents: []
      }
    };

    component.character = mockPlayer;
    component.weaponsData = [];
    component.weaponRulesData = [];
    component.alteredStates = [];
    component.itemsData = { items: [] };

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should calculate attributes correctly with modifiers', () => {
    const mockItem = {
      id: 100,
      name: 'Stat Booster Item',
      statModifications: [{ stat: 'Wounds', mod: 5 }, { stat: 'Save', mod: 1 }]
    };
    
    component.itemsData = { items: [mockItem] };
    
    const mockTalent = {
      id: 't1',
      name: 'Stat Booster Talent',
      statModifications: [{ stat: 'Movement', mod: 1 }]
    };
    mockDataService.getTalentById.and.returnValue(mockTalent as any);
    
    const player = component.character as Player;
    player.progression = {
      talentPoints: 0,
      mistrals: { digital: 0, physical: 0 },
      equipment: [100],
      talents: ['t1'],
      afflictions: [{
        id: 'a1',
        name: 'Stat Reducer Affliction',
        treatment: '',
        progress: 0,
        toHeal: 0,
        effect: '',
        statModifications: [{ stat: 'APL', mod: -1 }]
      }]
    };
    
    component.ngOnChanges();
    
    expect(component.calculatedAttributes.Wounds).toBe(17);
    expect(component.calculatedAttributes.Movement).toBe(7);
    expect(component.calculatedAttributes.APL).toBe(1);
    expect(component.calculatedAttributes.Save).toBe(3); // 4 + (1 * -1) = 3
  });
});
