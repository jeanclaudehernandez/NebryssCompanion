import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WeaponDisplayComponent } from './weapon-display.component';

describe('WeaponDisplayComponent', () => {
  let component: WeaponDisplayComponent;
  let fixture: ComponentFixture<WeaponDisplayComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WeaponDisplayComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WeaponDisplayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
