import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WeaponTableComponent } from './weapon-table.component';
import { DataService } from '../data.service';
import { ActivePlayerService } from '../active-player.service';
import { ToastService } from '../toast.service';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';

describe('WeaponTableComponent', () => {
  let component: WeaponTableComponent;
  let fixture: ComponentFixture<WeaponTableComponent>;
  let mockDataService: jasmine.SpyObj<DataService>;
  let mockActivePlayerService: jasmine.SpyObj<ActivePlayerService>;
  let mockToastService: jasmine.SpyObj<ToastService>;

  beforeEach(async () => {
    mockDataService = jasmine.createSpyObj('DataService', ['getTalents', 'getAfflictions', 'getItemById', 'getItems', 'getTalentById']);
    mockActivePlayerService = jasmine.createSpyObj('ActivePlayerService', [], { activePlayer$: of(null), activePlayer: null });
    mockToastService = jasmine.createSpyObj('ToastService', ['show']);

    mockDataService.getTalents.and.returnValue(of([]));
    mockDataService.getAfflictions.and.returnValue(of([]));
    mockDataService.getItems.and.returnValue(of({ items: [] } as any));
    mockDataService.getTalentById.and.returnValue(null);

    await TestBed.configureTestingModule({
      imports: [WeaponTableComponent],
      providers: [
        { provide: DataService, useValue: mockDataService },
        { provide: ActivePlayerService, useValue: mockActivePlayerService },
        { provide: ToastService, useValue: mockToastService },
        { provide: MatDialog, useValue: {} }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WeaponTableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should apply crit stat modification correctly', () => {
    // Setup mock data
    const mockWeapon = {
      id: 1,
      name: 'Test Weapon',
      profiles: [{
        profileName: 'Test Profile',
        rng: 0,
        attacks: 4,
        ws: 3,
        damage: { min: 4, max: 5 },
        specialRules: [],
        body: 'universal',
        type: 'sword'
      }]
    };

    const mockTalent = {
      id: 'test_talent',
      name: 'Test Talent',
      description: 'Test Description',
      talents: [{
        id: 't1',
        name: 'Crit Boost',
        cost: 1,
        effect: 'Boosts crit',
        statModifications: [{
          stat: 'crit',
          mod: 1,
          applyToType: 'range',
          applyToValue: '0'
        }]
      }]
    };

    const mockPlayer = {
      id: 1,
      progression: {
        talents: ['t1'],
        afflictions: []
      },
      weapons: [1]
    };

    // Set mocks
    component.weaponIds = [1];
    component.weaponsData = [mockWeapon] as any;
    component.talentsData = [mockTalent] as any;
    mockDataService.getTalentById.and.callFake((id: string) => id === 't1' ? mockTalent.talents[0] as any : null);
    
    // Override active player
    Object.defineProperty(mockActivePlayerService, 'activePlayer', { get: () => mockPlayer });

    // Trigger update
    (component as any).updateSortedProfiles();

    // Check result
    expect(component.sortedProfiles.length).toBeGreaterThan(0);
    const profile = component.sortedProfiles[0].profile;
    expect(profile.damage.max).toBe(6); // 5 + 1
    expect(profile.damage.min).toBe(4); // Unchanged
  });
});
