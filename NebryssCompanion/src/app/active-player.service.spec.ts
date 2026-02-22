import { TestBed } from '@angular/core/testing';
import { ActivePlayerService } from './active-player.service';
import { Player } from './model';
import { DataService } from './data.service';
import { of } from 'rxjs';

describe('ActivePlayerService', () => {
  let service: ActivePlayerService;
  let mockPlayer: Player;
  let dataServiceSpy: jasmine.SpyObj<DataService>;

  beforeEach(() => {
    dataServiceSpy = jasmine.createSpyObj('DataService', ['savePlayer', 'getPlayers']);
    dataServiceSpy.savePlayer.and.returnValue(of(null as any));
    dataServiceSpy.getPlayers.and.returnValue(of([]));

    TestBed.configureTestingModule({
      providers: [
        { provide: DataService, useValue: dataServiceSpy }
      ]
    });
    service = TestBed.inject(ActivePlayerService);

    // Mock player for testing
    mockPlayer = {
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
        talents: []
      }
    };

    // Clear localStorage before each test
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should set active player and save to localStorage', () => {
    service.setActivePlayer(mockPlayer);
    
    // Check active player is set
    expect(service.activePlayer).toEqual(mockPlayer);
    
    // Check localStorage
    const storedPlayer = JSON.parse(localStorage.getItem('activePlayer') || '');
    expect(storedPlayer).toEqual(mockPlayer);
  });

  it('should clear active player and remove from localStorage', () => {
    // First set a player
    service.setActivePlayer(mockPlayer);
    
    // Then clear it
    service.clearActivePlayer();
    
    // Check active player is null
    expect(service.activePlayer).toBeNull();
    
    // Check localStorage is empty
    expect(localStorage.getItem('activePlayer')).toBeNull();
  });

  it('should load player from localStorage on init', () => {
    // Manually set player in localStorage
    localStorage.setItem('activePlayer', JSON.stringify(mockPlayer));
    
    // Create new instance of service which should load from localStorage
    const newService = new ActivePlayerService(dataServiceSpy);
    
    // Check player was loaded
    expect(newService.activePlayer).toEqual(mockPlayer);
  });
}); 
