import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../data.service';
import { PlayerDetailComponent } from '../player-detail/player-detail.component';
import { HttpClientModule } from '@angular/common/http';
import { AlteredState, Items, Player, Weapon, WeaponRule } from '../model';

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
export class PlayerListComponent implements OnInit {
  @ViewChild('playerDetailContainer') playerDetailContainer!: ElementRef;
  players: Player[] = [];
  weaponsData: Weapon[] = [];
  itemsData!: Items;
  weaponRulesData: WeaponRule[] = [];
  alteredStates: AlteredState[] = [];
  selectedPlayer: Player | null = null;

  constructor(private dataService: DataService) { }

  ngOnInit(): void {
    this.dataService.getAllData().subscribe(data => {
      this.players = data.players;
      this.weaponsData = data.weapons;
      this.itemsData = data.items;
      this.weaponRulesData = data.weaponRules;

      const savedPlayerId = localStorage.getItem('selectedPlayerId');
      if (savedPlayerId) {
        const playerId = JSON.parse(savedPlayerId);
        this.selectedPlayer = this.players.find(p => p.id === playerId) || null;
        if(this.selectedPlayer) {
          this.scrollToPlayer();
        }
      }
    });
  }

  selectPlayer(player: Player): void {
    this.selectedPlayer = player;
    localStorage.setItem('selectedPlayerId', JSON.stringify(player.id));
    this.scrollToPlayer();
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