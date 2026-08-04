import { Component, ElementRef, OnDestroy, OnInit, Output, EventEmitter, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../data.service';
import { PlayerDetailComponent } from '../player-detail/player-detail.component';
import { HttpClientModule } from '@angular/common/http';
import { AlteredState, Items, Player, Weapon, WeaponRule } from '../model';
import { ActivePlayerService } from '../active-player.service';
import { Subject, takeUntil } from 'rxjs';
import { CustomDropdownComponent } from '../custom-dropdown/custom-dropdown.component';

@Component({
  selector: 'app-player-list',
  standalone: true,
  imports: [
    CommonModule,
    PlayerDetailComponent,
    HttpClientModule,
    CustomDropdownComponent
  ],
  templateUrl: './player-list.component.html',
  styleUrls: ['./player-list.component.css']
})
export class PlayerListComponent implements OnInit, OnDestroy {
  @ViewChild('playerDetailContainer') playerDetailContainer!: ElementRef;
  @Output() navigateToTalents = new EventEmitter<void>();
  players: Player[] = [];
  selectedPlayer: Player | null = null;
  weaponsData: Weapon[] = [];
  itemsData!: Items;
  weaponRulesData: WeaponRule[] = [];
  alteredStates: AlteredState[] = [];
  private destroy$ = new Subject<void>();

  constructor(
    private dataService: DataService,
    private activePlayerService: ActivePlayerService
  ) { }

  ngOnInit(): void {
    this.dataService.getAllData().subscribe(data => {
      this.players = data.players;
      this.weaponsData = data.weapons;
      this.itemsData = data.items;
      this.weaponRulesData = data.weaponRules;
      this.alteredStates = data.alteredStates;

      // Check if we have an active player and expand it
      const activePlayer = this.activePlayerService.activePlayer;
      if (activePlayer) {
        this.selectedPlayer = activePlayer;
        this.scrollToPlayer();
        
        // Override player data with active player if it exists in the players array
        this.updatePlayerFromActivePlayer();
      }
    });

    this.dataService.players$?.pipe(takeUntil(this.destroy$)).subscribe(players => {
      this.players = players || [];
      const active = this.activePlayerService.activePlayer;
      if (active && this.players.some(p => p.id === active.id)) {
        this.updatePlayerFromActivePlayer();
      } else {
        this.selectedPlayer = null;
      }
    });

    this.dataService.weapons$?.pipe(takeUntil(this.destroy$)).subscribe(weapons => {
      if (weapons) {
        this.weaponsData = [...weapons];
      }
    });

    this.dataService.items$?.pipe(takeUntil(this.destroy$)).subscribe(items => {
      if (items) {
        this.itemsData = { ...items };
      }
    });

    this.dataService.weaponRules$?.pipe(takeUntil(this.destroy$)).subscribe(rules => {
      if (rules) {
        this.weaponRulesData = [...rules];
      }
    });

    this.dataService.alteredStates$?.pipe(takeUntil(this.destroy$)).subscribe(states => {
      if (states) {
        this.alteredStates = [...states];
      }
    });

    // Subscribe to active player changes
    this.activePlayerService.activePlayer$
      .pipe(takeUntil(this.destroy$))
      .subscribe(player => {
        if (player) {
          this.selectedPlayer = player;
          
          // Override player data with active player data
          this.updatePlayerFromActivePlayer();
        } else {
          this.selectedPlayer = null;
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private updatePlayerFromActivePlayer(): void {
    const activePlayer = this.activePlayerService.activePlayer;
    if (activePlayer && this.players.length > 0) {
      const index = this.players.findIndex(p => p.id === activePlayer.id);
      if (index !== -1) {
        // Replace the player with the active player data
        this.players[index] = { ...activePlayer };
      }
    }
  }

  selectPlayer(player: Player | null): void {
    // If the same player is selected, do nothing or maybe just ensure it's expanded
    // In dropdown mode, selecting usually means "switch to this one"
    
    if (this.selectedPlayer?.id === player?.id) {
       // Optional: toggle off if clicking same one? 
       // For a dropdown, usually re-selecting doesn't deselect.
       // But let's stick to the active player service logic.
       return;
    }

    this.activePlayerService.setActivePlayer(player);
    if (player) {
      this.scrollToPlayer();
    }
  }

  scrollToPlayer(): void {
    setTimeout(() => {
      if (this.playerDetailContainer?.nativeElement) {
        this.playerDetailContainer.nativeElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start'
        });
      }
    }, 0);
  }
}