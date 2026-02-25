// modal.component.ts
import { AfterViewInit, ChangeDetectorRef, Component, TemplateRef, ViewChild, ViewContainerRef } from '@angular/core';

@Component({
  selector: 'app-modal',
  standalone: true,
  template: `
    <div class="modal-overlay" (click)="close()">
      <div class="modal-content" (click)="$event.stopPropagation()" [style.width]="width" [style.height]="height">
        <ng-container #modalContent></ng-container>
        <button class="modal-close" (click)="close()">&times;</button>
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
      z-index: 1000;
    }
    
    .modal-content {
      background-color: white;
      padding: 2rem;
      border-radius: 8px;
      max-width: 98vw;
      width: 90%;
      max-height: 98vh;
      overflow-y: auto;
      position: relative;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
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
  close: () => void = () => {};
  width: string = '90%';
  height: string = 'auto';

  constructor(private cdr: ChangeDetectorRef) {}

  setTemplate(template: TemplateRef<any>, context?: any) {
    if (this.viewContainerRef) {
      this.viewContainerRef.clear();
      const viewRef = this.viewContainerRef.createEmbeddedView(template, context);
      this.cdr.detectChanges();
    }
  }
}
