import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ShopsComponent } from './shops.component';
import { DataService } from '../data.service';

describe('ShopsComponent', () => {
  let component: ShopsComponent;
  let fixture: ComponentFixture<ShopsComponent>;
  let mockDataService: jasmine.SpyObj<DataService>;

  beforeEach(async () => {
    mockDataService = jasmine.createSpyObj('DataService', [
      'getAllData',
      'getNpcByd',
      'getShopWeapons',
      'getShopItems',
      'getItemById'
    ]);

    mockDataService.getAllData.and.returnValue(of({
      items: { items: [] },
      weapons: [],
      weaponRules: [],
      shops: [],
      itemCategories: [],
      players: [],
      npcs: [],
      bestiary: [],
      alteredStates: [],
      mistEffects: [],
      terrains: [],
      talents: [],
      afflictions: [],
      locations: { locations: [] } as any,
      letters: [] as any
    }));

    mockDataService.getNpcByd.and.returnValue({ name: '' });
    mockDataService.getShopWeapons.and.returnValue([]);
    mockDataService.getShopItems.and.returnValue([]);
    mockDataService.getItemById.and.returnValue(null);

    await TestBed.configureTestingModule({
      imports: [ShopsComponent],
      providers: [
        { provide: DataService, useValue: mockDataService }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ShopsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should process categoriesData from items even if shop.categories is undefined', () => {
    component.itemsCategories = [
      { id: 2, name: 'Consumables', key: 'consumable', headers: ['Name', 'Price', 'Description'], keys: ['name', 'price', 'description'] }
    ];
    component.locations = [
      { id: 1, name: 'Zephyria', isCapital: false, faction: 'All' } as any
    ];
    component.shops = [
      {
        id: 1,
        name: "Herbwhisper's Apothecary",
        owner: 6,
        locationId: 1,
        locationName: 'Zephyria',
        location: "Zephyria's Sky Bazaar",
        discovered: true,
        items: [{ id: 16, price: 5, type: 'item' }],
        paymentMethod: { digital: false, physical: true }
      }
    ];

    mockDataService.getShopItems.and.returnValue([{ id: 16, price: 5, type: 'item' }]);
    mockDataService.getItemById.and.returnValue({ id: 16, name: 'Mist Compass', price: 5, description: 'Compass', type: 'consumable' });

    component.processShops();

    expect(component.processedShopGroups.length).toBeGreaterThan(0);
    const shop = component.processedShopGroups[0].shops[0];
    expect(shop.categoriesData.length).toBe(1);
    expect(shop.categoriesData[0].category.name).toBe('Consumables');
    expect(shop.categoriesData[0].items.length).toBe(1);
    expect(shop.categoriesData[0].items[0].name).toBe('Mist Compass');
  });
});
