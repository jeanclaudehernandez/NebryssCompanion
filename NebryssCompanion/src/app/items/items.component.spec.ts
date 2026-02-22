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
      weapons: [],
      items: { items: [] },
      weaponRules: [],
      bestiary: [],
      shops: [],
      itemCategories: [],
      alteredStates: [],
      mistEffects: [],
      terrains: []
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
});
