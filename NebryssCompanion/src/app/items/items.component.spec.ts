import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ItemsComponent } from './items.component';
import { DataService } from '../data.service';

describe('ItemsComponent', () => {
  let component: ItemsComponent;
  let fixture: ComponentFixture<ItemsComponent>;
  let mockDataService: jasmine.SpyObj<DataService>;

  beforeEach(async () => {
    mockDataService = jasmine.createSpyObj('DataService', ['getAllData', 'getPlayers', 'getItems', 'getTalents', 'getAfflictions', 'getItemById']);
    const mockWeapons = [
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
    ];
    const mockItems = {
      items: [
        { id: 10, name: 'Chainmail', type: 'armor', raceReq: 'human', description: 'Heavy armor' },
        { id: 11, name: 'Bolt Rounds', type: 'ammo', subtype: 'rifle', description: 'Standard rounds' }
      ]
    };
    const mockCategories = [
      { id: 1, name: 'Armor', key: 'armor', headers: ['Name', 'Body', 'Description'], keys: ['name', 'raceReq', 'description'] },
      { id: 2, name: 'Ammo', key: 'ammo', headers: ['Name', 'Type', 'Description'], keys: ['name', 'subtype', 'description'] }
    ];

    mockDataService.getAllData.and.returnValue(of({
      players: [],
      npcs: [],
      weapons: mockWeapons,
      items: mockItems,
      weaponRules: [],
      bestiary: [],
      shops: [],
      itemCategories: mockCategories,
      alteredStates: [],
      mistEffects: [],
      terrains: [],
      talents: [],
      afflictions: [],
      locations: { locations: [] } as any,
      letters: [] as any
    }));
    (mockDataService as any).items$ = of(mockItems);
    (mockDataService as any).weapons$ = of(mockWeapons);
    (mockDataService as any).itemCategories$ = of(mockCategories);
    mockDataService.getPlayers.and.returnValue(of([]));
    mockDataService.getItems.and.returnValue(of({ items: [] } as any));
    mockDataService.getTalents.and.returnValue(of([]));
    mockDataService.getAfflictions.and.returnValue(of([]));
    mockDataService.getItemById.and.returnValue(null);

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
