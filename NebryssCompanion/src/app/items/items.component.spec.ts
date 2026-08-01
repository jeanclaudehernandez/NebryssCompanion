import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ItemsComponent } from './items.component';
import { DataService } from '../data.service';

describe('ItemsComponent', () => {
  let component: ItemsComponent;
  let fixture: ComponentFixture<ItemsComponent>;
  let mockDataService: jasmine.SpyObj<DataService>;

  beforeEach(async () => {
    mockDataService = jasmine.createSpyObj('DataService', ['getAllData', 'getPlayers']);
    mockDataService.getAllData.and.returnValue(of({
      players: [],
      npcs: [],
      weapons: [
        {
          id: 1,
          name: 'Sword',
          price: 10,
          profiles: [{ profileName: '', rng: 0, attacks: 4, ws: 3, damage: { min: 3, max: 4 }, specialRules: [], body: 'human' }]
        },
        {
          id: 2,
          name: 'Rifle',
          price: 15,
          profiles: [{ profileName: '', rng: 8, attacks: 4, ws: 4, damage: { min: 3, max: 4 }, specialRules: [], body: 'human' }]
        }
      ],
      items: { items: [] },
      weaponRules: [],
      bestiary: [],
      shops: [],
      itemCategories: [],
      alteredStates: [],
      mistEffects: [],
      terrains: [],
      talents: [],
      afflictions: []
    }));
    mockDataService.getPlayers.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [ItemsComponent],
      providers: [
        { provide: DataService, useValue: mockDataService }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ItemsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should separate melee and ranged weapon ids', () => {
    expect(component.filteredMeleeWeaponIds).toEqual([1]);
    expect(component.filteredRangedWeaponIds).toEqual([2]);
  });
});
