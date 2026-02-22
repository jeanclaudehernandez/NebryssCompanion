import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { UpdateService } from './update.service';
import { ModalService } from './modal.service';
import { ThemeService } from './theme.service';

describe('AppComponent', () => {
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
      'close'
    ]);

    mockThemeService = jasmine.createSpyObj('ThemeService', [
      'toggleTheme'
    ], {
      darkMode$: {
        subscribe: () => ({ unsubscribe() {} })
      }
    });

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        { provide: UpdateService, useValue: mockUpdateService },
        { provide: ModalService, useValue: mockModalService },
        { provide: ThemeService, useValue: mockThemeService }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

});
