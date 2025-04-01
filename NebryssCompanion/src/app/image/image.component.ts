// image-viewer.component.ts
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-image-viewer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="image-viewer">
      <img 
        [src]="thumbnailUrl || imageUrl" 
        (click)="openModal()"
        class="thumbnail"
        [alt]="altText"
      >
      
      <div *ngIf="showModal" class="modal" (click)="closeModal($event)">
        <div class="modal-content">
          <span class="close" (click)="closeModal($event)">&times;</span>
          <img 
            [src]="imageUrl" 
            class="full-image"
            [style.transform]="'scale(' + zoomLevel + ')'"
            [alt]="altText"
          >
          <div class="zoom-controls">
            <button (click)="zoomIn()">+</button>
            <button (click)="zoomOut()">-</button>
            <button (click)="resetZoom()">Reset</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .thumbnail {
      cursor: pointer;
      max-width: 100px;
      max-height: 100px;
      transition: transform 0.2s;
    }
    
    .thumbnail:hover {
      transform: scale(1.05);
    }
    
    .modal {
    position: fixed;
    z-index: 9999; /* Very high to ensure it's on top */
    inset: 0; /* Covers top, right, bottom, left (modern alternative to top:0; left:0; width:100%; height:100%) */
    background-color: rgba(0, 0, 0, 0.9);
    display: flex;
    justify-content: center;
    align-items: center;
    /* Ensure no parent can clip this */
    overflow: auto;
  }

  .modal-content {
    position: relative;
    max-width: 90%;
    max-height: 90%;
    /* Prevent accidental clicks on content from closing modal */
    pointer-events: auto;
  }

  /* Prevent scrolling when modal is open */
  body.modal-open {
    overflow: hidden;
  }
    
    .full-image {
      max-width: 100%;
      max-height: 80vh;
      display: block;
      transition: transform 0.3s;
    }
    
    .close {
      position: absolute;
      top: 15px;
      right: 35px;
      color: #f1f1f1;
      font-size: 40px;
      font-weight: bold;
      cursor: pointer;
    }
    
    .zoom-controls {
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 10px;
      background: rgba(0, 0, 0, 0.7);
      padding: 10px;
      border-radius: 5px;
    }
    
    .zoom-controls button {
      background: #444;
      color: white;
      border: none;
      padding: 5px 10px;
      cursor: pointer;
      border-radius: 3px;
    }
    
    .zoom-controls button:hover {
      background: #666;
    }
  `]
})
export class ImageViewerComponent {
  @Input() imageUrl: string = '';
  @Input() thumbnailUrl: string = '';
  @Input() altText: string = 'Image';
  
  showModal: boolean = false;
  zoomLevel: number = 1;

  openModal() {
    if (this.imageUrl) {
      this.showModal = true;
      document.body.classList.add('modal-open'); // Add class instead of inline style
    }
  }

  closeModal(event: Event) {
    const target = event.target as HTMLElement;
    if (target.classList.contains('modal') || target.classList.contains('close')) {
      this.showModal = false;
      document.body.classList.remove('modal-open');
      this.resetZoom();
    }
  }

  zoomIn() {
    this.zoomLevel += 0.1;
  }

  zoomOut() {
    if (this.zoomLevel > 0.2) {
      this.zoomLevel -= 0.1;
    }
  }

  resetZoom() {
    this.zoomLevel = 1;
  }
}