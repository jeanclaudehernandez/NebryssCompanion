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
    <h2 mat-dialog-title>{{ data.insufficientPoints ? 'Insufficient Talent Points' : 'Missing Requirements' }}</h2>
    <div mat-dialog-content>
      <div *ngIf="!data.insufficientPoints">
        <p>You cannot select "{{data.talentName}}" because you don't have the required talents:</p>
        <p class="missing-talents">{{data.missingTalents}}</p>
      </div>
      <div *ngIf="data.insufficientPoints">
        <p>You cannot select "{{data.talentName}}" because you don't have enough talent points.</p>
        <p>Required: <span class="points-required">{{data.required}}</span></p>
        <p>Available: <span class="points-available">{{data.available}}</span></p>
      </div>
    </div>
    <div mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Close</button>
    </div>
  `,
  styles: [`
    .missing-talents {
      font-weight: bold;
      color: #e74c3c;
    }
    .points-required {
      font-weight: bold;
      color: #e74c3c;
    }
    .points-available {
      font-weight: bold;
      color: #3498db;
    }
  `],
  standalone: true,
  imports: [CommonModule, MatDialogModule]
})
export class TalentRequirementsDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<TalentRequirementsDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData
  ) {}
} 