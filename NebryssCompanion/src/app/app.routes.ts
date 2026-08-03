import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'lore',
    loadComponent: () => import('./lore/lore.component').then(m => m.LoreComponent)
  },
  {
    path: 'locations',
    loadComponent: () => import('./locations/locations.component').then(m => m.LocationsComponent)
  },
  {
    path: 'terrains',
    loadComponent: () => import('./terrains/terrains.component').then(m => m.TerrainsComponent)
  },
];
