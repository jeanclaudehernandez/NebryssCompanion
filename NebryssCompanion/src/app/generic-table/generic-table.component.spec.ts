import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { GenericTableComponent } from './generic-table.component';
import { ActivePlayerService } from '../active-player.service';
import { ToastService } from '../toast.service';
import { Player } from '../model';

describe('GenericTableComponent', () => {
  let component: GenericTableComponent;
  let fixture: ComponentFixture<GenericTableComponent>;
  let activePlayerService: ActivePlayerService;
  let toastService: ToastService;

  const mockPlayer: Player = {
    id: 1,
    name: 'Test Operative',
    attributes: {
      Movement: 6,
      Wounds: 10,
      Save: 4,
      APL: 2,
      body: ['human']
    },
    weapons: [],
    abilities: [],
    items: [
      { id: 10, quant: 2 },
      { id: 20, quant: 1 }
    ],
    deployables: [
      { id: 30, quant: 1 }
    ]
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, GenericTableComponent],
      providers: [ActivePlayerService, ToastService]
    })
    .compileComponents();

    activePlayerService = TestBed.inject(ActivePlayerService);
    toastService = TestBed.inject(ToastService);
    spyOn(activePlayerService, 'updateActivePlayer').and.callFake((p: Player) => {
      spyOnProperty(activePlayerService, 'activePlayer', 'get').and.returnValue(p);
    });

    fixture = TestBed.createComponent(GenericTableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should decrement quantity when item quantity is greater than 1', () => {
    const player: Player = JSON.parse(JSON.stringify(mockPlayer));
    spyOnProperty(activePlayerService, 'activePlayer', 'get').and.returnValue(player);

    component.removeFromInventory({ id: 10, name: 'Medkit' });

    const item = player.items?.find(i => i.id === 10);
    expect(item).toBeDefined();
    expect(item?.quant).toBe(1);
    expect(activePlayerService.updateActivePlayer).toHaveBeenCalled();
  });

  it('should remove item completely from inventory when quantity reaches 0', () => {
    const player: Player = JSON.parse(JSON.stringify(mockPlayer));
    spyOnProperty(activePlayerService, 'activePlayer', 'get').and.returnValue(player);

    component.removeFromInventory({ id: 20, name: 'Frag Grenade' });

    const item = player.items?.find(i => i.id === 20);
    expect(item).toBeUndefined();
    expect(player.items?.length).toBe(1);
    expect(activePlayerService.updateActivePlayer).toHaveBeenCalled();
  });

  it('should remove deployable completely when quantity reaches 0', () => {
    const player: Player = JSON.parse(JSON.stringify(mockPlayer));
    player.items = [{ id: 30, quant: 1 }];
    spyOnProperty(activePlayerService, 'activePlayer', 'get').and.returnValue(player);

    component.removeFromInventory({ id: 30, name: 'Autogun Turret', type: 'deployable' });

    expect(player.items?.find(i => i.id === 30)).toBeUndefined();
    expect(player.deployables?.find(d => d.id === 30)).toBeUndefined();
    expect(activePlayerService.updateActivePlayer).toHaveBeenCalled();
  });
});

