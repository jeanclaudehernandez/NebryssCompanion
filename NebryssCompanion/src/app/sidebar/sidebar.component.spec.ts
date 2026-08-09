import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SidebarComponent } from './sidebar.component';
import { UpdateService } from '../update.service';
import { ModalService } from '../modal.service';
import { ThemeService } from '../theme.service';

describe('SidebarComponent', () => {
  let component: SidebarComponent;
  let fixture: ComponentFixture<SidebarComponent>;
  let mockUpdateService: jasmine.SpyObj<UpdateService>;
  let mockModalService: jasmine.SpyObj<ModalService>;
  let mockThemeService: jasmine.SpyObj<ThemeService>;

  beforeEach(async () => {
    mockUpdateService = jasmine.createSpyObj('UpdateService', [
      'unregisterAndReload',
      'clearStorageAndReload'
    ]);

    mockModalService = jasmine.createSpyObj('ModalService', [
      'openFromTemplate',
      'close',
      'isOpen'
    ]);

    mockThemeService = jasmine.createSpyObj('ThemeService', [
      'toggleTheme'
    ], {
      darkMode$: {
        subscribe: () => ({ unsubscribe() {} })
      }
    });

    await TestBed.configureTestingModule({
      imports: [SidebarComponent],
      providers: [
        { provide: UpdateService, useValue: mockUpdateService },
        { provide: ModalService, useValue: mockModalService },
        { provide: ThemeService, useValue: mockThemeService }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SidebarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
