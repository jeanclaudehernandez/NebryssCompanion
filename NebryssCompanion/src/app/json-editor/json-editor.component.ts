import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, AfterViewInit, OnChanges, SimpleChanges, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as Prism from 'prismjs';
import 'prismjs/components/prism-json';

@Component({
  selector: 'app-json-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="editor-container">
      <pre class="highlight-layer" aria-hidden="true"><code #codeElement class="language-json"></code></pre>
      <textarea 
        #textareaElement
        [(ngModel)]="value" 
        (ngModelChange)="onValueChange($event)"
        (scroll)="syncScroll()"
        spellcheck="false"
        class="edit-layer"></textarea>
    </div>
  `,
  styles: [`
    .editor-container {
      position: relative;
      width: 100%;
      height: 80vh;
      border: 1px solid #ccc;
      border-radius: 4px;
      overflow: hidden;
      background-color: #f5f5f5;
    }

    .highlight-layer, .edit-layer {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 10px;
      border: none;
      box-sizing: border-box;
      font-family: 'Consolas', 'Monaco', 'Andale Mono', 'Ubuntu Mono', monospace;
      font-size: 14px;
      line-height: 1.5;
      white-space: pre;
      overflow: auto;
      tab-size: 2;
    }

    .highlight-layer {
      z-index: 1;
      pointer-events: none;
      background-color: #f5f5f5;
      color: #333;
    }

    .edit-layer {
      z-index: 2;
      background: transparent;
      color: transparent;
      caret-color: #333; /* Cursor color */
      resize: none;
      outline: none;
    }

    /* PrismJS Theme is loaded globally via angular.json */
  `],
  encapsulation: ViewEncapsulation.None
})
export class JsonEditorComponent implements AfterViewInit, OnChanges {
  @Input() value: string = '';
  @Output() valueChange = new EventEmitter<string>();
  
  @ViewChild('codeElement') codeElement!: ElementRef;
  @ViewChild('textareaElement') textareaElement!: ElementRef;

  ngAfterViewInit() {
    this.highlight();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['value'] && !changes['value'].firstChange) {
      this.highlight();
    }
  }

  onValueChange(newValue: string) {
    this.value = newValue;
    this.valueChange.emit(newValue);
    this.highlight();
  }

  highlight() {
    if (this.codeElement && this.codeElement.nativeElement) {
      const code = this.value || '';
      const html = Prism.highlight(code, Prism.languages['json'], 'json');
      // console.log('Highlighted HTML:', html); // Debugging
      this.codeElement.nativeElement.innerHTML = html + '<br>';
    }
  }

  syncScroll() {
    if (this.textareaElement && this.codeElement) {
      const textarea = this.textareaElement.nativeElement;
      const pre = this.codeElement.nativeElement.parentElement;
      pre.scrollTop = textarea.scrollTop;
      pre.scrollLeft = textarea.scrollLeft;
    }
  }
}
