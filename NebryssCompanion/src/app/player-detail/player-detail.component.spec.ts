import { ComponentFixture, TestBed } from '@angular/core/testing';

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
      'getTalentById'
    ]);

    mockDataService.getBestiaryById.and.returnValue(null);
    mockDataService.getTalentById.and.returnValue(null);

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
          physical: {
            "1s": 0,
            "5s": 0,
            "10s": 0,
            "20s": 0,
            "50s": 0,
            "100s": 0
          }
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
});
