import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { PlayerListComponent } from './player-list/player-list.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, HttpClientModule, PlayerListComponent],
  template: `
    <app-player-list></app-player-list>
  `,
  styles: []
})
export class AppComponent {
  title = 'mistborn-kill-team';
}