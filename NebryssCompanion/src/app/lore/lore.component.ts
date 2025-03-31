import { Component, ViewEncapsulation } from '@angular/core';
import { DataService } from '../data.service';
import { CommonModule, NgFor } from '@angular/common';
import { CapitalCasePipe } from '../capital-case.pipe';

@Component({
  selector: 'app-lore',
  imports: [CommonModule, NgFor, CapitalCasePipe],
  standalone: true,
  templateUrl: './lore.component.html',
  styleUrls: ['./lore.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class LoreComponent {
  loreData: any;
  loreSections: {title: string, content: any, key: string}[] = [];
  public Array = Array;
  public Object = Object;
  public standardFactionSections = [
    'name',
    'goals',
    'challenges',
    'mistKnowledge',
    'peopleIdentity',
    'capital',
    'notableIslands',
    'control',
    'role',
    'notableOrganizations'
  ];
  public prohibitedSections = [
    'storyHooks',
    'potentialEndgameScenarios',
    'mistBasedGameplayMechanics',
  ];

  constructor(private dataService: DataService) {}

  ngOnInit() {
    this.dataService.getLore().subscribe(data => {
      this.loreData = data;
      this.prepareLoreSections();
    });
  }

  isStandardSection(section: string) {
    return !!this.standardFactionSections.find((standard) => standard == section )
  }

  isProhibitedSection(section: string) {
    return !!this.prohibitedSections.find((prohibited) => prohibited == section);
  }

  prepareLoreSections() {
    if (!this.loreData?.planetOverview) return;
    
    const overview = this.loreData.planetOverview;
    this.loreSections = [
      {
        title: 'Planet',
        content: overview.planet,
        key: 'planet'
      },
      {
        title: 'Currency',
        content: overview.currency,
        key: 'currency'
      },
      {
        title: 'Mist Effects',
        content: overview.mistEffects,
        key: 'mistEffects'
      },
      {
        title: 'Technology and Infrastructure',
        content: overview.technologyAndInfrastructure,
        key: 'technologyAndInfrastructure'
      },
      {
        title: 'Daily Life',
        content: overview.dailyLife,
        key: 'dailyLife'
      },
      {
        title: 'Factions',
        content: {factions: overview.factions},
        key: 'factions'
      },
      {
        title: 'Struggle for Nebryss',
        content: {struggle: overview.struggleForNebryss},
        key: 'struggleForNebryss'
      },
      {
        title: 'Story Hooks',
        content: {hooks: overview.storyHooks},
        key: 'storyHooks'
      },
      {
        title: 'Potential Endgame Scenarios',
        content: {endgames: overview.potentialEndgameScenarios},
        key: 'potentialEndgameScenarios'
      }
    ];
  }

  formatLoreContent(content: any): string {
    if (!content) return '';
    
    if (typeof content === 'string') {
      return `<p>${content}</p>`;
    }

    if (Array.isArray(content)) {
      return content.map(item => {
        if (typeof item === 'string') {
          return `<p>${item}</p>`;
        } else {
          return this.formatObjectContent(item);
        }
      }).join('');
    }
    
    return this.formatObjectContent(content);
  }

  formatObjectContent(obj: any): string {
    let html = '';
    for (const key in obj) {
      if (typeof obj[key] === 'string' && key != 'imgUrl') {
        html += `<div class="sub-section"><h3>${this.formatKey(key)}</h3><p>${obj[key]}</p></div>`;
      } else if (Array.isArray(obj[key])) {
        html += `<div class="sub-section"><h3>${this.formatKey(key)}</h3>`;
        obj[key].forEach((item: any) => {
          if (typeof item === 'string') {
            html += `<p>${item}</p>`;
          } else {
            html += this.formatObjectContent(item);
          }
        });
        html += `</div>`;
      } else if (typeof obj[key] === 'object') {
        html += `<div class="sub-section"><h3>${this.formatKey(key)}</h3>${this.formatObjectContent(obj[key])}</div>`;
      } else if (key === 'imgUrl' && obj[key]) {
        html += `<img class="location-image" src="${obj[key]}"/>`;
      }
    }
    return html;
  }

  formatKey(key: string): string {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  }
}