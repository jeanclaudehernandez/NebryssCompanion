import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MistEffectsComponent } from './mist-effects.component';
import { DataService } from '../data.service';
import { AdminService } from '../admin.service';
import { MistStateService, emptyMistState } from '../mist-state.service';
import { BehaviorSubject, of } from 'rxjs';
import { MistEffect, MistState } from '../model';

describe('MistEffectsComponent', () => {
  let component: MistEffectsComponent;
  let fixture: ComponentFixture<MistEffectsComponent>;
  let mockDataService: any;
  let state$: BehaviorSubject<MistState>;
  let mockMistState: any;
  let isAdmin$: BehaviorSubject<boolean>;

  const effects: MistEffect[] = [
    { effectName: 'Veil', densityLevel: 'Light', description: '' },
    { effectName: 'Haze', densityLevel: 'Light', description: '' },
    { effectName: 'Drift', densityLevel: 'Medium', description: '' },
    { effectName: 'Anomaly', densityLevel: 'Dense', description: '' }
  ];

  beforeEach(async () => {
    mockDataService = {
      getMistEffects: jasmine.createSpy().and.returnValue(of(effects)),
      mistEffects$: of(effects),
      getPlayers: jasmine.createSpy().and.returnValue(of([]))
    };
    state$ = new BehaviorSubject<MistState>(emptyMistState());
    mockMistState = {
      state$,
      get state() { return state$.value; },
      refresh: jasmine.createSpy().and.returnValue(of(emptyMistState())),
      save: jasmine.createSpy().and.callFake((s: MistState) => { state$.next(s); return of(s); }),
      roll: MistStateService.prototype.roll
    };
    isAdmin$ = new BehaviorSubject<boolean>(false);
    const mockAdmin = { isAdmin$, get isAdmin() { return isAdmin$.value; } };

    await TestBed.configureTestingModule({
      imports: [MistEffectsComponent],
      providers: [
        { provide: DataService, useValue: mockDataService },
        { provide: MistStateService, useValue: mockMistState },
        { provide: AdminService, useValue: mockAdmin }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(MistEffectsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows active effects to players without GM controls', () => {
    state$.next({ ...emptyMistState(), density: 'Light', activeEffects: ['Veil'] });
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.mist-active-list')?.textContent).toContain('Veil');
    expect(el.querySelector('.mist-gm')).toBeNull();
    expect(component.isActive(effects[0])).toBeTrue();
    component.toggle(effects[1]);
    expect(mockMistState.save).not.toHaveBeenCalled();
  });

  it('lets the GM toggle a row', () => {
    isAdmin$.next(true);
    fixture.detectChanges();
    component.toggle(effects[2]);
    expect(state$.value.activeEffects).toEqual(['Drift']);
    component.toggle(effects[2]);
    expect(state$.value.activeEffects).toEqual([]);
  });

  it('rolls the counts of each tier up to the density', () => {
    isAdmin$.next(true);
    fixture.detectChanges();
    component.setDensity('Dense');
    const active = state$.value.activeEffects;
    // Dense: 1 Dense, 2 Medium (only 1 exists), 2 Light.
    expect(active.length).toBe(4);
    expect(active).toContain('Anomaly');
    expect(active).toContain('Drift');
    component.setDensity('Light');
    expect(state$.value.activeEffects.sort()).toEqual(['Haze', 'Veil']);
    component.setDensity('');
    expect(state$.value.activeEffects).toEqual([]);
  });
});
