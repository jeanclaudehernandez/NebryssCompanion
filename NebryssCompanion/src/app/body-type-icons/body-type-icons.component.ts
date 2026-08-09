import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { BodyTypeIconComponent, BodyTypeKey } from '../body-type-icon/body-type-icon.component';

@Component({
  selector: 'app-body-type-icons',
  standalone: true,
  imports: [CommonModule, BodyTypeIconComponent],
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
    }
  `],
  template: `
    <ng-container *ngIf="iconTypes.length; else fallback">
      <span class="body-icons-container">
        <app-body-type-icon
          *ngFor="let type of iconTypes"
          [type]="type"
          [size]="size">
        </app-body-type-icon>
      </span>
    </ng-container>

    <ng-template #fallback>
      <span>{{ fallbackText }}</span>
    </ng-template>
  `
})
export class BodyTypeIconsComponent {
  @Input() value: string | string[] | null | undefined;
  @Input() size = 14;
  @Input() emptyText = '-';

  private readonly orderedMatchers: ReadonlyArray<{ type: BodyTypeKey; aliases: string[] }> = [
    { type: 'universal', aliases: ['universal'] },
    { type: 'human', aliases: ['human'] },
    { type: 'astartes', aliases: ['astartes'] },
    { type: 'spell', aliases: ['spell'] },
    { type: 'fellgor', aliases: ['fellgor'] },
    { type: 'ork', aliases: ['ork'] },
    { type: 'aetherwing', aliases: ['aetherwing', 'aethering'] },
    { type: 'plant', aliases: ['plant'] },
    { type: 'rat', aliases: ['rat', 'skaven', 'rodent'] }
  ];

  get iconTypes(): BodyTypeKey[] {
    const haystack = this.normalizedValue;
    if (!haystack) {
      return [];
    }

    return this.orderedMatchers
      .filter(({ aliases }) => aliases.some(alias => haystack.includes(alias)))
      .map(({ type }) => type);
  }

  get fallbackText(): string {
    if (this.value == null || this.value === '') {
      return this.emptyText;
    }

    if (Array.isArray(this.value)) {
      return this.value.join(', ');
    }

    return String(this.value);
  }

  private get normalizedValue(): string {
    if (Array.isArray(this.value)) {
      return this.value.join(', ').toLowerCase();
    }

    return String(this.value ?? '').toLowerCase();
  }
}
