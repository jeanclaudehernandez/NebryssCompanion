import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, ViewChild, ElementRef, HostListener, TemplateRef } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { UpdateService } from '../update.service';
import { ModalService } from '../modal.service';
import { ThemeService } from '../theme.service';
import { AdminService } from '../admin.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent {
  @ViewChild('sidebar') sidebarElement!: ElementRef;
  @ViewChild('burger') burgerElement!: ElementRef;
  @ViewChild('confirmDialog') confirmDialogTemplate!: TemplateRef<any>;
  @ViewChild('adminDialog') adminDialogTemplate!: TemplateRef<any>;
  @Output() viewChange = new EventEmitter<'players' | 'bestiary' | 'items' | 'shops' | 'lore' | 'locations' | 'talents' | 'mistEffects' | 'terrains' | 'mistEngineBattles' | 'weaponRules' | 'alteredStates' | 'afflictions'>();
  isOpen = false;
  isDarkMode = false;
  isAdmin = false;

  constructor(
    private matDialog: MatDialog,
    public updateService: UpdateService,
    private modalService: ModalService,
    public themeService: ThemeService,
    private adminService: AdminService
  ) {
    this.themeService.darkMode$.subscribe(isDark => {
      this.isDarkMode = isDark;
    });
    
    this.adminService.isAdmin$.subscribe(isAdmin => {
      this.isAdmin = isAdmin;
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    // Handle sidebar closing
    if (this.isOpen && !this.isClickInside(event)) {
      this.isOpen = false;
    }
    
    // Close MatDialog dialogs
    this.matDialog.openDialogs.forEach((dialog) => {
      if(!dialog.disableClose) {
        dialog.close();
      }
    });
    
    // Close the modal if user clicked on the overlay or outside of any modal content
    /*if (!this.isModalClick(event)) {
      this.modalService.close();
    }*/
  }

  private isClickInside(event: MouseEvent): boolean {
    const clickedInsideSidebar = this.sidebarElement?.nativeElement.contains(event.target as Node);
    const clickedInsideBurger = this.burgerElement?.nativeElement.contains(event.target as Node);
    return clickedInsideSidebar || clickedInsideBurger;
  }

  private isModalClick(event: MouseEvent): boolean {
    // Check if click was inside modal content (not on the overlay)
    const modalContent = document.querySelector('.modal-content');
    return modalContent?.contains(event.target as Node) || false;
  }

  toggleMenu() {
    this.isOpen = !this.isOpen;
  }

  changeView(view: 'players' | 'bestiary' | 'items' | 'shops' | 'lore' | 'locations' | 'talents' | 'mistEffects' | 'terrains' | 'mistEngineBattles' | 'weaponRules' | 'alteredStates' | 'afflictions') {
    this.viewChange.emit(view);
    this.toggleMenu();
  }

  forceUpdate() {
    this.updateService.unregisterAndReload();
  }

  clearStorageAndUpdate() {
    const dialogContext = {
      confirm: () => {
        this.modalService.close();
        this.updateService.clearStorageAndReload();
      },
      cancel: () => {
        this.modalService.close();
      }
    };
    
    this.modalService.openFromTemplate(this.confirmDialogTemplate, dialogContext);
  }

  toggleTheme() {
    this.themeService.toggleTheme();
  }

  toggleAdmin() {
    if (this.isAdmin) {
      this.adminService.setAdminStatus(false);
    } else {
      const dialogContext = {
        check: (password: string) => {
          if (password === '2602') {
            this.adminService.setAdminStatus(true);
            this.modalService.close();
          } else {
            alert('Incorrect password');
          }
        },
        cancel: () => {
          this.modalService.close();
        }
      };
      this.modalService.openFromTemplate(this.adminDialogTemplate, dialogContext);
    }
  }
}
