// modal.component.ts
import { ChangeDetectorRef, Component, TemplateRef, ViewChild, ViewContainerRef } from '@angular/core';

@Component({
  selector: 'app-modal',
  standalone: true,
  template: `
    <div class="modal-overlay" [class]="getOverlayClasses()" (click)="close()">
      <div class="modal-content" [class]="getContentClasses()" (click)="$event.stopPropagation()" [style.width]="width" [style.height]="height">
        <ng-container #modalContent></ng-container>
        <button *ngIf="showCloseButton" class="modal-close" (click)="close()">&times;</button>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 2000;
    }
    
    .modal-close {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      padding: 0.25rem 0.5rem;
    }

    :host-context(.dark-theme) .modal-overlay {
      background-color: rgba(0, 0, 0, 0.7);
    }

    :host-context(.dark-theme) .modal-content {
      background-color: #1f1f1f;
      color: #e0e0e0;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.6);
    }
  `]
})
export class ModalComponent {
  @ViewChild('modalContent', { read: ViewContainerRef }) viewContainerRef!: ViewContainerRef;
  close: () => void = () => { };
  width: string = '90%';
  height: string = 'auto';
  overlayClass = '';
  contentClass = '';
  showCloseButton = true;

  constructor(private cdr: ChangeDetectorRef) { }

  getOverlayClasses(): string {
    return ['modal-overlay', this.overlayClass].filter(Boolean).join(' ');
  }

  getContentClasses(): string {
    return ['modal-content', this.contentClass].filter(Boolean).join(' ');
  }

  setTemplate(template: TemplateRef<any>, context?: any) {
    if (this.viewContainerRef) {
      this.viewContainerRef.clear();
      this.viewContainerRef.createEmbeddedView(template, context);
      this.cdr.detectChanges();
      setTimeout(() => {
        const autofocusEl = this.viewContainerRef.element.nativeElement.parentElement?.querySelector('[autofocus]') as HTMLElement;
        autofocusEl?.focus();
      }, 0);
    }
  }
}
