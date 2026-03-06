import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../data.service';
import { GenericTableComponent } from '../generic-table/generic-table.component';
import { Affliction } from '../model';
import { ActivePlayerService } from '../active-player.service';
import { ToastService } from '../toast.service';

@Component({
  selector: 'app-afflictions-list',
  standalone: true,
  imports: [CommonModule, GenericTableComponent],
  templateUrl: './afflictions-list.component.html',
  styleUrls: ['./afflictions-list.component.css']
})
export class AfflictionsListComponent implements OnInit {
  afflictions: Affliction[] = [];
  headers = ['Name', 'Effect', 'Treatment', 'To Heal'];
  headerKeys = ['name', 'effect', 'treatment', 'toHeal'];

  constructor(
    private dataService: DataService,
    private activePlayerService: ActivePlayerService,
    private toastService: ToastService
  ) {}

  ngOnInit() {
    this.dataService.getAfflictions().subscribe(data => {
      this.afflictions = data;
    });
  }

  onAddAffliction(affliction: Affliction) {
    const player = this.activePlayerService.activePlayer;
    if (!player) {
      this.toastService.show('No active player selected', 'error');
      return;
    }

    if (!player.progression) {
        // Should not happen based on model, but safe check
        this.toastService.show('Player progression data missing', 'error');
        return;
    }

    if (!player.progression.afflictions) {
      player.progression.afflictions = [];
    }
    
    // Add new affliction with progress 0
    const newAffliction: Affliction = { ...affliction, progress: 0 };
    
    player.progression.afflictions.push(newAffliction);
    
    this.activePlayerService.updateActivePlayer(player);
    this.toastService.show(`Added ${affliction.name} to ${player.name}`, 'success');
  }
}
