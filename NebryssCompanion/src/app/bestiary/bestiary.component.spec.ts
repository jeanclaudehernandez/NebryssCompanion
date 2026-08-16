import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { BestiaryComponent } from './bestiary.component';
import { DataService } from '../data.service';

describe('BestiaryComponent', () => {
  let component: BestiaryComponent;
  let fixture: ComponentFixture<BestiaryComponent>;
  let mockDataService: jasmine.SpyObj<DataService>;

  beforeEach(async () => {
    mockDataService = jasmine.createSpyObj('DataService', ['getAllData', 'validateBestiaryPR', 'getLore']);
    mockDataService.getLore.and.returnValue(of({ factions: [] } as any));
    mockDataService.getAllData.and.returnValue(of({
      bestiary: [],
      items: { items: [] },
      weapons: [],
      weaponRules: [],
      alteredStates: [],
      players: [],
      npcs: [],
      shops: [],
      itemCategories: [],
      mistEffects: [],
      terrains: [],
      talents: [],
      afflictions: [],
      locations: { locations: [] } as any,
      letters: [] as any
    }));
    mockDataService.validateBestiaryPR.and.returnValue([]);

    await TestBed.configureTestingModule({
      imports: [BestiaryComponent],
      providers: [
        { provide: DataService, useValue: mockDataService }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BestiaryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
