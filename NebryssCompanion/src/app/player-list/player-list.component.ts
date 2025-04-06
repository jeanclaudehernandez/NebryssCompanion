import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../data.service';
import { PlayerDetailComponent } from '../player-detail/player-detail.component';
import { HttpClientModule } from '@angular/common/http';
import { AlteredState, Items, Player, Weapon, WeaponRule } from '../model';
import { ActivePlayerService } from '../active-player.service';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-player-list',
  standalone: true,
  imports: [
    CommonModule,
    PlayerDetailComponent,
    HttpClientModule
  ],
  templateUrl: './player-list.component.html',
  styleUrls: ['./player-list.component.css']
})
export class PlayerListComponent implements OnInit, OnDestroy {
  @ViewChild('playerDetailContainer') playerDetailContainer!: ElementRef;
  players: Player[] = [];
  weaponsData: Weapon[] = [];
  itemsData!: Items;
  weaponRulesData: WeaponRule[] = [];
  alteredStates: AlteredState[] = [];
  expandedPlayers: Set<number> = new Set();
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

      // Check if we have an active player and expand it
      const activePlayer = this.activePlayerService.activePlayer;
      if (activePlayer) {
        this.expandedPlayers.add(activePlayer.id);
        this.scrollToPlayer();
      }
    });

    // Subscribe to active player changes
    this.activePlayerService.activePlayer$
      .pipe(takeUntil(this.destroy$))
      .subscribe(player => {
        if (player) {
          // Collapse all players
          this.expandedPlayers.clear();
          // Expand only the active player
          this.expandedPlayers.add(player.id);
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  selectPlayer(player: Player): void {
    const isExpanded = this.expandedPlayers.has(player.id);
    
    if (isExpanded) {
      // If already expanded, just remove from expanded set
      this.expandedPlayers.delete(player.id);
      // If this was the active player, clear it
      if (this.activePlayerService.activePlayer?.id === player.id) {
        this.activePlayerService.clearActivePlayer();
      }
    } else {
      // Set as active player (this will trigger the subscription that collapses others)
      this.activePlayerService.setActivePlayer(player);
      this.scrollToPlayer();
    }
  }

  isPlayerExpanded(player: Player): boolean {
    return this.expandedPlayers.has(player.id);
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