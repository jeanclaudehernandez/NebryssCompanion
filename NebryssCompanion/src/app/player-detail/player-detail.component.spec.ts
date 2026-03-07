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

    // Open modal in subtract mode
    component.openMistralModal('digital', 'subtract');
    expect(component.mistralModalMode).toBe('subtract');
    
    // Simulate setting amount and confirming
    component.mistralModalAmount = 50;
    // We need to call the confirm method. Since it's private, we access it via any or check the side effects if we could trigger it otherwise.
    // The confirm callback is created in openMistralModal.
    // But for testing the logic inside confirmMistralAddition, we can call it if we cast to any.
    (component as any).confirmMistralAddition();

    expect(player.progression.mistrals.digital).toBe(50); // 100 - 50
    expect(mockActivePlayerService.updateActivePlayer).toHaveBeenCalled();
    expect(mockToastService.show).toHaveBeenCalledWith('Removed 50 digital mistrals', 'success');
  });
});
