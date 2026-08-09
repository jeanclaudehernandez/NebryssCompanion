import { Component, ViewEncapsulation, Output, EventEmitter, Input, ChangeDetectorRef, OnInit, OnChanges, SimpleChanges, DestroyRef, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DataService } from '../data.service';
import { AdminService } from '../admin.service';
import { ToastService } from '../toast.service';
import { CapitalCasePipe } from '../capital-case.pipe';
import { ImageViewerComponent } from '../image-viewer/image-viewer.component';
import { ScrollNavComponent } from '../scroll-nav/scroll-nav.component';
import { Lore, ScrollSection, Locations, Location } from '../model';

export interface BookChapter {
  id: string;
  title: string;
  subtitle: string;
  roman: string;
  icon: string;
  key: string;
}

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
export class LoreComponent implements OnInit, OnChanges {
  @Input() initialFactionName: string | null = null;
  @Output() navigateToLocation = new EventEmitter<string>();

  private readonly destroyRef = inject(DestroyRef);

  loreData!: Lore;
  locationsData!: Locations;
  isAdmin = false;
  viewMode: 'book' | 'scroll' = 'book';
  activeChapterIndex = 0;

  chapters: BookChapter[] = [
    { id: 'prologue', title: 'The World & The Mist', subtitle: 'Geography, Warp Anomalies & Trade Routes', roman: 'PROLOGUE', icon: 'public', key: 'world' },
    { id: 'factions', title: 'The Five Factions', subtitle: 'Imperium, Accord, Cabal, Republic & Corsairs', roman: 'CHAPTER I', icon: 'shield', key: 'factions' },
    { id: 'technology', title: 'Technology & Mist-Weaving', subtitle: 'Flying Ships, Mist Engines & Shamanic Rituals', roman: 'CHAPTER II', icon: 'auto_awesome', key: 'technology' },
    { id: 'daily-life', title: 'Trade, Currency & Life', subtitle: 'Mistral Coin, Settlements & Infrastructure', roman: 'CHAPTER III', icon: 'monetization_on', key: 'dailyLife' },
    { id: 'struggle', title: 'Chronicles & Legends', subtitle: 'The Great Struggle, Story Hooks & Endgame', roman: 'CHAPTER IV', icon: 'auto_stories', key: 'struggle' }
  ];

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

  // Touch swipe support
  private touchStartX = 0;
  private touchEndX = 0;

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
          }, 150);
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

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialFactionName'] && this.initialFactionName && this.loreData) {
      this.scrollToFaction(this.initialFactionName);
    }
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (this.viewMode !== 'book') return;
    if (event.key === 'ArrowRight' || event.key === 'PageDown') {
      this.nextChapter();
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      this.prevChapter();
    }
  }

  onTouchStart(event: TouchEvent) {
    this.touchStartX = event.changedTouches[0].screenX;
  }

  onTouchEnd(event: TouchEvent) {
    this.touchEndX = event.changedTouches[0].screenX;
    this.handleSwipe();
  }

  private handleSwipe() {
    const swipeThreshold = 50;
    if (this.touchEndX < this.touchStartX - swipeThreshold) {
      this.nextChapter();
    }
    if (this.touchEndX > this.touchStartX + swipeThreshold) {
      this.prevChapter();
    }
  }

  toggleViewMode(mode: 'book' | 'scroll') {
    this.viewMode = mode;
    this.cdr.markForCheck();
  }

  selectChapter(index: number) {
    if (index >= 0 && index < this.chapters.length) {
      this.activeChapterIndex = index;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      this.cdr.markForCheck();
    }
  }

  nextChapter() {
    if (this.activeChapterIndex < this.chapters.length - 1) {
      this.selectChapter(this.activeChapterIndex + 1);
    }
  }

  prevChapter() {
    if (this.activeChapterIndex > 0) {
      this.selectChapter(this.activeChapterIndex - 1);
    }
  }

  scrollToFaction(factionName: string) {
    this.activeChapterIndex = 1; // Chapter I: Factions
    this.cdr.markForCheck();

    setTimeout(() => {
      const factionId = 'faction-' + factionName.toLowerCase().replace(/\s+/g, '-');
      const element = document.getElementById(factionId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        element.classList.add('highlight-faction');
        setTimeout(() => {
          element.classList.remove('highlight-faction');
        }, 2000);
      }
    }, 200);
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
    const worldData = this.loreData?.world || (this.loreData as any)?.planet;
    if (!worldData) {
      return;
    }

    this.loreSections = [
      {
        title: 'World',
        content: worldData,
        key: 'world',
        imgUrl: worldData.imgUrl,
        thumbnail: worldData.thumbnail
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
      { title: 'World', id: 'world' },
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