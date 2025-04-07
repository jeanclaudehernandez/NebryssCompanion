import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, ViewChild, ElementRef, HostListener } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent {
  @ViewChild('sidebar') sidebarElement!: ElementRef;
  @ViewChild('burger') burgerElement!: ElementRef;
  @Output() viewChange = new EventEmitter<'players' | 'bestiary' | 'items' | 'shops' | 'lore' | 'talents' | 'mistEffects'>();
  isOpen = false;

  constructor(private matDialog: MatDialog) {}

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.isOpen && !this.isClickInside(event)) {
      this.isOpen = false;
    }
    this.matDialog.openDialogs.forEach((dialog) => {
      if(!dialog.disableClose) {
        dialog.close();
      }
    });
  }

  private isClickInside(event: MouseEvent): boolean {
    const clickedInsideSidebar = this.sidebarElement?.nativeElement.contains(event.target as Node);
    const clickedInsideBurger = this.burgerElement?.nativeElement.contains(event.target as Node);
    return clickedInsideSidebar || clickedInsideBurger;
  }

  toggleMenu() {
    this.isOpen = !this.isOpen;
  }

  changeView(view: 'players' | 'bestiary' | 'items' | 'shops' | 'lore' | 'talents' | 'mistEffects') {
    this.viewChange.emit(view);
    this.toggleMenu();
  }
}