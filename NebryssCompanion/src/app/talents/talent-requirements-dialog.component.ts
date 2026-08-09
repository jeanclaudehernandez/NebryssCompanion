import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

interface DialogData {
  talentName: string;
  missingTalents?: string;
  insufficientPoints?: boolean;
  required?: number;
  available?: number;
}

@Component({
  selector: 'app-talent-requirements-dialog',
  template: `
    <h2 mat-dialog-title class="dialog-heading">{{ data.insufficientPoints ? 'Insufficient Talent Points' : 'Missing Requirements' }}</h2>
    <div mat-dialog-content class="dialog-body">
      @if (!data.insufficientPoints) {
        <p class="dialog-desc">You cannot select <strong>"{{data.talentName}}"</strong> because you don't have the required talents:</p>
        <div class="missing-talents-box">
          <span class="missing-talents">{{data.missingTalents}}</span>
        </div>
      }
      @if (data.insufficientPoints) {
        <p class="dialog-desc">You cannot select <strong>"{{data.talentName}}"</strong> because you don't have enough talent points.</p>
        <div class="points-breakdown">
          <div class="point-row">
            <span>Required:</span>
            <span class="points-required">{{data.required}}</span>
          </div>
          <div class="point-row">
            <span>Available:</span>
            <span class="points-available">{{data.available}}</span>
          </div>
        </div>
      }
    </div>
    <div mat-dialog-actions align="end" class="dialog-actions-container">
      <button mat-button mat-dialog-close class="dialog-close-btn">Close</button>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      color: inherit;
      padding: 10px;

      .mat-mdc-dialog-title::before {
        height: 0px
      }
    }
    .dialog-heading {
      margin: 0;
      padding: 0;
      font-size: 1.2rem;
      font-weight: 600;
      
    }
    .dialog-body {
      padding: 8px 0 !important;
      font-size: 0.95rem;
      line-height: 1.5;
    }
    .dialog-desc {
      margin: 0 0 10px 0;
    }
    .missing-talents-box {
      display: flex;
      align-items: center;
      padding: 8px 12px;
      background: rgba(231, 76, 60, 0.15);
      border: 1px solid rgba(231, 76, 60, 0.4);
      border-radius: 6px;
    }
    .missing-talents {
      font-weight: bold;
      color: #ff6b6b;
    }
    .points-breakdown {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .point-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .points-required {
      font-weight: bold;
      color: #ff6b6b;
    }
    .points-available {
      font-weight: bold;
      color: #38bdf8;
    }
    .dialog-actions-container {
      padding: 10px 0 0 0 !important;
      min-height: auto;
    }
    .dialog-close-btn {
      padding: 6px 18px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      letter-spacing: 0.5px;
      transition: all 0.2s ease;
    }
  `],
  standalone: true,
  imports: [CommonModule, MatDialogModule]
})
export class TalentRequirementsDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<TalentRequirementsDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData
  ) { }
} 