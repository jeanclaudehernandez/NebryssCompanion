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
  @Output() viewChange = new EventEmitter<'players' | 'bestiary' | 'items' | 'shops' | 'lore'>();
  isOpen = false;

  toggleMenu() {
    this.isOpen = !this.isOpen;
  }

  changeView(view: 'players' | 'bestiary' | 'items' | 'shops' | 'lore') {
    this.viewChange.emit(view);
    this.toggleMenu();
  }
}