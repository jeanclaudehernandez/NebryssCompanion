import {
  ChangeDetectorRef,
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
  @Input() selectedNpcName: string | null = null;
  @Input() selectedShopName: string | null = null;
  @Input() selectedBestiaryId: number | null = null;
  @Input() selectedItemName: string | null = null;
  @Input() selectedLetterId: number | null = null;
  @Input() selectedLetterSubject: string | null = null;
  @Input() selectedSessionId: number | null = null;
  @Input() expandedSessionIds: number[] = [];
  @Input() selectedSessionScrollY: number | null = null;
  @Input() adminEditSession: AdminEditorSession | null = null;
  @Input() adminLocationDraft: { mapX: number | null; mapY: number | null; location: Location | null } | null = null;

  @Output() viewChange = new EventEmitter<AppView>();
  @Output() openAdminEditor = new EventEmitter<AdminEditorSession>();
  @Output() navigateToLocation = new EventEmitter<{ locationName: string; backTarget: string | null }>();
  @Output() navigateToWorldMap = new EventEmitter<string>();
  @Output() navigateToLore = new EventEmitter<string>();
  @Output() navigateToShop = new EventEmitter<{ shopId?: number; shopName?: string }>();
  @Output() navigateToNpc = new EventEmitter<{ npcId?: number; npcName?: string }>();
  @Output() navigateToBestiary = new EventEmitter<number>();
  @Output() navigateToItem = new EventEmitter<{ itemId?: number; itemName?: string }>();
  @Output() navigateToLetter = new EventEmitter<{ letterId?: number; letterSubject?: string }>();
  @Output() navigateToAdminLocationCreator = new EventEmitter<{ mapX: number | null; mapY: number | null; location: Location | null }>();
  @Output() sessionStateChange = new EventEmitter<{ selectedSessionId: number | null; expandedSessionIds: number[]; scrollY: number }>();
  @Output() pinSelected = new EventEmitter<string | null>();
  @Output() locationSelected = new EventEmitter<string | null>();
  @Output() npcSelected = new EventEmitter<string | null>();
  @Output() creatureSelected = new EventEmitter<number | null>();
  @Output() shopSelected = new EventEmitter<string | null>();
  @Output() letterSelected = new EventEmitter<{ letterId: number | null; letterSubject: string | null }>();

  @ViewChild('viewHost', { read: ViewContainerRef, static: true })
  private viewHost!: ViewContainerRef;

  private componentRef: ComponentRef<unknown> | null = null;
  private outputSubscriptions: Subscription[] = [];
  private loadSequence = 0;

  constructor(private cdr: ChangeDetectorRef) {}

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
    npcs: () => import('./npcs/npcs.component').then(m => m.NpcsComponent),
    adminItemCreator: () => import('./item-admin-page/item-admin-page.component').then(m => m.ItemAdminPageComponent),
    adminLocationCreator: () => import('./location-admin-page/location-admin-page.component').then(m => m.LocationAdminPageComponent),
    adminPlayerEditor: () => import('./player-admin-page/player-admin-page.component').then(m => m.PlayerAdminPageComponent),
    adminNpcEditor: () => import('./npc-admin-page/npc-admin-page.component').then(m => m.NpcAdminPageComponent),
    adminShopEditor: () => import('./shop-admin-page/shop-admin-page.component').then(m => m.ShopAdminPageComponent),
    adminCreatureEditor: () => import('./creature-admin-page/creature-admin-page.component').then(m => m.CreatureAdminPageComponent),
    adminCampaignEditor: () => import('./campaign-admin-page/campaign-admin-page.component').then(m => m.CampaignAdminPageComponent),
    adminRulesEditor: () => import('./rules-admin-page/rules-admin-page.component').then(m => m.RulesAdminPageComponent),
    adminSessionEditor: () => import('./session-admin-page/session-admin-page.component').then(m => m.SessionAdminPageComponent),
    campaignSessions: () => import('./campaign-sessions/campaign-sessions.component').then(m => m.CampaignSessionsComponent),
    aiSessionManager: () => import('./ai-session-manager/ai-session-manager.component').then(m => m.AiSessionManagerComponent)
  };

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['view'] || !this.componentRef) {
      void this.loadView();
      return;
    }

    this.applyInputs();
    this.componentRef?.changeDetectorRef.detectChanges();
    this.cdr.markForCheck();
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
    this.componentRef.changeDetectorRef.detectChanges();
    this.cdr.markForCheck();
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
      case 'letters':
        subscribeToOutput('letterSelected', target => this.letterSelected.emit(target));
        break;
      case 'bestiary':
        subscribeToOutput('navigateToNpc', target => this.navigateToNpc.emit(target));
        subscribeToOutput('creatureSelected', id => this.creatureSelected.emit(id));
        break;
      case 'items':
        subscribeToOutput('openAdminEditor', session => this.openAdminEditor.emit(session));
        break;
      case 'shops':
        subscribeToOutput('navigateToLocation', locationName =>
          this.navigateToLocation.emit({ locationName, backTarget: null })
        );
        subscribeToOutput('navigateToNpc', target => this.navigateToNpc.emit(target));
        subscribeToOutput('openAdminEditor', session => this.openAdminEditor.emit(session));
        subscribeToOutput('shopSelected', shopName => this.shopSelected.emit(shopName));
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
        subscribeToOutput('navigateToShop', target => this.navigateToShop.emit(target));
        subscribeToOutput('navigateToNpc', target => this.navigateToNpc.emit(target));
        subscribeToOutput('locationSelected', locName => this.locationSelected.emit(locName));
        break;
      case 'npcs':
        subscribeToOutput('navigateToLocation', target => this.navigateToLocation.emit(target));
        subscribeToOutput('navigateToWorldMap', locationName => this.navigateToWorldMap.emit(locationName));
        subscribeToOutput('navigateToShop', target => this.navigateToShop.emit(target));
        subscribeToOutput('navigateToLore', factionName => this.navigateToLore.emit(factionName));
        subscribeToOutput('openAdminEditor', session => this.openAdminEditor.emit(session));
        subscribeToOutput('navigateToBestiary', bestiaryId => this.navigateToBestiary.emit(bestiaryId));
        subscribeToOutput('npcSelected', npcName => this.npcSelected.emit(npcName));
        break;
      case 'campaignSessions':
        subscribeToOutput('viewChange', view => this.viewChange.emit(view));
        subscribeToOutput('openAdminEditor', session => this.openAdminEditor.emit(session));
        subscribeToOutput('navigateToNpc', target => this.navigateToNpc.emit(target));
        subscribeToOutput('navigateToLocation', target => this.navigateToLocation.emit(target));
        subscribeToOutput('navigateToShop', target => this.navigateToShop.emit(target));
        subscribeToOutput('navigateToBestiary', bestiaryId => this.navigateToBestiary.emit(bestiaryId));
        subscribeToOutput('navigateToItem', target => this.navigateToItem.emit(target));
        subscribeToOutput('navigateToLetter', target => this.navigateToLetter.emit(target));
        subscribeToOutput('sessionStateChange', state => this.sessionStateChange.emit(state));
        break;
      case 'aiSessionManager':
        subscribeToOutput('viewChange', view => this.viewChange.emit(view));
        break;
      case 'adminSessionEditor':
        subscribeToOutput('viewChange', view => this.viewChange.emit(view));
        break;
      case 'worldMap':
        subscribeToOutput('navigateToLocation', locationName =>
          this.navigateToLocation.emit({ locationName, backTarget: 'worldMap' })
        );
        subscribeToOutput('navigateToLore', factionName => this.navigateToLore.emit(factionName));
        subscribeToOutput('navigateToAdminLocationCreator', coords =>
          this.navigateToAdminLocationCreator.emit(coords)
        );
        subscribeToOutput('pinSelected', pinName => this.pinSelected.emit(pinName));
        break;
      case 'adminLocationCreator':
        subscribeToOutput('navigateToWorldMap', locationName => this.navigateToWorldMap.emit(locationName));
        break;
    }
  }

  private applyInputs(): void {
    if (!this.componentRef) {
      return;
    }

    switch (this.view) {
      case 'campaignSessions':
        this.componentRef.setInput('initialSessionId', this.selectedSessionId);
        this.componentRef.setInput('initialExpandedSessionIds', this.expandedSessionIds);
        this.componentRef.setInput('initialScrollY', this.selectedSessionScrollY);
        break;
      case 'bestiary':
        this.componentRef.setInput('initialBestiaryId', this.selectedBestiaryId);
        break;
      case 'items':
        this.componentRef.setInput('initialItemName', this.selectedItemName);
        this.componentRef.setInput('initialSearchQuery', this.selectedItemName);
        break;
      case 'letters':
        this.componentRef.setInput('initialLetterId', this.selectedLetterId);
        this.componentRef.setInput('initialLetterSubject', this.selectedLetterSubject);
        break;
      case 'lore':
        this.componentRef.setInput('initialFactionName', this.selectedFactionName);
        break;
      case 'locations':
        this.componentRef.setInput('initialLocationName', this.selectedLocationName);
        this.componentRef.setInput('backTarget', this.selectedLocationBackTarget);
        break;
      case 'shops':
        this.componentRef.setInput('initialShopName', this.selectedShopName);
        break;
      case 'npcs':
        this.componentRef.setInput('initialNpcName', this.selectedNpcName);
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
      case 'adminNpcEditor':
        if (this.adminEditSession?.mode === 'npc') {
          this.componentRef.setInput('initialNpc', this.adminEditSession.npc);
        }
        break;
      case 'adminShopEditor':
        if (this.adminEditSession?.mode === 'shop') {
          this.componentRef.setInput('initialShop', this.adminEditSession.shop);
        }
        break;
      case 'adminCreatureEditor':
        if (this.adminEditSession?.mode === 'creature') {
          this.componentRef.setInput('initialCreature', this.adminEditSession.creature);
        }
        break;
      case 'adminSessionEditor':
        if (this.adminEditSession?.mode === 'session') {
          this.componentRef.setInput('initialSession', this.adminEditSession.session);
        }
        break;
    }
  }
}
