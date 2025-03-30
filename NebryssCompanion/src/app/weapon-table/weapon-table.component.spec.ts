import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WeaponTableComponent } from './weapon-table.component';

describe('WeaponTableComponent', () => {
  let component: WeaponTableComponent;
  let fixture: ComponentFixture<WeaponTableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WeaponTableComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WeaponTableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
