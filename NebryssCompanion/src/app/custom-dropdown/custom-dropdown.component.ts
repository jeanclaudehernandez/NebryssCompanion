import { Component, EventEmitter, Input, Output, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Player } from '../model';

@Component({
  selector: 'app-custom-dropdown',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './custom-dropdown.component.html',
  styleUrls: ['./custom-dropdown.component.css']
})
export class CustomDropdownComponent {
  @Input() options: any[] = [];
  @Input() selectedOption: any | null = null;
  @Input() placeholder: string = 'Select a player...';
  @Input() showClearOption: boolean = false;
  @Input() type: 'player' | 'simple' = 'player';
  @Output() selectionChange = new EventEmitter<any | null>();

  isOpen = false;

  constructor(private elementRef: ElementRef) {}

  toggleDropdown() {
    this.isOpen = !this.isOpen;
  }

  selectOption(option: any | null) {
    this.selectedOption = option;
    this.selectionChange.emit(option);
    this.isOpen = false;
  }

  private closeIfClickedOutside(target: EventTarget | null) {
    if (!this.elementRef.nativeElement.contains(target)) {
      this.isOpen = false;
    }
  }

  @HostListener('document:click', ['$event'])
  onClick(event: MouseEvent) {
    this.closeIfClickedOutside(event.target);
  }

  @HostListener('document:touchstart', ['$event'])
  onTouchStart(event: TouchEvent) {
    this.closeIfClickedOutside(event.target);
  }
}
