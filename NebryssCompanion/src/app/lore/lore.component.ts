import { Component, ViewEncapsulation } from '@angular/core';
import { DataService } from '../data.service';
import { CommonModule, NgFor } from '@angular/common';
import { CapitalCasePipe } from '../capital-case.pipe';
import { ImageViewerComponent } from '../image-viewer/image-viewer.component';
import { ScrollNavComponent } from '../scroll-nav/scroll-nav.component';
import { Lore, ScrollSection } from '../model';

@Component({
  selector: 'app-lore',
  imports: [
    CommonModule,
    NgFor,
    CapitalCasePipe,
    ImageViewerComponent,
    ScrollNavComponent
  ],
  standalone: true,
  templateUrl: './lore.component.html',
  styleUrls: ['./lore.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class LoreComponent {
  loreData!: Lore;
  loreSections: {
    title: string,
    content: any,
    key: string,
    imgUrl?: string,
    thumbnail?: string
  }[] = [];
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
  scrollSections: ScrollSection[] = [];

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
        key: 'planet',
        imgUrl: overview.planet.imgUrl,
        thumbnail: overview.planet.thumbnail
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
    this.scrollSections = [
      {
        title: 'Planet', id: 'planet'
      },{
        title: 'Currency', id: 'currency'
      },{
        title: 'Mist Effects', id: 'mistEffects'
      },{
        title: 'Technology and Infrastructure', id: 'technologyAndInfrastructure'
      },
      {
        title: 'Factions', id: 'factions'
      },
      ...overview.factions.map((faction: any) => ({
      title: faction.name,
      id: `faction-${faction.name.toLowerCase().replace(/\s+/g, '-')}`
    })),
    {
      title: 'Struggle for Nebryss', id: 'struggleForNebryss'
    },
  ];
  }

  factionScrollId(faction: any): string{
    return 'faction-' + faction.name.toLowerCase().replace(/\s+/g, '-')
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
      if (typeof obj[key] === 'string' && key != 'imgUrl' && key != 'thumbnail') {
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
      } 
    }
    return html;
  }

  formatKey(key: string): string {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  }
}