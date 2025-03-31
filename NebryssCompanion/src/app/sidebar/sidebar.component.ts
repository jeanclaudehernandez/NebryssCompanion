import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent {
  @Output() viewChange = new EventEmitter<'players' | 'bestiary' | 'items'>();
  isOpen = false;

  toggleMenu() {
    this.isOpen = !this.isOpen;
  }

  showPlayers() {
    this.viewChange.emit('players');
    this.isOpen = false;
  }

  showBestiary() {
    this.viewChange.emit('bestiary');
    this.isOpen = false;
  }

  showItems() {
    this.viewChange.emit('items');
    this.isOpen = false;
  }
}