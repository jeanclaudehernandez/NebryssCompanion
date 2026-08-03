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
      items: {
        items: [
          { id: 10, name: 'Chainmail', type: 'armor', raceReq: 'human', description: 'Heavy armor' },
          { id: 11, name: 'Bolt Rounds', type: 'ammo', subtype: 'rifle', description: 'Standard rounds' }
        ]
      },
      weaponRules: [],
      bestiary: [],
      shops: [],
      itemCategories: [
        { id: 1, name: 'Armor', key: 'armor', headers: ['Name', 'Body', 'Description'], keys: ['name', 'raceReq', 'description'] },
        { id: 2, name: 'Ammo', key: 'ammo', headers: ['Name', 'Type', 'Description'], keys: ['name', 'subtype', 'description'] }
      ],
      alteredStates: [],
      mistEffects: [],
      terrains: [],
      talents: [],
      afflictions: [],
      locations: { locations: [] } as any,
      letters: [] as any
    }));
    mockDataService.getPlayers.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [ItemsComponent],
      providers: [
        { provide: DataService, useValue: mockDataService }
      ]
    }).compileComponents();

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

  it('should keep only matching categories visible during search and show result counts in labels', () => {
    component.searchQuery = 'sword';
    component.onSearchChange();

    expect(component.visibleTabs.map(tab => component.getTabLabel(tab))).toEqual(['Melee Weapons(1)']);
    expect(component.activeTab).toBe('weapon-melee');
  });

  it('should switch to the first visible search category when current tab has no results', () => {
    component.setTab('weapon-ranged');
    component.searchQuery = 'chain';
    component.onSearchChange();

    expect(component.visibleTabs.map(tab => tab.key)).toEqual(['armor']);
    expect(component.activeTab).toBe('armor');
  });
});
