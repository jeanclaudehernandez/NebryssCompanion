import { Injectable } from '@angular/core';

// Keeps pan/zoom across navigation since @if destroys/recreates WorldMapComponent
@Injectable({ providedIn: 'root' })
export class WorldMapStateService {
  scale = 1;
  translateX = 0;
  translateY = 0;
}
