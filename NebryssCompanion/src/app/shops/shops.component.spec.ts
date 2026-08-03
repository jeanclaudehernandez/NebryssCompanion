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
});
