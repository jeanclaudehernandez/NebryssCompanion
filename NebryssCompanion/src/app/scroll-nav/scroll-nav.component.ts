import { NgFor } from '@angular/common';
import { Component, Input, Output, EventEmitter, HostListener } from '@angular/core';
import { ScrollSection } from '../model';

@Component({
  selector: 'app-scroll-nav',
  standalone: true,
  imports: [NgFor],
  templateUrl: './scroll-nav.component.html',
  styleUrls: ['./scroll-nav.component.css']
})
export class ScrollNavComponent {
  @Input() sections: ScrollSection[] = [];
  @Output() sectionSelected = new EventEmitter<string>();
  isOpen = false;

  toggleMenu() {
    this.isOpen = !this.isOpen;
  }

  scrollToSection(sectionId: string) {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
      this.sectionSelected.emit(sectionId);
    }
    this.isOpen = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.scroll-nav-btn') && !target.closest('.dropdown-menu')) {
      this.isOpen = false;
    }
  }
}