import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { PlayerListComponent } from './player-list.component';
import { DataService } from '../data.service';

describe('PlayerListComponent', () => {
  let component: PlayerListComponent;
  let fixture: ComponentFixture<PlayerListComponent>;
  let mockDataService: jasmine.SpyObj<DataService>;

  beforeEach(async () => {
    mockDataService = jasmine.createSpyObj('DataService', ['getAllData']);
    mockDataService.getAllData.and.returnValue(of({
      players: [],
      weapons: [],
      items: { items: [] },
      weaponRules: [],
      npcs: [],
      bestiary: [],
      shops: [],
      itemCategories: [],
      alteredStates: [],
      mistEffects: [],
      terrains: [],
      talents: [],
      afflictions: [],
      locations: { locations: [] } as any,
      letters: [] as any
    }));

    await TestBed.configureTestingModule({
      imports: [PlayerListComponent],
      providers: [
        { provide: DataService, useValue: mockDataService }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PlayerListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
