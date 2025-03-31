import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../data.service';
import { PlayerDetailComponent } from '../player-detail/player-detail.component';
import { HttpClientModule } from '@angular/common/http';

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
  players: any[] = [];
  weaponsData: any;
  itemsData: any;
  weaponRulesData: any[] = [];
  selectedPlayer: any = null;

  constructor(private dataService: DataService) { }

  ngOnInit(): void {
    this.dataService.getAllData().subscribe(data => {
      this.players = data.players;
      this.weaponsData = data.weapons;
      this.itemsData = data.items;
      this.weaponRulesData = data.weaponRules;
      console.log(this.players);
    });
  }

  selectPlayer(player: any): void {
    this.selectedPlayer = player;
  }
}