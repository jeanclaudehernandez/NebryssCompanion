import { Component, ViewEncapsulation, Output, EventEmitter, Input, ChangeDetectorRef, OnInit, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DataService } from '../data.service';
import { AdminService } from '../admin.service';
import { ToastService } from '../toast.service';
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
export class LoreComponent implements OnInit {
  @Input() initialFactionName: string | null = null;
  @Output() navigateToLocation = new EventEmitter<string>();

  private readonly destroyRef = inject(DestroyRef);

  loreData!: Lore;
  locationsData!: Locations;
  isAdmin = false;

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
    'thumbnail',
    'privateNotes',
    'isSecretRevealed'
  ];

  public prohibitedSections = [
    'storyHooks',
    'potentialEndgameScenarios',
    'mistBasedGameplayMechanics',
    'chroniclesOfNebryss'
  ];

  scrollSections: ScrollSection[] = [];

  constructor(
    private dataService: DataService,
    private adminService: AdminService,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.adminService.isAdmin$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(isAdmin => {
        this.isAdmin = isAdmin;
        this.cdr.markForCheck();
      });

    this.dataService.getLore().subscribe({
      next: (data) => {
        this.loreData = data;
        this.prepareLoreSections();
        this.cdr.markForCheck();
        
        if (this.initialFactionName) {
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
      element.classList.add('highlight-faction');
      setTimeout(() => {
        element.classList.remove('highlight-faction');
      }, 2000);
    }
  }

  isStandardSection(section: string): boolean {
    return !!this.standardFactionSections.find((standard) => standard === section);
  }

  isProhibitedSection(section: string): boolean {
    return !!this.prohibitedSections.find((prohibited) => prohibited === section);
  }

  getLocationsByFaction(factionName: string): Location[] {
    if (!this.locationsData?.locations) return [];
    return this.locationsData.locations.filter(location =>
      location.faction === factionName &&
      (this.isAdmin || !location.isSecret || location.isSecretRevealed)
    );
  }

  getFactionCapital(factionName: string): Location | undefined {
    if (!this.locationsData?.locations) return undefined;
    return this.locationsData.locations.find(location => 
      location.faction === factionName && location.isCapital &&
      (this.isAdmin || !location.isSecret || location.isSecretRevealed)
    );
  }

  onCapitalClick(locationName: string) {
    this.navigateToLocation.emit(locationName);
  }

  toggleSecrecy(item: any, titleName: string): void {
    if (!this.isAdmin || !item) {
      return;
    }

    item.isSecretRevealed = !item.isSecretRevealed;

    this.dataService.updateLore(this.loreData).subscribe({
      next: () => {
        this.toastService.show(
          item.isSecretRevealed
            ? `Secret lore for ${titleName} is now REVEALED to players!`
            : `Secret lore for ${titleName} is now HIDDEN from players (GM only).`,
          'info'
        );
        this.cdr.markForCheck();
      },
      error: err => {
        this.toastService.show(`Failed to save lore secrecy: ${err?.message || err}`, 'error');
      }
    });
  }

  prepareLoreSections() {
    if (!this.loreData?.planet) {
      return;
    }
    
    this.loreSections = [
      {
        title: 'Planet',
        content: this.loreData.planet,
        key: 'planet',
        imgUrl: this.loreData.planet.imgUrl,
        thumbnail: this.loreData.planet.thumbnail
      },
      {
        title: 'Chronicles of Nebryss',
        content: { chronicles: this.loreData.chroniclesOfNebryss || [] },
        key: 'chroniclesOfNebryss'
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
        content: { factions: this.loreData.factions },
        key: 'factions'
      },
      {
        title: 'Struggle for Nebryss',
        content: { struggle: this.loreData.struggleForNebryss },
        key: 'struggleForNebryss'
      },
      {
        title: 'Story Hooks',
        content: { hooks: this.loreData.storyHooks },
        key: 'storyHooks'
      },
      {
        title: 'Potential Endgame Scenarios',
        content: { endgames: this.loreData.potentialEndgameScenarios },
        key: 'potentialEndgameScenarios'
      }
    ];

    this.scrollSections = [
      { title: 'Planet', id: 'planet' },
      { title: 'Chronicles of Nebryss', id: 'chroniclesOfNebryss' },
      { title: 'Currency', id: 'currency' },
      { title: 'Mist Effects', id: 'mistEffects' },
      { title: 'Technology and Infrastructure', id: 'technologyAndInfrastructure' },
      { title: 'Factions', id: 'factions' },
      ...this.loreData.factions.map((faction: any) => ({
        title: faction.name,
        id: `faction-${faction.name.toLowerCase().replace(/\s+/g, '-')}`
      })),
      { title: 'Struggle for Nebryss', id: 'struggleForNebryss' },
      { title: 'Story Hooks', id: 'storyHooks' },
      { title: 'Potential Endgame Scenarios', id: 'potentialEndgameScenarios' }
    ];
  }

  factionScrollId(faction: any): string {
    return 'faction-' + faction.name.toLowerCase().replace(/\s+/g, '-');
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
      if (key === 'privateNotes' || key === 'isSecretRevealed') {
        continue;
      }

      if (typeof obj[key] === 'string' && key !== 'imgUrl' && key !== 'thumbnail') {
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