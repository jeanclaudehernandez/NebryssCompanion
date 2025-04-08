// image-viewer.component.ts
import { Component, Inject, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-image-viewer',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule],
  template: `
    <div class="image-container" *ngIf="imageUrl">
      <img 
        [src]="thumbnailUrl || imageUrl" 
        (click)="openDialog()" 
        class="thumbnail-image"
        [class.clickable]="showFullImageOnClick"
        [alt]="altText || 'Image'"
        loading="lazy"
        fetchpriority="low"
      >
    </div>
  `,
  styles: [`
    .image-container {
      display: inline-block;
      margin: 5px;
    }
    .thumbnail-image {
      max-height: 100px;
      max-width: 100px;
      object-fit: contain;
    }
    .clickable {
      cursor: pointer;
      transition: transform 0.2s;
    }
    .clickable:hover {
      transform: scale(1.05);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ImageViewerComponent {
  @Input() imageUrl?: string;
  @Input() thumbnailUrl?: string;
  @Input() altText?: string;
  @Input() showFullImageOnClick = true;

  constructor(private dialog: MatDialog) {}

  openDialog() {
    if (!this.showFullImageOnClick || !this.imageUrl) return;

    const dialogRef = this.dialog.open(ImageViewDialogComponent, {
      data: {
        imageUrl: this.imageUrl,
        altText: this.altText
      },
      panelClass: 'image-dialog-container',
      hasBackdrop: true,
      backdropClass: 'image-dialog-backdrop',
      disableClose: true
    });

    setTimeout(() => {
        dialogRef.disableClose = false;
    }, 0);
  }
}

@Component({
  selector: 'app-image-view-dialog',
  template: `
    <div class="image-dialog-wrapper">
      <img 
        [src]="data.imageUrl" 
        [alt]="data.altText || 'Full size image'" 
        class="full-size-image"
        loading="lazy"
      >
    </div>
  `,
  styles: [`
    .image-dialog-wrapper {
      display: flex;
      justify-content: center;
      align-items: center;
      width: 100%;
      height: 100%;
    }
    .full-size-image {
      max-height: 80vh;
      max-width: 80vw;
      object-fit: contain;
    }
  `],
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
class ImageViewDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: { imageUrl: string; altText?: string }) {}
}