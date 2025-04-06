import { TestBed } from '@angular/core/testing';
import { ActivePlayerService } from './active-player.service';
import { Player } from './model';

describe('ActivePlayerService', () => {
  let service: ActivePlayerService;
  let mockPlayer: Player;

  beforeEach(() => {
    TestBed.configureTestingModule({});
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
        mistrals: {
          digital: 0,
          physical: {
            "1s": 0,
            "5s": 0,
            "10s": 0,
            "20s": 0,
            "50s": 0,
            "100s": 0
          }
        }
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
    const newService = TestBed.inject(ActivePlayerService);
    
    // Check player was loaded
    expect(newService.activePlayer).toEqual(mockPlayer);
  });
}); 