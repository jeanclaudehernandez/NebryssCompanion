import { Routes } from '@angular/router';
import { LoreComponent } from './lore/lore.component';
import { LocationsComponent } from './locations/locations.component';

export const routes: Routes = [
  { path: 'lore', component: LoreComponent },
  { path: 'locations', component: LocationsComponent },
];
