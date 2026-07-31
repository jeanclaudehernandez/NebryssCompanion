import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PlayerDetailComponent } from './player-detail.component';
import { DataService } from '../data.service';
import { ActivePlayerService } from '../active-player.service';
import { ToastService } from '../toast.service';
import { ModalService } from '../modal.service';
import { Player, StatModification } from '../model';
import { MatDialog } from '@angular/material/dialog';
import { Component, Input } from '@angular/core';
import { WeaponTableComponent } from '../weapon-table/weapon-table.component';
import { GenericTableComponent } from '../generic-table/generic-table.component';
import { AfflictionsDisplayComponent } from '../afflictions-display/afflictions-display.component';

@Component({
  selector: 'app-weapon-table',
  standalone: true,
  template: ''
})
class MockWeaponTableComponent {
  @Input() weaponIds: any;
  @Input() weaponsData: any;
  @Input() weaponRulesData: any;
  @Input() isCharacterDisplayPage: any;
  @Input() characterBody: any;
  @Input() alteredStates: any;
  @Input() inventoryManagement: any;
}

@Component({
  selector: 'app-generic-table',
  standalone: true,
  template: ''
})
class MockGenericTableComponent {
  @Input() storageKey: any;
  @Input() data: any;
  @Input() headers: any;
  @Input() headerKeys: any;
  @Input() renderHtml: any;
  @Input() inventoryManagement: any;
  @Input() isPlayerDetail: any;
  @Input() collapsible: any;
  @Input() enableEquipping: any;
  @Input() enableUnequipping: any;
}

@Component({
  selector: 'app-afflictions-display',
  standalone: true,
  template: ''
})
class MockAfflictionsDisplayComponent {
  @Input() player: any;
  @Input() isEditable: any;
}

describe('PlayerDetailComponent', () => {
  let component: PlayerDetailComponent;
  let fixture: ComponentFixture<PlayerDetailComponent>;
  let mockDataService: jasmine.SpyObj<DataService>;
  let mockActivePlayerService: jasmine.SpyObj<ActivePlayerService>;
  let mockToastService: jasmine.SpyObj<ToastService>;
  let mockModalService: jasmine.SpyObj<ModalService>;

  beforeEach(async () => {
    mockDataService = jasmine.createSpyObj('DataService', [
      'getBestiaryById',
      'getTalentById',
      'getPlayers'
    ]);
    mockActivePlayerService = jasmine.createSpyObj('ActivePlayerService', ['updateActivePlayer']);
    mockToastService = jasmine.createSpyObj('ToastService', ['show']);
    mockModalService = jasmine.createSpyObj('ModalService', ['openFromTemplate', 'close']);

    mockDataService.getBestiaryById.and.returnValue(null);
    mockDataService.getTalentById.and.returnValue(null);
    mockDataService.getPlayers.and.returnValue(of([]));
    // Set activePlayer property on the spy object
    Object.defineProperty(mockActivePlayerService, 'activePlayer', { get: () => component.character as Player, configurable: true });
    (mockActivePlayerService as any).activePlayer$ = of(null);

    await TestBed.configureTestingModule({
      imports: [PlayerDetailComponent, MockWeaponTableComponent, MockGenericTableComponent, MockAfflictionsDisplayComponent],
      providers: [
        { provide: DataService, useValue: mockDataService },
        { provide: ActivePlayerService, useValue: mockActivePlayerService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ModalService, useValue: mockModalService },
        { provide: MatDialog, useValue: {} }
      ]
    })
    .overrideComponent(PlayerDetailComponent, {
      remove: { imports: [WeaponTableComponent, GenericTableComponent, AfflictionsDisplayComponent] },
      add: { imports: [MockWeaponTableComponent, MockGenericTableComponent, MockAfflictionsDisplayComponent] }
    })
    .compileComponents();


    fixture = TestBed.createComponent(PlayerDetailComponent);
    component = fixture.componentInstance;


    const mockPlayer: Player = {
      id: 1,
      name: 'Test Player',
      race: 'Human',
      origin: 'Nebryss',
      weapons: [],
      items: [],
      attributes: {
        Movement: 6,
        Wounds: 12,
        Save: 4,
        APL: 2,
        body: []
      },
      abilities: [],
      progression: {
        talentPoints: 0,
        mistrals: {
          digital: 0,
          physical: 0
        },
        talents: [],
        afflictions: [],
        equipment: []
      }
    };

    component.character = mockPlayer;
    component.weaponsData = [];
    component.weaponRulesData = [];
    component.alteredStates = [];
    component.itemsData = { items: [] };

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should calculate attributes correctly with modifiers', () => {
    const mockItem = {
      id: 100,
      name: 'Stat Booster Item',
      statModifications: [{ stat: 'Wounds', mod: 5 }, { stat: 'Save', mod: 1 }] as StatModification[]
    };
    
    component.itemsData = { items: [mockItem] };
    
    const mockTalent = {
      id: 't1',
      name: 'Stat Booster Talent',
      statModifications: [{ stat: 'Movement', mod: 1 }] as StatModification[]
    };
    mockDataService.getTalentById.and.returnValue(mockTalent as any);
    
    const player = component.character as Player;
    player.progression = {
      talentPoints: 0,
      mistrals: { digital: 0, physical: 0 },
      equipment: [100],
      talents: ['t1'],
      afflictions: [{
        id: 'a1',
        name: 'Stat Reducer Affliction',
        treatment: '',
        progress: 0,
        toHeal: 0,
        effect: '',
        statModifications: [{ stat: 'APL', mod: -1 }] as StatModification[]
      }]
    };
    
    component.ngOnChanges();
    
    expect(component.calculatedAttributes.Wounds).toBe(17);
    expect(component.calculatedAttributes.Movement).toBe(7);
    expect(component.calculatedAttributes.APL).toBe(1);
    expect(component.calculatedAttributes.Save).toBe(3); // 4 + (1 * -1) = 3
  });

  it('should handle mistral subtraction', () => {
    const player = component.character as Player;
    player.progression.mistrals.digital = 100;
    
    // Ensure activePlayer matches character for permission checks
    Object.defineProperty(mockActivePlayerService, 'activePlayer', { get: () => player });

    component.mistralDialogTemplate = {} as any; // Mock template

    component.openMistralModal('digital');
    component.mistralModalInput = '50';
    component.applyMistralChange('subtract');

    expect(player.progression.mistrals.digital).toBe(50); // 100 - 50
    expect(mockActivePlayerService.updateActivePlayer).toHaveBeenCalled();
    expect(mockToastService.show).toHaveBeenCalledWith('Removed 50 digital mistrals', 'success');
  });

  it('should not apply an equipment talent beyond the talent max stack', () => {
    component.itemsData = {
      items: [
        { id: 101, name: 'Talent Armor', talentId: 't1' }
      ] as any
    };

    mockDataService.getTalentById.and.callFake((talentId: string) => {
      if (talentId !== 't1') {
        return null;
      }

      return {
        id: 't1',
        name: 'Fleet Footed',
        cost: 1,
        effect: 'Movement +1',
        maxStacks: 1,
        statModifications: [{ stat: 'Movement', mod: 1 }] as StatModification[]
      };
    });

    const player = component.character as Player;
    player.progression.talents = ['t1'];
    player.progression.equipment = [101];

    component.ngOnChanges();

    expect(component.calculatedAttributes.Movement).toBe(7);
  });

  it('should show equipment and acquired tags for talents in the talents table', () => {
    component.itemsData = {
      items: [
        { id: 101, name: 'Verdant Hex-Torque', talentId: 't1' }
      ] as any
    };

    mockDataService.getTalentById.and.callFake((talentId: string) => {
      if (talentId !== 't1') {
        return null;
      }

      return {
        id: 't1',
        name: 'Adept Magician',
        cost: 1,
        effect: 'Improve psychic hit by 1',
        maxStacks: 1
      };
    });

    const player = component.character as Player;
    player.progression.talents = ['t1'];
    player.progression.equipment = [101];

    component.ngOnChanges();

    expect(component.talentTableData.length).toBe(1);
    expect(component.talentTableData[0].name).toContain('Adept Magician');
    expect(component.talentTableData[0].name).toContain('🛡 Verdant Hex-Torque');
    expect(component.talentTableData[0].name).toContain('🏋 acquired');
  });
});
