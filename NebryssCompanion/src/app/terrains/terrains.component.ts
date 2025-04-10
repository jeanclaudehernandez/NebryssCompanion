import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ImageViewerComponent } from '../image-viewer/image-viewer.component';
import { ScrollNavComponent } from '../scroll-nav/scroll-nav.component';
import { ThemeService } from '../theme.service';
import { DataService } from '../data.service';
import { Terrain, ScrollSection } from '../model';

@Component({
  selector: 'app-terrains',
  standalone: true,
  imports: [
    CommonModule,
    ImageViewerComponent,
    ScrollNavComponent
  ],
  templateUrl: './terrains.component.html',
  styleUrls: ['./terrains.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class TerrainsComponent implements OnInit {
  terrains: Terrain[] = [];
  scrollSections: ScrollSection[] = [];
  isDarkMode = false;

  constructor(
    private dataService: DataService,
    private themeService: ThemeService
  ) { }

  ngOnInit(): void {
    // Load terrain data using the data service
    this.dataService.getTerrains().subscribe(data => {
      this.terrains = data;
      
      // Create scroll sections
      this.scrollSections = this.terrains.map(terrain => ({
        title: terrain.name,
        id: `terrain-${terrain.id}`
      }));
    });

    // Subscribe to theme changes
    this.themeService.darkMode$.subscribe(isDark => {
      this.isDarkMode = isDark;
    });
  }
} 