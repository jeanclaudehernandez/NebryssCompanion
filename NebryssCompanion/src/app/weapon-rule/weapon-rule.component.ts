import { CommonModule } from "@angular/common";
import { Component, Inject, ViewEncapsulation } from "@angular/core";
import { MAT_DIALOG_DATA } from "@angular/material/dialog";
import { SanitizeHtmlPipe } from "../sanitizeHtml.pipe";

@Component({
  selector: 'app-weapon-rule-dialog',
  template: `
    <div class="modal-rule-content">
      <h3>{{ data.rule.name }}</h3>
      <div class="rule-description" [innerHtml]="data.rule.description | sanitizeHtml"></div>
    </div>
  `,
  styles: [`
    .modal-rule-content {
      padding: 0.25rem;
      max-width: 400px;
    }

    body.dark-theme .modal-rule-content {
      background-color: #333;
    }

    .modal-rule-content h3 {
      margin-top: 0;
      color: #333;
    }

    .rule-description {
      white-space: pre-wrap;
      line-height: 1.5;
      color: #666;
      background-color: #f5f5f5;
      padding: 0.5rem;
      border-radius: 4px;
    }

    body.dark-theme .rule-description {
      background-color: #1f1f1f;
      color: #e0e0e0;
      border-color: #444;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    }
  `],
  standalone: true,
  imports: [CommonModule, SanitizeHtmlPipe],
  encapsulation: ViewEncapsulation.None
})
export class WeaponRuleDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: { rule: {name: string, description: string}}) {
  }
}
