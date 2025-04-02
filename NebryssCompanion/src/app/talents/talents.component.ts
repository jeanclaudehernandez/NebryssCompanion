import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../data.service';
import { ScrollSection, Talent, TalentCategory } from '../model';
import { ScrollNavComponent } from '../scroll-nav/scroll-nav.component';

@Component({
  selector: 'app-talents',
  standalone: true,
  imports: [CommonModule, ScrollNavComponent],
  templateUrl: './talents.component.html',
  styleUrls: ['./talents.component.css']
})
export class TalentsComponent {
  talentCategories: TalentCategory[] = [];
  scrollSections: ScrollSection[] = [];

  constructor(private dataService: DataService) {}

  ngOnInit() {
    this.dataService.getTalents().subscribe(talents => {
      this.talentCategories = talents;
      this. scrollSections = this.talentCategories.map((category: TalentCategory) => {
        return {
          title: category.name,
          id: category.id
        }
      })
    });
  }

  getRequirementNames(requirementIds: string[]): string {
    const allTalents = this.talentCategories.flatMap(cat => cat.talents);
    return requirementIds.map(id => {
      const talent = allTalents.find(t => t.id === id);
      return talent ? talent.name : id;
    }).join(', ');
  }
}