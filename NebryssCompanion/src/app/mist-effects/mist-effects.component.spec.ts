import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MistEffectsComponent } from './mist-effects.component';
import { DataService } from '../data.service';
import { of } from 'rxjs';

describe('MistEffectsComponent', () => {
  let component: MistEffectsComponent;
  let fixture: ComponentFixture<MistEffectsComponent>;
  let mockDataService: jasmine.SpyObj<DataService>;

  beforeEach(async () => {
    mockDataService = jasmine.createSpyObj('DataService', ['getMistEffects']);
    mockDataService.getMistEffects.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [MistEffectsComponent],
      providers: [
        { provide: DataService, useValue: mockDataService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(MistEffectsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
}); 