import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({
  name: 'safeHtml',
  standalone: true
})
export class SafeHtmlPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(value: string): SafeHtml {
    // Convert markdown-style bold (**text**) to HTML <strong> tags
    if (value) {
      value = value.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    }
    return this.sanitizer.bypassSecurityTrustHtml(value);
  }
}