import { Routes } from '@angular/router';
import { LoreComponent } from './lore/lore.component';
import { LocationsComponent } from './locations/locations.component';
import { TerrainsComponent } from './terrains/terrains.component';

export const routes: Routes = [
  { path: 'lore', component: LoreComponent },
  { path: 'locations', component: LocationsComponent },
  { path: 'terrains', component: TerrainsComponent },
];
