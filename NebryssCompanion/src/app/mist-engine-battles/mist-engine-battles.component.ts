import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScrollNavComponent } from '../scroll-nav/scroll-nav.component';
import { ScrollSection } from '../model';
import { SafeHtmlPipe } from '../safe-html.pipe';
import { MistEngineBattles, mistEngineBattlesData } from './mist-engine-battles.data';


@Component({
  selector: 'app-mist-engine-battles',
  standalone: true,
  imports: [CommonModule, ScrollNavComponent, SafeHtmlPipe],
  templateUrl: './mist-engine-battles.component.html',
  styleUrls: ['./mist-engine-battles.component.css']
})
export class MistEngineBattlesComponent implements OnInit {
  mistEngineBattles: MistEngineBattles | null = null;
  scrollSections: ScrollSection[] = [];

  constructor() {}

  ngOnInit(): void {
    // Use imported data directly instead of HTTP request
    this.mistEngineBattles = mistEngineBattlesData;
    
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
