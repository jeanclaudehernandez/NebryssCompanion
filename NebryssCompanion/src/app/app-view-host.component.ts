import {
  Component,
  ComponentRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  Type,
  ViewChild,
  ViewContainerRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { AdminEditorSession } from './admin-editor.models';
import { AppView } from './app-view.types';
import { Location } from './model';

@Component({
  selector: 'app-view-host',
  standalone: true,
  imports: [CommonModule],
  template: '<ng-template #viewHost></ng-template>',
  styles: [':host { display: block; }']
})
export class AppViewHostComponent implements OnChanges, OnDestroy {
  @Input() view!: AppView;
  @Input() selectedLocationName: string | null = null;
  @Input() selectedLocationBackTarget: string | null = null;
  @Input() selectedWorldMapLocationName: string | null = null;
  @Input() selectedFactionName: string | null = null;
  @Input() selectedRuleName: string | null = null;
  @Input() selectedStateName: string | null = null;
  @Input() adminEditSession: AdminEditorSession | null = null;
  @Input() adminLocationDraft: { mapX: number | null; mapY: number | null; location: Location | null } | null = null;

  @Output() viewChange = new EventEmitter<AppView>();
  @Output() openAdminEditor = new EventEmitter<AdminEditorSession>();
  @Output() navigateToLocation = new EventEmitter<{ locationName: string; backTarget: string | null }>();
  @Output() navigateToWorldMap = new EventEmitter<string>();
  @Output() navigateToLore = new EventEmitter<string>();
  @Output() navigateToAdminLocationCreator = new EventEmitter<{ mapX: number | null; mapY: number | null; location: Location | null }>();

  @ViewChild('viewHost', { read: ViewContainerRef, static: true })
  private viewHost!: ViewContainerRef;

  private componentRef: ComponentRef<unknown> | null = null;
  private outputSubscriptions: Subscription[] = [];
  private loadSequence = 0;

  private readonly componentLoaders: Record<AppView, () => Promise<Type<unknown>>> = {
    players: () => import('./player-list/player-list.component').then(m => m.PlayerListComponent),
    bestiary: () => import('./bestiary/bestiary.component').then(m => m.BestiaryComponent),
    letters: () => import('./letters-page/letters-page.component').then(m => m.LettersPageComponent),
    items: () => import('./items/items.component').then(m => m.ItemsComponent),
    shops: () => import('./shops/shops.component').then(m => m.ShopsComponent),
    lore: () => import('./lore/lore.component').then(m => m.LoreComponent),
    locations: () => import('./locations/locations.component').then(m => m.LocationsComponent),
    worldMap: () => import('./world-map/world-map.component').then(m => m.WorldMapComponent),
    talents: () => import('./talents/talents.component').then(m => m.TalentsComponent),
    mistEffects: () => import('./mist-effects/mist-effects.component').then(m => m.MistEffectsComponent),
    terrains: () => import('./terrains/terrains.component').then(m => m.TerrainsComponent),
    mistEngineBattles: () => import('./mist-engine-battles/mist-engine-battles.component').then(m => m.MistEngineBattlesComponent),
    weaponRules: () => import('./weapon-rules-page/weapon-rules-page.component').then(m => m.WeaponRulesPageComponent),
    alteredStates: () => import('./altered-states-page/altered-states-page.component').then(m => m.AlteredStatesPageComponent),
    afflictions: () => import('./afflictions-list/afflictions-list.component').then(m => m.AfflictionsListComponent),
    shipNavigation: () => import('./ship-navigation/ship-navigation.component').then(m => m.ShipNavigationComponent),
    adminItemCreator: () => import('./item-admin-page/item-admin-page.component').then(m => m.ItemAdminPageComponent),
    adminLocationCreator: () => import('./location-admin-page/location-admin-page.component').then(m => m.LocationAdminPageComponent),
    adminPlayerEditor: () => import('./player-admin-page/player-admin-page.component').then(m => m.PlayerAdminPageComponent)
  };

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['view'] || !this.componentRef) {
      void this.loadView();
      return;
    }

    this.applyInputs();
  }

  ngOnDestroy(): void {
    this.destroyCurrentComponent();
  }

  private async loadView(): Promise<void> {
    const requestId = ++this.loadSequence;
    const loadComponent = this.componentLoaders[this.view];
    const componentType = await loadComponent();

    if (requestId !== this.loadSequence) {
      return;
    }

    this.destroyCurrentComponent();
    this.viewHost.clear();
    this.componentRef = this.viewHost.createComponent(componentType);
    this.bindOutputs();
    this.applyInputs();
  }

  private destroyCurrentComponent(): void {
    this.outputSubscriptions.forEach(subscription => subscription.unsubscribe());
    this.outputSubscriptions = [];
    this.componentRef?.destroy();
    this.componentRef = null;
  }

  private bindOutputs(): void {
    if (!this.componentRef) {
      return;
    }

    const instance = this.componentRef.instance as Record<string, unknown>;
    const subscribeToOutput = (outputName: string, handler: (value: any) => void) => {
      const emitter = instance[outputName] as { subscribe?: (fn: (value: any) => void) => Subscription } | undefined;
      if (!emitter?.subscribe) {
        return;
      }
      this.outputSubscriptions.push(emitter.subscribe(handler));
    };

    switch (this.view) {
      case 'players':
        subscribeToOutput('navigateToTalents', () => this.viewChange.emit('talents'));
        break;
      case 'items':
        subscribeToOutput('openAdminEditor', session => this.openAdminEditor.emit(session));
        break;
      case 'shops':
        subscribeToOutput('navigateToLocation', locationName =>
          this.navigateToLocation.emit({ locationName, backTarget: null })
        );
        break;
      case 'lore':
        subscribeToOutput('navigateToLocation', locationName =>
          this.navigateToLocation.emit({ locationName, backTarget: null })
        );
        break;
      case 'locations':
        subscribeToOutput('navigateTo', view => this.viewChange.emit(view));
        subscribeToOutput('navigateToWorldMap', locationName => this.navigateToWorldMap.emit(locationName));
        subscribeToOutput('navigateToLore', factionName => this.navigateToLore.emit(factionName));
        break;
      case 'worldMap':
        subscribeToOutput('navigateToLocation', locationName =>
          this.navigateToLocation.emit({ locationName, backTarget: 'worldMap' })
        );
        subscribeToOutput('navigateToLore', factionName => this.navigateToLore.emit(factionName));
        subscribeToOutput('navigateToAdminLocationCreator', coords =>
          this.navigateToAdminLocationCreator.emit(coords)
        );
        break;
    }
  }

  private applyInputs(): void {
    if (!this.componentRef) {
      return;
    }

    switch (this.view) {
      case 'lore':
        this.componentRef.setInput('initialFactionName', this.selectedFactionName);
        break;
      case 'locations':
        this.componentRef.setInput('initialLocationName', this.selectedLocationName);
        this.componentRef.setInput('backTarget', this.selectedLocationBackTarget);
        break;
      case 'worldMap':
        this.componentRef.setInput('focusLocationName', this.selectedWorldMapLocationName);
        break;
      case 'weaponRules':
        this.componentRef.setInput('initialRuleName', this.selectedRuleName);
        break;
      case 'alteredStates':
        this.componentRef.setInput('initialStateName', this.selectedStateName);
        break;
      case 'adminItemCreator':
        this.componentRef.setInput('editSession', this.adminEditSession);
        break;
      case 'adminLocationCreator':
        this.componentRef.setInput('initialMapX', this.adminLocationDraft?.mapX ?? null);
        this.componentRef.setInput('initialMapY', this.adminLocationDraft?.mapY ?? null);
        this.componentRef.setInput('initialLocation', this.adminLocationDraft?.location ?? null);
        break;
    }
  }
}
