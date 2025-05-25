import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScrollNavComponent } from '../scroll-nav/scroll-nav.component';
import { ScrollSection } from '../model';
import { SafeHtmlPipe } from '../safe-html.pipe';
import { GenericTableComponent } from '../generic-table/generic-table.component';
import { MistEngineBattles, mistEngineBattlesData } from './mist-engine-battles.data';


@Component({
  selector: 'app-mist-engine-battles',
  standalone: true,
  imports: [CommonModule, ScrollNavComponent, SafeHtmlPipe, GenericTableComponent],
  templateUrl: './mist-engine-battles.component.html',
  styleUrls: ['./mist-engine-battles.component.css']
})
export class MistEngineBattlesComponent implements OnInit {
  mistEngineBattles: MistEngineBattles | null = null;
  scrollSections: ScrollSection[] = [];

  constructor() {}

  transformTableData(rows: string[][]): any[] {
    return rows.map(row => ({
      col1: row[0],
      col2: row[1]
    }));
  }

  ngOnInit(): void {
    // Use imported data directly instead of HTTP request
    this.mistEngineBattles = mistEngineBattlesData;
    
    // Initialize table states in local storage if not present
    if (this.mistEngineBattles.sections) {
      this.mistEngineBattles.sections.forEach((section, index) => {
        const storageKey = `mist-engine-${section.title}`;
        if (!localStorage.getItem(storageKey)) {
          localStorage.setItem(storageKey, JSON.stringify(false));
        }
        
        if (section.subsections) {
          section.subsections.forEach(subsection => {
            const subStorageKey = `mist-engine-${subsection.title}`;
            if (!localStorage.getItem(subStorageKey)) {
              localStorage.setItem(subStorageKey, JSON.stringify(false));
            }
          });
        }
      });
    }
    
    // Create scroll sections
    this.scrollSections = [
      { title: 'Introduction', id: 'introduction' }
    ];
    
    
    // Add main sections
    if (this.mistEngineBattles.sections) {
      this.mistEngineBattles.sections.forEach((section, index) => {
        this.scrollSections.push({
          title: section.title,
          id: `section-${index}`
        });
        
        // Add subsections if they exist
        if (section.subsections) {
          section.subsections.forEach((subsection, subIndex) => {
            this.scrollSections.push({
              title: subsection.title,
              id: `subsection-${index}-${subIndex}`
            });
          });
        }
      });
    }
  }
}
