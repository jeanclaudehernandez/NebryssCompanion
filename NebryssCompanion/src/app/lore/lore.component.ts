import { Component, ViewEncapsulation, Output, EventEmitter, Input, ChangeDetectorRef } from '@angular/core';
import { DataService } from '../data.service';
import { CommonModule } from '@angular/common';
import { CapitalCasePipe } from '../capital-case.pipe';
import { ImageViewerComponent } from '../image-viewer/image-viewer.component';
import { ScrollNavComponent } from '../scroll-nav/scroll-nav.component';
import { Lore, ScrollSection, Locations, Location } from '../model';

@Component({
  selector: 'app-lore',
  imports: [
    CommonModule,
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
  @Input() initialFactionName: string | null = null;
  @Output() navigateToLocation = new EventEmitter<string>();
  loreData!: Lore;
  locationsData!: Locations;
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
    'control',
    'role',
    'notableOrganizations',
    'image',
    'thumbnail'
  ];
  public prohibitedSections = [
    'storyHooks',
    'potentialEndgameScenarios',
    'mistBasedGameplayMechanics',
  ];
  scrollSections: ScrollSection[] = [];

  constructor(
    private dataService: DataService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.dataService.getLore().subscribe({
      next: (data) => {
        this.loreData = data;
        this.prepareLoreSections();
        this.cdr.markForCheck();
        
        if (this.initialFactionName) {
          // Allow time for view to render
          setTimeout(() => {
            this.scrollToFaction(this.initialFactionName!);
          }, 100);
        }
      },
      error: (err) => console.error('Error loading lore:', err)
    });

    this.dataService.getLocations().subscribe({
      next: (locations) => {
        this.locationsData = locations;
        this.cdr.markForCheck();
      },
      error: (err) => console.error('Error loading locations:', err)
    });
  }

  scrollToFaction(factionName: string) {
    const factionId = 'faction-' + factionName.toLowerCase().replace(/\s+/g, '-');
    const element = document.getElementById(factionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Add a highlight effect
      element.classList.add('highlight-faction');
      setTimeout(() => {
        element.classList.remove('highlight-faction');
      }, 2000);
    }
  }

  isStandardSection(section: string) {
    return !!this.standardFactionSections.find((standard) => standard == section )
  }

  isProhibitedSection(section: string) {
    return !!this.prohibitedSections.find((prohibited) => prohibited == section);
  }

  getLocationsByFaction(factionName: string): Location[] {
    if (!this.locationsData?.locations) return [];
    return this.locationsData.locations.filter(location => location.faction === factionName);
  }

  getFactionCapital(factionName: string): Location | undefined {
    if (!this.locationsData?.locations) return undefined;
    return this.locationsData.locations.find(location => 
      location.faction === factionName && location.isCapital
    );
  }

  getFactionIslands(factionName: string): Location[] {
    if (!this.locationsData?.locations) return [];
    return this.locationsData.locations.filter(location => 
      location.faction === factionName && !location.isCapital
    );
  }

  onCapitalClick(locationName: string) {
    this.navigateToLocation.emit(locationName);
  }

  prepareLoreSections() {
    if (!this.loreData?.planet) {
      return
    };
    
    this.loreSections = [
      {
        title: 'Planet',
        content: this.loreData.planet,
        key: 'planet',
        imgUrl: this.loreData.planet.imgUrl,
        thumbnail: this.loreData.planet.thumbnail
      },
      {
        title: 'Currency',
        content: this.loreData.currency,
        key: 'currency'
      },
      {
        title: 'Mist Effects',
        content: this.loreData.mistEffects,
        key: 'mistEffects'
      },
      {
        title: 'Technology and Infrastructure',
        content: this.loreData.technologyAndInfrastructure,
        key: 'technologyAndInfrastructure'
      },
      {
        title: 'Daily Life',
        content: this.loreData.dailyLife,
        key: 'dailyLife'
      },
      {
        title: 'Factions',
        content: {factions: this.loreData.factions},
        key: 'factions'
      },
      {
        title: 'Struggle for Nebryss',
        content: {struggle: this.loreData.struggleForNebryss},
        key: 'struggleForNebryss'
      },
      {
        title: 'Story Hooks',
        content: {hooks: this.loreData.storyHooks},
        key: 'storyHooks'
      },
      {
        title: 'Potential Endgame Scenarios',
        content: {endgames: this.loreData.potentialEndgameScenarios},
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
      ...this.loreData.factions.map((faction: any) => ({
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