import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-talent-requirements-dialog',
  template: `
    <h2 mat-dialog-title>Missing Requirements</h2>
    <div mat-dialog-content>
      <p>You cannot select "{{data.talentName}}" because you don't have the required talents:</p>
      <p class="missing-talents">{{data.missingTalents}}</p>
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
  `],
  standalone: true,
  imports: [CommonModule, MatDialogModule]
})
export class TalentRequirementsDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<TalentRequirementsDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { talentName: string, missingTalents: string }
  ) {}
} 