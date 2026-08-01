import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, Input, OnDestroy } from '@angular/core';

export type BodyTypeKey =
  | 'universal'
  | 'human'
  | 'astartes'
  | 'spell'
  | 'fellgor'
  | 'ork'
  | 'aetherwing'
  | 'plant';

@Component({
  selector: 'app-body-type-icon',
  standalone: true,
  imports: [CommonModule],
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      position: relative;
    }

    .body-icon-trigger {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: 0;
      padding: 0;
      margin: 0;
      cursor: pointer;
      font: inherit;
    }

    .body-icon-trigger:focus-visible {
      outline: 2px solid rgba(25, 118, 210, 0.65);
      outline-offset: 2px;
      border-radius: 999px;
    }

    .body-icon-tooltip {
      position: absolute;
      left: 50%;
      bottom: calc(100% + 8px);
      transform: translateX(-50%);
      z-index: 20;
      padding: 4px 8px;
      border-radius: 999px;
      background: rgba(27, 42, 51, 0.96);
      color: #ffffff;
      font-size: 0.72rem;
      font-weight: 600;
      line-height: 1.2;
      white-space: nowrap;
      pointer-events: none;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.24);
    }

    .body-icon-tooltip::after {
      content: '';
      position: absolute;
      left: 50%;
      top: 100%;
      transform: translateX(-50%);
      border-width: 5px 5px 0 5px;
      border-style: solid;
      border-color: rgba(27, 42, 51, 0.96) transparent transparent transparent;
    }

    :host-context(body.dark-theme) .body-icon-tooltip {
      background: rgba(223, 235, 242, 0.96);
      color: #1b2a33;
    }

    :host-context(body.dark-theme) .body-icon-tooltip::after {
      border-color: rgba(223, 235, 242, 0.96) transparent transparent transparent;
    }
  `],
  template: `
    <button
      type="button"
      class="body-icon-trigger"
      (click)="toggleTooltip($event)"
      [attr.aria-label]="label"
      [attr.aria-expanded]="showTooltip">
      <span class="body-icon-badge" [ngClass]="type">
        <svg *ngIf="type === 'universal'" [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>

        <svg *ngIf="type === 'human'" [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>

        <svg *ngIf="type === 'astartes'" [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          <path d="M12 8v8M8 12h8"></path>
        </svg>

        <svg *ngIf="type === 'spell'" [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
          <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 0 4 19.5z"></path>
          <path d="M8 2v20"></path>
        </svg>

        <svg *ngIf="type === 'fellgor'" [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 10c-1.5-1-3.5-3.5-3-6 2.5.5 4.5 2 5 4"></path>
          <path d="M17 10c1.5-1 3.5-3.5 3-6-2.5.5-4.5 2-5 4"></path>
          <path d="M7 10c0-2 1.5-4 5-4s5 2 5 4v3c0 4-2.5 7-5 7s-5-3-5-7v-3z"></path>
          <path d="M10 14h.01M14 14h.01"></path>
          <path d="M11 17c.6.5 1.4.5 2 0"></path>
        </svg>

        <svg *ngIf="type === 'ork'" [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 11c-2.3-1.7-3.8-3.8-3.5-6 2.8.1 4.8 1.4 6 3.3"></path>
          <path d="M17 11c2.3-1.7 3.8-3.8 3.5-6-2.8.1-4.8 1.4-6 3.3"></path>
          <path d="M7 11c0-2.6 2.2-4.6 5-4.6s5 2 5 4.6v3.2c0 3.6-2.2 6.3-5 6.3s-5-2.7-5-6.3V11z"></path>
          <path d="M9.2 14.2h.01M14.8 14.2h.01"></path>
          <path d="M10 16.8c1.2.9 2.8.9 4 0"></path>
          <path d="M8.4 12.4l-1.3 1.1M15.6 12.4l1.3 1.1"></path>
        </svg>

        <svg *ngIf="type === 'aetherwing'" [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="10" cy="12" r="5"></circle>
          <circle cx="11.5" cy="10.7" r="0.7" fill="currentColor" stroke="none"></circle>
          <path d="M14.6 11l6-1.8-5.4 4.6z"></path>
        </svg>

        <svg *ngIf="type === 'plant'" [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 20v-8"></path>
          <path d="M12 12c-3 0-6-2.6-6-6 3.6-.2 6 2 6 6z"></path>
          <path d="M12 12c3 0 6-2.6 6-6-3.6-.2-6 2-6 6z"></path>
        </svg>
      </span>
      <span *ngIf="showTooltip" class="body-icon-tooltip">{{ label }}</span>
    </button>
  `
})
export class BodyTypeIconComponent {
  private static activeTooltipOwner: BodyTypeIconComponent | null = null;

  @Input({ required: true }) type!: BodyTypeKey;
  @Input() size = 14;
  showTooltip = false;

  constructor(private elementRef: ElementRef<HTMLElement>) {}

  toggleTooltip(event: MouseEvent): void {
    event.stopPropagation();
    const willOpen = !this.showTooltip;

    if (BodyTypeIconComponent.activeTooltipOwner && BodyTypeIconComponent.activeTooltipOwner !== this) {
      BodyTypeIconComponent.activeTooltipOwner.closeTooltip();
    }

    this.showTooltip = willOpen;
    BodyTypeIconComponent.activeTooltipOwner = willOpen ? this : null;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.closeTooltip();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeTooltip();
  }

  ngOnDestroy(): void {
    if (BodyTypeIconComponent.activeTooltipOwner === this) {
      BodyTypeIconComponent.activeTooltipOwner = null;
    }
  }

  private closeTooltip(): void {
    this.showTooltip = false;
    if (BodyTypeIconComponent.activeTooltipOwner === this) {
      BodyTypeIconComponent.activeTooltipOwner = null;
    }
  }

  get label(): string {
    switch (this.type) {
      case 'universal':
        return 'Universal';
      case 'human':
        return 'Human';
      case 'astartes':
        return 'Astartes';
      case 'spell':
        return 'Spell';
      case 'fellgor':
        return 'Fellgor';
      case 'ork':
        return 'Ork';
      case 'aetherwing':
        return 'Aetherwing';
      case 'plant':
        return 'Plant';
    }
  }
}
