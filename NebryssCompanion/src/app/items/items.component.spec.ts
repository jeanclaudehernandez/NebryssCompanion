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
    mockDataService.getAllData.and.returnValue(of({
      players: [],
      npcs: [],
      weapons: [],
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
    mockDataService.getItems.and.returnValue(of({ items: [] } as any));
    mockDataService.getTalents.and.returnValue(of([]));
    mockDataService.getAfflictions.and.returnValue(of([]));
    mockDataService.getItemById.and.returnValue(null);

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
});
