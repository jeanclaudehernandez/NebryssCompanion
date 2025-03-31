import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../data.service';

@Component({
  selector: 'app-talents',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './talents.component.html',
  styleUrls: ['./talents.component.css']
})
export class TalentsComponent {
  talentCategories: any[] = [];

  constructor(private dataService: DataService) {}

  ngOnInit() {
    this.dataService.getTalents().subscribe(talents => {
      this.talentCategories = talents;
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